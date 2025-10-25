use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

use crate::models::{Account, Provider};
use aes_gcm::{
    aead::{generic_array::typenum::Unsigned, Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use once_cell::sync::OnceCell;
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use secrecy::{ExposeSecret, SecretVec};
use serde_json::{self, Value};
use sha2::{Digest, Sha256};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use tauri::AppHandle;
type Result<T> = std::result::Result<T, StorageError>;

#[derive(thiserror::Error, Debug)]
pub enum StorageError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("key error: {0}")]
    Key(String),
    #[error("encryption error")]
    Encryption,
    #[error("decryption error")]
    Decryption,
    #[error("serialization error: {0}")]
    Serialization(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub enum SenderStatus {
    Allowed,
    Blocked,
    Neutral,
}

impl SenderStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SenderStatus::Allowed => "allowed",
            SenderStatus::Blocked => "blocked",
            SenderStatus::Neutral => "neutral",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "allowed" => SenderStatus::Allowed,
            "blocked" => SenderStatus::Blocked,
            _ => SenderStatus::Neutral,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MessageInsert {
    pub account_email: String,
    pub uid: String,
    pub sender_display: String,
    pub sender_email: String,
    pub subject: String,
    pub date: Option<String>,
    pub snippet: Option<String>,
    pub body: Option<Vec<u8>>,
    pub flags: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct AnalysisValidation {
    pub validator_model_id: Option<String>,
    pub status: Option<String>,
    pub confidence: Option<f64>,
    pub notes: Option<String>,
    pub validated_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct AnalysisInsert {
    pub account_email: String,
    pub uid: String,
    pub summary: Option<String>,
    pub sentiment: Option<String>,
    pub categories: Vec<String>,
    pub metadata_json: serde_json::Value,
    pub model_id: Option<String>,
    pub analyzed: bool,
    pub analyzed_at: Option<i64>,
    pub analysis_confidence: Option<f64>,
    pub validation: AnalysisValidation,
}

#[derive(Debug, Clone)]
pub struct MessageRow {
    pub id: i64,
    pub uid: String,
    pub subject: String,
    pub sender_display: String,
    pub sender_email: String,
    pub date: Option<String>,
    pub snippet: Option<String>,
    pub status: SenderStatus,
    pub flags: Option<String>,
    pub analysis_summary: Option<String>,
    pub analysis_sentiment: Option<String>,
    pub analysis_categories: Vec<String>,
    pub analysis_metadata: Option<serde_json::Value>,
    pub analysis_model_id: Option<String>,
    pub analysis_analyzed: bool,
    pub analysis_analyzed_at: Option<i64>,
    pub analysis_confidence: Option<f64>,
    pub analysis_validator_model_id: Option<String>,
    pub analysis_validation_status: Option<String>,
    pub analysis_validation_confidence: Option<f64>,
    pub analysis_validation_notes: Option<String>,
    pub analysis_validated_at: Option<i64>,
    pub body_cached: bool,
}

#[derive(Debug, Clone)]
pub struct ExistingAnalysisRecord {
    pub analyzed: bool,
    pub analyzed_at: Option<i64>,
    pub model_id: Option<String>,
    pub categories: Vec<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct MessageForAnalysis {
    pub message_id: i64,
    pub account_email: String,
    pub uid: String,
    pub subject: String,
    pub snippet: Option<String>,
    pub date: Option<String>,
    pub sender_email: String,
    pub sender_display: Option<String>,
    pub existing_analysis: ExistingAnalysisRecord,
}

#[derive(Debug, Clone)]
pub struct SenderGroup {
    pub sender_email: String,
    pub sender_display: String,
    pub status: SenderStatus,
    pub messages: Vec<MessageRow>,
}

#[derive(Debug, Clone)]
pub struct CachedMessageSummary {
    pub uid: String,
    pub subject: String,
    pub sender_email: String,
    pub sender_display: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AccountSyncState {
    pub account_email: String,
    pub last_full_sync: Option<i64>,
    pub last_incremental_sync: Option<i64>,
    pub last_uid: Option<String>,
    pub total_messages: i64,
}

#[derive(Debug, Clone)]
pub struct AccountRecord {
    pub provider: Provider,
    pub email: String,
    pub custom_host: Option<String>,
    pub custom_port: Option<u16>,
}

#[derive(Clone)]
pub struct Storage {
    conn: Arc<parking_lot::Mutex<Connection>>,
    cipher: Arc<Cipher>,
}

struct Cipher {
    key: SecretVec<u8>,
}

static DB_PATH: OnceCell<PathBuf> = OnceCell::new();

fn load_or_create_master_key(dir: &Path) -> Result<Vec<u8>> {
    let key_path = dir.join("master.key");
    if key_path.exists() {
        let key = fs::read(&key_path)?;
        if key.len() != 32 {
            return Err(StorageError::Key("stored key has invalid length".into()));
        }
        Ok(key)
    } else {
        let mut key = vec![0u8; 32];
        OsRng.fill_bytes(&mut key);
        fs::write(&key_path, &key)?;
        #[cfg(unix)]
        {
            let mut perms = fs::metadata(&key_path)?.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&key_path, perms)?;
        }
        Ok(key)
    }
}

fn map_join_error(err: tokio::task::JoinError) -> StorageError {
    StorageError::Io(std::io::Error::new(
        std::io::ErrorKind::Interrupted,
        format!("storage worker panicked: {err}"),
    ))
}

impl Storage {
    pub fn initialize(handle: &AppHandle) -> Result<Self> {
        let data_dir = handle.path_resolver().app_data_dir().ok_or_else(|| {
            StorageError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "App data directory not available",
            ))
        })?;
        fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join("mail_cache.db");
        DB_PATH.set(db_path.clone()).ok();

        let mut connection = Connection::open(&db_path)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "NORMAL")?;
        Self::apply_migrations(&mut connection)?;

        let master_key = load_or_create_master_key(&data_dir)?;
        let cipher = Cipher::from_bytes(master_key)?;

        Ok(Self {
            conn: Arc::new(parking_lot::Mutex::new(connection)),
            cipher: Arc::new(cipher),
        })
    }

    fn apply_migrations(conn: &mut Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_email TEXT NOT NULL,
                uid TEXT NOT NULL,
                sender_email TEXT NOT NULL,
                sender_display TEXT,
                subject_encrypted TEXT,
                date TEXT,
                snippet_encrypted TEXT,
                body_encrypted TEXT,
                flags TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(account_email, uid)
            );

            CREATE INDEX IF NOT EXISTS idx_messages_account_sender
                ON messages(account_email, sender_email);

            CREATE TABLE IF NOT EXISTS sender_status (
                sender_email TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS analysis_results (
                message_id INTEGER PRIMARY KEY,
                summary TEXT,
                sentiment TEXT,
                categories TEXT,
                metadata_json TEXT,
                model_id TEXT,
                analyzed INTEGER NOT NULL DEFAULT 0,
                analyzed_at INTEGER,
                analysis_confidence REAL,
                validator_model_id TEXT,
                validation_status TEXT,
                validation_confidence REAL,
                validation_notes TEXT,
                validated_at INTEGER,
                FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
            );

            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS metadata_json TEXT;
            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS model_id TEXT;
            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS analyzed INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS analyzed_at INTEGER;
            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS analysis_confidence REAL;
            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS validator_model_id TEXT;
            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS validation_status TEXT;
            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS validation_confidence REAL;
            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS validation_notes TEXT;
            ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS validated_at INTEGER;

            CREATE TABLE IF NOT EXISTS account_sync_state (
                account_email TEXT PRIMARY KEY,
                last_full_sync INTEGER,
                last_incremental_sync INTEGER,
                last_uid TEXT,
                total_messages INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS accounts (
                email TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                custom_host TEXT,
                custom_port INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            "#,
        )?;
        Ok(())
    }

    pub async fn upsert_messages(&self, rows: Vec<MessageInsert>) -> Result<()> {
        if rows.is_empty() {
            return Ok(());
        }

        let conn = self.conn.clone();
        let cipher = self.cipher.clone();
        let join_result = tokio::task::spawn_blocking(move || -> Result<()> {
            let now = Utc::now().timestamp();
            let mut conn = conn.lock();
            let tx = conn.transaction()?;
            {
                let mut stmt = tx.prepare(
                    r#"
                    INSERT INTO messages (
                        account_email,
                        uid,
                        sender_email,
                        sender_display,
                        subject_encrypted,
                        date,
                        snippet_encrypted,
                        body_encrypted,
                        flags,
                        created_at,
                        updated_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(account_email, uid) DO UPDATE SET
                        sender_email=excluded.sender_email,
                        sender_display=excluded.sender_display,
                        subject_encrypted=excluded.subject_encrypted,
                        date=excluded.date,
                        snippet_encrypted=excluded.snippet_encrypted,
                        body_encrypted=excluded.body_encrypted,
                        flags=excluded.flags,
                        updated_at=excluded.updated_at
                    "#,
                )?;

                for row in rows {
                    let subject_enc = cipher.encrypt_string(&row.subject)?;
                    let snippet_enc = row
                        .snippet
                        .as_ref()
                        .map(|value| cipher.encrypt_string(value))
                        .transpose()?;
                    let body_enc = row
                        .body
                        .as_ref()
                        .map(|value| cipher.encrypt_bytes(value))
                        .transpose()?;

                    stmt.execute(params![
                        row.account_email,
                        row.uid,
                        row.sender_email.to_lowercase(),
                        row.sender_display,
                        subject_enc,
                        row.date,
                        snippet_enc,
                        body_enc,
                        row.flags,
                        now,
                        now,
                    ])?;
                }
            }
            tx.commit()?;
            Ok(())
        })
        .await
        .map_err(map_join_error)?;

        join_result?;

        Ok(())
    }

    pub async fn grouped_messages_for_account(
        &self,
        account_email: &str,
    ) -> Result<Vec<SenderGroup>> {
        let conn = self.conn.clone();
        let cipher = self.cipher.clone();
        let account = account_email.to_owned();
        let result = tokio::task::spawn_blocking(move || -> Result<Vec<SenderGroup>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                r#"
          SELECT m.id, m.uid, m.sender_email, m.sender_display, m.subject_encrypted, m.date,
              m.snippet_encrypted, m.body_encrypted IS NOT NULL AS body_cached, m.flags,
              COALESCE(ss.status, 'neutral'),
              ar.summary, ar.sentiment, ar.categories,
              ar.metadata_json, ar.model_id, COALESCE(ar.analyzed, 0), ar.analyzed_at,
              ar.analysis_confidence, ar.validator_model_id, ar.validation_status,
              ar.validation_confidence, ar.validation_notes, ar.validated_at
          FROM messages m
          LEFT JOIN sender_status ss ON ss.sender_email = m.sender_email
          LEFT JOIN analysis_results ar ON ar.message_id = m.id
                WHERE m.account_email = ?
                ORDER BY m.sender_email, m.date DESC, m.id DESC
                "#,
            )?;
            let mut rows_iter = stmt.query(params![account])?;

            let mut groups: Vec<SenderGroup> = Vec::new();
            let mut current_sender: Option<String> = None;

            while let Some(row) = rows_iter.next()? {
                let sender_email: String = row.get(2)?;
                let display: String = row
                    .get::<_, Option<String>>(3)?
                    .unwrap_or_else(|| sender_email.clone());
                if current_sender.as_ref() != Some(&sender_email) {
                    current_sender = Some(sender_email.clone());
                    let status_value: String = row.get(9)?;
                    let status = SenderStatus::from_str(&status_value);
                    groups.push(SenderGroup {
                        sender_email: sender_email.clone(),
                        sender_display: display.clone(),
                        status,
                        messages: Vec::new(),
                    });
                }

                let group = groups.last_mut().expect("group should exist after push");

                let subject_enc: String = row.get(4)?;
                let subject = cipher.decrypt_string(&subject_enc)?;
                let snippet_enc: Option<String> = row.get(6)?;
                let snippet = snippet_enc
                    .as_ref()
                    .map(|value| cipher.decrypt_string(value))
                    .transpose()?;

                let body_cached: bool = row.get::<_, i64>(7)? != 0;
                let flags: Option<String> = row.get(8)?;

                let categories_json: Option<String> = row.get(12)?;
                let analysis_categories = categories_json
                    .as_ref()
                    .map(|value| {
                        serde_json::from_str::<Vec<String>>(value)
                            .map_err(|err| StorageError::Serialization(err.to_string()))
                    })
                    .transpose()?
                    .unwrap_or_default();

                let metadata_json: Option<String> = row.get(13)?;
                let analysis_metadata = metadata_json
                    .as_ref()
                    .map(|value| {
                        serde_json::from_str::<Value>(value)
                            .map_err(|err| StorageError::Serialization(err.to_string()))
                    })
                    .transpose()?;

                let analysis_model_id: Option<String> = row.get(14)?;
                let analysis_analyzed_raw: i64 = row.get(15)?;
                let analysis_analyzed = analysis_analyzed_raw != 0;
                let analysis_analyzed_at: Option<i64> = row.get(16)?;
                let analysis_confidence: Option<f64> = row.get(17)?;
                let analysis_validator_model_id: Option<String> = row.get(18)?;
                let analysis_validation_status: Option<String> = row.get(19)?;
                let analysis_validation_confidence: Option<f64> = row.get(20)?;
                let analysis_validation_notes: Option<String> = row.get(21)?;
                let analysis_validated_at: Option<i64> = row.get(22)?;

                let message = MessageRow {
                    id: row.get(0)?,
                    uid: row.get(1)?,
                    sender_email: sender_email.clone(),
                    sender_display: display.clone(),
                    subject,
                    date: row.get(5)?,
                    snippet,
                    flags,
                    status: group.status.clone(),
                    analysis_summary: row.get(10)?,
                    analysis_sentiment: row.get(11)?,
                    analysis_categories,
                    analysis_metadata,
                    analysis_model_id,
                    analysis_analyzed,
                    analysis_analyzed_at,
                    analysis_confidence,
                    analysis_validator_model_id,
                    analysis_validation_status,
                    analysis_validation_confidence,
                    analysis_validation_notes,
                    analysis_validated_at,
                    body_cached,
                };

                group.messages.push(message);
            }

            Ok(groups)
        })
        .await
        .map_err(map_join_error)?;

        result
    }

    pub async fn messages_for_analysis(
        &self,
        account_email: &str,
    ) -> Result<Vec<MessageForAnalysis>> {
        let conn = self.conn.clone();
        let cipher = self.cipher.clone();
        let account = account_email.to_owned();
        let result = tokio::task::spawn_blocking(move || -> Result<Vec<MessageForAnalysis>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT m.id, m.uid, m.subject_encrypted, m.snippet_encrypted, m.date,
                       m.sender_email, m.sender_display,
                       ar.analyzed, ar.analyzed_at, ar.model_id, ar.categories, ar.metadata_json
                FROM messages m
                LEFT JOIN analysis_results ar ON ar.message_id = m.id
                WHERE m.account_email = ?
                ORDER BY m.updated_at DESC, m.id DESC
                "#,
            )?;

            let mut rows = stmt.query(params![account])?;
            let mut messages = Vec::new();

            while let Some(row) = rows.next()? {
                let message_id: i64 = row.get(0)?;
                let uid: String = row.get(1)?;
                let subject_enc: String = row.get(2)?;
                let snippet_enc: Option<String> = row.get(3)?;
                let date: Option<String> = row.get(4)?;
                let sender_email: String = row.get(5)?;
                let sender_display: Option<String> = row.get(6)?;

                let analyzed_raw: Option<i64> = row.get(7)?;
                let analyzed_at: Option<i64> = row.get(8)?;
                let model_id: Option<String> = row.get(9)?;
                let categories_json: Option<String> = row.get(10)?;
                let metadata_json: Option<String> = row.get(11)?;

                let subject = cipher.decrypt_string(&subject_enc)?;
                let snippet = snippet_enc
                    .as_ref()
                    .map(|value| cipher.decrypt_string(value))
                    .transpose()?;

                let categories = categories_json
                    .as_ref()
                    .map(|value| {
                        serde_json::from_str::<Vec<String>>(value)
                            .map_err(|err| StorageError::Serialization(err.to_string()))
                    })
                    .transpose()?
                    .unwrap_or_default();

                let metadata = metadata_json
                    .as_ref()
                    .map(|value| {
                        serde_json::from_str::<Value>(value)
                            .map_err(|err| StorageError::Serialization(err.to_string()))
                    })
                    .transpose()?;

                let existing_analysis = ExistingAnalysisRecord {
                    analyzed: analyzed_raw.unwrap_or_default() != 0,
                    analyzed_at,
                    model_id,
                    categories,
                    metadata,
                };

                messages.push(MessageForAnalysis {
                    message_id,
                    account_email: account.clone(),
                    uid,
                    subject,
                    snippet,
                    date,
                    sender_email,
                    sender_display,
                    existing_analysis,
                });
            }

            Ok(messages)
        })
        .await
        .map_err(map_join_error)?;

        result
    }

    pub async fn message_count_for_account(&self, account_email: &str) -> Result<usize> {
        let conn = self.conn.clone();
        let account = account_email.to_owned();
        let join_result = tokio::task::spawn_blocking(move || -> Result<usize> {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT COUNT(*) FROM messages
                WHERE account_email = ?
                "#,
            )?;

            let count: i64 = stmt.query_row(params![account], |row| row.get(0))?;
            Ok(count.max(0) as usize)
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub async fn recent_message_summaries(
        &self,
        account_email: &str,
        limit: usize,
    ) -> Result<Vec<CachedMessageSummary>> {
        if limit == 0 {
            return Ok(Vec::new());
        }

        let conn = self.conn.clone();
        let cipher = self.cipher.clone();
        let account = account_email.to_owned();
        let limit = limit.min(100_000);

        let result = tokio::task::spawn_blocking(move || -> Result<Vec<CachedMessageSummary>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT uid, sender_email, sender_display, subject_encrypted, date
                FROM messages
                WHERE account_email = ?
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
                "#,
            )?;

            let mut rows = stmt.query(params![account, limit as i64])?;
            let mut items = Vec::new();

            while let Some(row) = rows.next()? {
                let uid: String = row.get(0)?;
                let sender_email: String = row.get(1)?;
                let sender_display: Option<String> = row.get(2)?;
                let subject_enc: String = row.get(3)?;
                let date: Option<String> = row.get(4)?;

                let subject = cipher.decrypt_string(&subject_enc)?;

                items.push(CachedMessageSummary {
                    uid,
                    subject,
                    sender_email,
                    sender_display,
                    date,
                });
            }

            Ok(items)
        })
        .await
        .map_err(map_join_error)?;

        result
    }

    pub async fn latest_uid_for_account(&self, account_email: &str) -> Result<Option<String>> {
        let conn = self.conn.clone();
        let account = account_email.to_owned();
        let join_result = tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT uid FROM messages
                WHERE account_email = ?
                ORDER BY CAST(uid AS INTEGER) DESC, id DESC
                LIMIT 1
                "#,
            )?;

            let uid = stmt
                .query_row(params![account], |row| row.get::<_, String>(0))
                .optional()?;
            Ok(uid)
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub async fn update_sync_state(
        &self,
        account_email: &str,
        last_uid: Option<&str>,
        is_full: bool,
        total_messages: usize,
    ) -> Result<()> {
        let conn = self.conn.clone();
        let account = account_email.to_lowercase();
        let last_uid_owned = last_uid.map(|value| value.to_string());
        let join_result = tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.lock();
            let now = Utc::now().timestamp();
            let last_full = if is_full { Some(now) } else { None };
            let last_incremental = Some(now);

            conn.execute(
                r#"
                INSERT INTO account_sync_state (
                    account_email,
                    last_full_sync,
                    last_incremental_sync,
                    last_uid,
                    total_messages
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(account_email) DO UPDATE SET
                    last_full_sync = COALESCE(excluded.last_full_sync, account_sync_state.last_full_sync),
                    last_incremental_sync = excluded.last_incremental_sync,
                    last_uid = COALESCE(excluded.last_uid, account_sync_state.last_uid),
                    total_messages = excluded.total_messages
                "#,
                params![
                    account,
                    last_full,
                    last_incremental,
                    last_uid_owned,
                    total_messages as i64
                ],
            )?;
            Ok(())
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub async fn account_sync_state(
        &self,
        account_email: &str,
    ) -> Result<Option<AccountSyncState>> {
        let conn = self.conn.clone();
        let account = account_email.to_lowercase();
        let join_result = tokio::task::spawn_blocking(move || -> Result<Option<AccountSyncState>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT account_email, last_full_sync, last_incremental_sync, last_uid, total_messages
                FROM account_sync_state
                WHERE account_email = ?
                "#,
            )?;

            let state = stmt
                .query_row(params![account], |row| {
                    Ok(AccountSyncState {
                        account_email: row.get(0)?,
                        last_full_sync: row.get(1)?,
                        last_incremental_sync: row.get(2)?,
                        last_uid: row.get(3)?,
                        total_messages: row.get::<_, i64>(4)?,
                    })
                })
                .optional()?;
            Ok(state)
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub async fn delete_message(&self, account_email: &str, uid: &str) -> Result<()> {
        let conn = self.conn.clone();
        let account = account_email.to_owned();
        let uid = uid.to_owned();
        let join_result = tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.lock();
            conn.execute(
                "DELETE FROM messages WHERE account_email = ? AND uid = ?",
                params![account, uid],
            )?;
            Ok(())
        })
        .await
        .map_err(map_join_error)?;

        join_result?;

        Ok(())
    }

    pub async fn update_message_body(
        &self,
        account_email: &str,
        uid: &str,
        body: &[u8],
    ) -> Result<()> {
        let conn = self.conn.clone();
        let cipher = self.cipher.clone();
        let account = account_email.to_owned();
        let uid = uid.to_owned();
        let payload = body.to_vec();

        let join_result = tokio::task::spawn_blocking(move || -> Result<()> {
            let encrypted = cipher.encrypt_bytes(&payload)?;
            let now = Utc::now().timestamp();
            let conn = conn.lock();
            conn.execute(
                r#"
                UPDATE messages
                SET body_encrypted = ?, updated_at = ?
                WHERE account_email = ? AND uid = ?
                "#,
                params![encrypted, now, account, uid],
            )?;
            Ok(())
        })
        .await
        .map_err(map_join_error)?;

        join_result?;

        Ok(())
    }

    pub async fn message_body(&self, account_email: &str, uid: &str) -> Result<Option<Vec<u8>>> {
        let conn = self.conn.clone();
        let cipher = self.cipher.clone();
        let account = account_email.to_owned();
        let uid = uid.to_owned();

        let join_result = tokio::task::spawn_blocking(move || -> Result<Option<Vec<u8>>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT body_encrypted
                FROM messages
                WHERE account_email = ? AND uid = ?
                "#,
            )?;

            let encrypted: Option<String> = stmt
                .query_row(params![account, uid], |row| row.get(0))
                .optional()?;

            if let Some(payload) = encrypted {
                let body = cipher.decrypt_bytes(&payload)?;
                Ok(Some(body))
            } else {
                Ok(None)
            }
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub async fn update_sender_status(
        &self,
        sender_email: &str,
        status: SenderStatus,
    ) -> Result<()> {
        let conn = self.conn.clone();
        let email = sender_email.to_lowercase();
        let status_str = status.as_str().to_string();

        let join_result = tokio::task::spawn_blocking(move || -> Result<()> {
            let now = Utc::now().timestamp();
            let conn = conn.lock();
            conn.execute(
                r#"
                INSERT INTO sender_status(sender_email, status, updated_at)
                VALUES(?, ?, ?)
                ON CONFLICT(sender_email) DO UPDATE SET
                    status = excluded.status,
                    updated_at = excluded.updated_at
                "#,
                params![email, status_str, now],
            )?;
            Ok(())
        })
        .await
        .map_err(map_join_error)?;

        join_result?;

        Ok(())
    }

    pub async fn sender_status(&self, sender_email: &str) -> Result<SenderStatus> {
        let conn = self.conn.clone();
        let email = sender_email.to_lowercase();
        let result = tokio::task::spawn_blocking(move || -> Result<SenderStatus> {
            let conn = conn.lock();
            let mut stmt =
                conn.prepare("SELECT status FROM sender_status WHERE sender_email = ?")?;
            let status: Option<String> = stmt
                .query_row(params![email], |row| row.get(0))
                .optional()?;
            Ok(status
                .map(|value| SenderStatus::from_str(&value))
                .unwrap_or(SenderStatus::Neutral))
        })
        .await
        .map_err(map_join_error)?;

        result
    }

    pub async fn list_statuses(&self) -> Result<Vec<(String, SenderStatus)>> {
        let conn = self.conn.clone();
        let result = tokio::task::spawn_blocking(move || -> Result<Vec<(String, SenderStatus)>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare("SELECT sender_email, status FROM sender_status")?;
            let mut rows = stmt.query([])?;
            let mut items = Vec::new();
            while let Some(row) = rows.next()? {
                let email: String = row.get(0)?;
                let status: String = row.get(1)?;
                items.push((email, SenderStatus::from_str(&status)));
            }
            Ok(items)
        })
        .await
        .map_err(map_join_error)?;

        result
    }

    pub async fn set_setting(&self, key: &str, value: Option<&str>) -> Result<()> {
        let conn = self.conn.clone();
        let key = key.to_owned();
        let value = value.map(|v| v.to_owned());

        let join_result = tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.lock();
            match value {
                Some(val) => {
                    conn.execute(
                        r#"
                        INSERT INTO app_settings (key, value)
                        VALUES (?, ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                        "#,
                        params![key, val],
                    )?;
                }
                None => {
                    conn.execute("DELETE FROM app_settings WHERE key = ?", params![key])?;
                }
            }
            Ok(())
        })
        .await
        .map_err(map_join_error)?;

        join_result?;

        Ok(())
    }

    pub async fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.clone();
        let key = key.to_owned();

        let join_result = tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?")?;
            let value: Option<String> =
                stmt.query_row(params![key], |row| row.get(0)).optional()?;
            Ok(value)
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub async fn upsert_account(&self, account: &Account) -> Result<()> {
        let conn = self.conn.clone();
        let account = account.clone();
        let join_result = tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.lock();
            let now = Utc::now().timestamp();
            conn.execute(
                r#"
                INSERT INTO accounts (email, provider, custom_host, custom_port, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET
                    provider = excluded.provider,
                    custom_host = excluded.custom_host,
                    custom_port = excluded.custom_port,
                    updated_at = excluded.updated_at
                "#,
                params![
                    account.email,
                    account.provider.as_key(),
                    account.custom_host,
                    account.custom_port.map(|value| value as i64),
                    now,
                    now
                ],
            )?;
            Ok(())
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub async fn remove_account(&self, email: &str) -> Result<()> {
        let conn = self.conn.clone();
        let email = email.to_lowercase();
        let join_result = tokio::task::spawn_blocking(move || -> Result<()> {
            let conn = conn.lock();
            conn.execute("DELETE FROM accounts WHERE email = ?", params![email])?;
            Ok(())
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub async fn account_by_email(&self, email: &str) -> Result<Option<AccountRecord>> {
        let conn = self.conn.clone();
        let email = email.to_lowercase();
        let join_result = tokio::task::spawn_blocking(move || -> Result<Option<AccountRecord>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT email, provider, custom_host, custom_port
                FROM accounts
                WHERE email = ?
                "#,
            )?;

            let record = stmt
                .query_row(params![email], |row| {
                    let provider_key: String = row.get(1)?;
                    let provider = Provider::from_key(&provider_key)
                        .ok_or_else(|| rusqlite::Error::InvalidQuery)?;
                    let port: Option<i64> = row.get(3)?;
                    Ok(AccountRecord {
                        email: row.get(0)?,
                        provider,
                        custom_host: row.get(2)?,
                        custom_port: port.map(|value| value as u16),
                    })
                })
                .optional()?;
            Ok(record)
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub async fn list_accounts(&self) -> Result<Vec<AccountRecord>> {
        let conn = self.conn.clone();
        let join_result = tokio::task::spawn_blocking(move || -> Result<Vec<AccountRecord>> {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT email, provider, custom_host, custom_port
                FROM accounts
                ORDER BY email
                "#,
            )?;

            let mut rows = stmt.query([])?;
            let mut accounts = Vec::new();
            while let Some(row) = rows.next()? {
                let provider_key: String = row.get(1)?;
                if let Some(provider) = Provider::from_key(&provider_key) {
                    let port: Option<i64> = row.get(3)?;
                    accounts.push(AccountRecord {
                        email: row.get(0)?,
                        provider,
                        custom_host: row.get(2)?,
                        custom_port: port.map(|value| value as u16),
                    });
                }
            }
            Ok(accounts)
        })
        .await
        .map_err(map_join_error)?;

        join_result
    }

    pub fn db_path() -> Option<&'static PathBuf> {
        DB_PATH.get()
    }

    pub async fn upsert_analysis(&self, rows: Vec<AnalysisInsert>) -> Result<()> {
        if rows.is_empty() {
            return Ok(());
        }

        let conn = self.conn.clone();
        let join_result = tokio::task::spawn_blocking(move || -> Result<()> {
            let mut conn = conn.lock();
            let tx = conn.transaction()?;
            {
                let mut stmt = tx.prepare(
                    r#"
                    INSERT INTO analysis_results (
                        message_id,
                        summary,
                        sentiment,
                        categories,
                        metadata_json,
                        model_id,
                        analyzed,
                        analyzed_at,
                        analysis_confidence,
                        validator_model_id,
                        validation_status,
                        validation_confidence,
                        validation_notes,
                        validated_at
                    )
                    SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                    FROM messages
                    WHERE account_email = ? AND uid = ?
                    ON CONFLICT(message_id) DO UPDATE SET
                        summary = excluded.summary,
                        sentiment = excluded.sentiment,
                        categories = excluded.categories,
                        metadata_json = excluded.metadata_json,
                        model_id = excluded.model_id,
                        analyzed = excluded.analyzed,
                        analyzed_at = excluded.analyzed_at,
                        analysis_confidence = excluded.analysis_confidence,
                        validator_model_id = excluded.validator_model_id,
                        validation_status = excluded.validation_status,
                        validation_confidence = excluded.validation_confidence,
                        validation_notes = excluded.validation_notes,
                        validated_at = excluded.validated_at
                    "#,
                )?;

                for row in rows {
                    let categories_json = if row.categories.is_empty() {
                        None
                    } else {
                        Some(
                            serde_json::to_string(&row.categories)
                                .map_err(|err| StorageError::Serialization(err.to_string()))?,
                        )
                    };

                    let summary = row.summary.as_deref();
                    let sentiment = row.sentiment.as_deref();
                    let categories = categories_json.as_deref();
                    let metadata_json = if row.metadata_json.is_null() {
                        None
                    } else {
                        Some(
                            serde_json::to_string(&row.metadata_json)
                                .map_err(|err| StorageError::Serialization(err.to_string()))?,
                        )
                    };
                    let model_id = row.model_id.as_deref();
                    let analyzed = if row.analyzed { 1 } else { 0 };
                    let analyzed_at = row.analyzed_at;
                    let analysis_confidence = row.analysis_confidence;
                    let validator_model_id = row.validation.validator_model_id.as_deref();
                    let validation_status = row.validation.status.as_deref();
                    let validation_confidence = row.validation.confidence;
                    let validation_notes = row.validation.notes.as_deref();
                    let validated_at = row.validation.validated_at;

                    stmt.execute(params![
                        summary,
                        sentiment,
                        categories,
                        metadata_json.as_deref(),
                        model_id,
                        analyzed,
                        analyzed_at,
                        analysis_confidence,
                        validator_model_id,
                        validation_status,
                        validation_confidence,
                        validation_notes,
                        validated_at,
                        row.account_email,
                        row.uid
                    ])?;
                }
            }
            tx.commit()?;
            Ok(())
        })
        .await
        .map_err(map_join_error)?;

        join_result?;

        Ok(())
    }
}

impl Cipher {
    fn from_bytes(bytes: Vec<u8>) -> Result<Self> {
        if bytes.len() != 32 {
            return Err(StorageError::Key("expected 32 byte key".into()));
        }
        Ok(Self {
            key: SecretVec::new(bytes),
        })
    }

    fn cipher(&self) -> Aes256Gcm {
        Aes256Gcm::new_from_slice(self.key.expose_secret()).expect("valid key")
    }

    fn encrypt_bytes(&self, data: &[u8]) -> Result<String> {
        let cipher = self.cipher();
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let mut payload = cipher
            .encrypt(&nonce, data)
            .map_err(|_| StorageError::Encryption)?;
        let mut combined = nonce.to_vec();
        combined.append(&mut payload);
        Ok(general_purpose::STANDARD.encode(combined))
    }

    fn encrypt_string(&self, value: &str) -> Result<String> {
        self.encrypt_bytes(value.as_bytes())
    }

    fn decrypt_bytes(&self, data: &str) -> Result<Vec<u8>> {
        let combined = general_purpose::STANDARD
            .decode(data)
            .map_err(|_| StorageError::Decryption)?;
        let nonce_len = <Aes256Gcm as AeadCore>::NonceSize::to_usize();
        if combined.len() < nonce_len {
            return Err(StorageError::Decryption);
        }
        let (nonce_bytes, payload) = combined.split_at(nonce_len);
        let nonce = Nonce::from_slice(nonce_bytes);
        let cipher = self.cipher();
        let plaintext = cipher
            .decrypt(nonce, payload)
            .map_err(|_| StorageError::Decryption)?;
        Ok(plaintext)
    }

    fn decrypt_string(&self, data: &str) -> Result<String> {
        let bytes = self.decrypt_bytes(data)?;
        String::from_utf8(bytes).map_err(|_| StorageError::Decryption)
    }
}

pub fn normalize_sender(email: &str) -> String {
    email.trim().to_lowercase()
}

pub fn sender_fingerprint(email: &str) -> String {
    let normalized = normalize_sender(email);
    let digest = Sha256::digest(normalized.as_bytes());
    hex::encode(digest)
}
