use std::{fs, path::{Path, PathBuf}, sync::Arc};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use aes_gcm::{
    aead::{generic_array::typenum::Unsigned, Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use once_cell::sync::OnceCell;
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json;
use secrecy::{ExposeSecret, SecretVec};
use sha2::{Digest, Sha256};
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

#[derive(Debug, Clone)]
pub struct AnalysisInsert {
    pub account_email: String,
    pub uid: String,
    pub summary: Option<String>,
    pub sentiment: Option<String>,
    pub categories: Vec<String>,
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
}

#[derive(Debug, Clone)]
pub struct SenderGroup {
    pub sender_email: String,
    pub sender_display: String,
    pub status: SenderStatus,
    pub messages: Vec<MessageRow>,
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
        let data_dir = handle
            .path_resolver()
            .app_data_dir()
            .ok_or_else(|| StorageError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "App data directory not available",
            )))?;
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
                FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
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
              m.snippet_encrypted, m.flags,
              COALESCE(ss.status, 'neutral'),
              ar.summary, ar.sentiment, ar.categories
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
                    let status = SenderStatus::from_str(&row.get::<_, String>(8)?);
                    groups.push(SenderGroup {
                        sender_email: sender_email.clone(),
                        sender_display: display.clone(),
                        status,
                        messages: Vec::new(),
                    });
                }

                let group = groups
                    .last_mut()
                    .expect("group should exist after push");

                let subject_enc: String = row.get(4)?;
                let subject = cipher.decrypt_string(&subject_enc)?;
                let snippet_enc: Option<String> = row.get(6)?;
                let snippet = snippet_enc
                    .as_ref()
                    .map(|value| cipher.decrypt_string(value))
                    .transpose()?;

                let categories_json: Option<String> = row.get(11)?;
                let analysis_categories = categories_json
                    .as_ref()
                    .map(|value| serde_json::from_str::<Vec<String>>(value)
                        .map_err(|err| StorageError::Serialization(err.to_string())))
                    .transpose()?
                    .unwrap_or_default();

                let message = MessageRow {
                    id: row.get(0)?,
                    uid: row.get(1)?,
                    sender_email: sender_email.clone(),
                    sender_display: display.clone(),
                    subject,
                    date: row.get(5)?,
                    snippet,
                    flags: row.get(7)?,
                    status: group.status.clone(),
                    analysis_summary: row.get(9)?,
                    analysis_sentiment: row.get(10)?,
                    analysis_categories,
                };

                group.messages.push(message);
            }

            Ok(groups)
        })
        .await
        .map_err(map_join_error)?;

        result
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
            let mut stmt = conn.prepare("SELECT status FROM sender_status WHERE sender_email = ?")?;
            let status: Option<String> = stmt.query_row(params![email], |row| row.get(0)).optional()?;
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
                    INSERT INTO analysis_results (message_id, summary, sentiment, categories)
                    SELECT id, ?, ?, ?
                    FROM messages
                    WHERE account_email = ? AND uid = ?
                    ON CONFLICT(message_id) DO UPDATE SET
                        summary = excluded.summary,
                        sentiment = excluded.sentiment,
                        categories = excluded.categories
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

                    stmt.execute(params![summary, sentiment, categories, row.account_email, row.uid])?;
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
