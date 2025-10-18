#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use keyring::{Entry, Error as KeyringError};
use oauth2::{
    AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge, RedirectUrl, Scope, TokenResponse,
};
use personal_mail_client::models::{
    AppState, ConnectAccountResponse, Credentials, EmailSummary, MailAddress, Provider,
    SavedAccount, SyncHandle, SyncReport,
};
use personal_mail_client::providers::{self, ProviderError};
use personal_mail_client::storage::{AnalysisInsert, MessageInsert, SenderStatus, Storage};
use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{Manager, State};
use tokio::time::{self, Duration, MissedTickBehavior};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn, Level};
use warp::Filter;

fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "personal_mail_client=info,tauri=info".into()),
        )
        .with_max_level(Level::INFO)
        .try_init();
}

#[derive(Serialize)]
struct MessageItem {
    uid: String,
    subject: String,
    date: Option<String>,
    snippet: Option<String>,
    status: String,
    flags: Option<String>,
    analysis_summary: Option<String>,
    analysis_sentiment: Option<String>,
    analysis_categories: Vec<String>,
}

#[derive(Serialize)]
struct SenderGroupResponse {
    sender_email: String,
    sender_display: String,
    status: String,
    message_count: usize,
    messages: Vec<MessageItem>,
}

#[derive(Serialize)]
struct SyncProgressPayload {
    email: String,
    batch: usize,
    total_batches: usize,
    fetched: usize,
    stored: usize,
    elapsed_ms: u64,
}

const KEYCHAIN_SERVICE: &str = "PersonalMailClient";

fn keychain_entry(email: &str) -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, email).map_err(|err| err.to_string())
}

fn store_password_in_keychain(email: &str, password: &str) -> Result<(), String> {
    // In development, you can use environment variables instead of keychain
    // Set EMAIL_PASSWORD environment variable to avoid keychain prompts
    if cfg!(debug_assertions) {
        info!("Development mode: skipping keychain storage. Use EMAIL_PASSWORD env var instead.");
        return Ok(());
    }

    let entry = keychain_entry(email)?;
    entry.set_password(password).map_err(|err| err.to_string())
}

fn fetch_password_from_keychain(email: &str) -> Result<Option<String>, String> {
    // In development, check environment variable first
    if cfg!(debug_assertions) {
        if let Ok(password) = std::env::var("EMAIL_PASSWORD") {
            info!("Using password from EMAIL_PASSWORD environment variable");
            return Ok(Some(password));
        }
    }

    let entry = keychain_entry(email)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn password_exists_in_keychain(email: &str) -> Result<bool, String> {
    // In development, check environment variable first
    if cfg!(debug_assertions) {
        if std::env::var("EMAIL_PASSWORD").is_ok() {
            return Ok(true);
        }
    }

    let entry = keychain_entry(email)?;
    match entry.get_password() {
        Ok(password) => {
            drop(password);
            Ok(true)
        }
        Err(KeyringError::NoEntry) => Ok(false),
        Err(err) => Err(err.to_string()),
    }
}

fn delete_password_from_keychain(email: &str) -> Result<(), String> {
    // In development, no keychain entry to delete
    if cfg!(debug_assertions) {
        info!("Development mode: no keychain entry to delete");
        return Ok(());
    }

    let entry = keychain_entry(email)?;
    match entry.delete_password() {
        Ok(_) | Err(KeyringError::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

async fn perform_connect(
    state: &AppState,
    credentials: Credentials,
) -> Result<ConnectAccountResponse, String> {
    let normalized_email = credentials.email.clone();
    let provider = credentials.provider;
    info!(%normalized_email, ?provider, "connecting account");

    let emails = providers::fetch_recent(&credentials, 25)
        .await
        .map_err(|err| {
            error!(%normalized_email, ?err, "failed to fetch recent emails during connect");
            provider_error_to_message(err)
        })?;

    let account = credentials.account();

    {
        let mut accounts = state.accounts.write().await;
        accounts.insert(normalized_email.clone(), credentials.clone());
    }

    let mut inserts = Vec::with_capacity(emails.len());
    let mut analyses = Vec::with_capacity(emails.len());
    for summary in &emails {
        let (insert, analysis) = build_records(&normalized_email, summary, None, None, None);
        inserts.push(insert);
        analyses.push(analysis);
    }

    if let Err(err) = state.storage.upsert_messages(inserts).await {
        error!(%normalized_email, ?err, "failed to persist message cache");
    }
    if let Err(err) = state.storage.upsert_analysis(analyses).await {
        error!(%normalized_email, ?err, "failed to persist analysis cache");
    }
    if let Err(err) = state.storage.upsert_account(&account).await {
        error!(%normalized_email, ?err, "failed to persist account metadata");
    }

    info!(%normalized_email, email_count = emails.len(), "account connected successfully");
    Ok(ConnectAccountResponse { account, emails })
}

#[tauri::command]
async fn connect_account(
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
    password: String,
    custom_host: Option<String>,
    custom_port: Option<u16>,
) -> Result<ConnectAccountResponse, String> {
    if email.trim().is_empty() {
        warn!("connect_account missing email address");
        return Err("Email address is required".into());
    }
    if password.trim().is_empty() {
        warn!("connect_account missing app password");
        return Err("App password is required".into());
    }

    let normalized_email = email.trim().to_lowercase();
    let credentials = Credentials::new(
        provider,
        normalized_email.clone(),
        password.clone(),
        custom_host,
        custom_port,
    );

    let response = perform_connect(state.inner(), credentials).await?;

    if let Err(err) = store_password_in_keychain(&normalized_email, &password) {
        warn!(%normalized_email, ?err, "failed to persist password in keychain");
    }

    Ok(response)
}

#[tauri::command]
async fn connect_account_saved(
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
) -> Result<ConnectAccountResponse, String> {
    if email.trim().is_empty() {
        return Err("Email address is required".into());
    }

    let normalized_email = email.trim().to_lowercase();

    let record = state
        .storage
        .account_by_email(&normalized_email)
        .await
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "No saved account metadata found for this account".to_string())?;

    if record.provider != provider {
        warn!(%normalized_email, ?provider, actual = ?record.provider, "provider mismatch for saved account, using stored provider");
    }

    let password = fetch_password_from_keychain(&normalized_email)?
        .ok_or_else(|| "No saved password stored in macOS keychain for this account".to_string())?;

    let credentials = Credentials::new(
        record.provider,
        normalized_email.clone(),
        password.clone(),
        record.custom_host.clone(),
        record.custom_port,
    );

    let response = perform_connect(state.inner(), credentials).await?;

    if let Err(err) = store_password_in_keychain(&normalized_email, &password) {
        warn!(%normalized_email, ?err, "failed to refresh keychain password after saved connect");
    }

    Ok(response)
}

#[tauri::command]
async fn test_account_connection(
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
    password: Option<String>,
    custom_host: Option<String>,
    custom_port: Option<u16>,
) -> Result<(), String> {
    if email.trim().is_empty() {
        return Err("Email address is required".into());
    }

    let normalized_email = email.trim().to_lowercase();

    let password_value = match password {
        Some(value) if !value.trim().is_empty() => value,
        _ => fetch_password_from_keychain(&normalized_email)?.ok_or_else(|| {
            "No password available. Provide an app password or connect once to store it."
                .to_string()
        })?,
    };

    let credentials = Credentials::new(
        provider,
        normalized_email,
        password_value,
        custom_host,
        custom_port,
    );

    providers::verify_credentials(&credentials)
        .await
        .map_err(provider_error_to_message)?;

    Ok(())
}

#[tauri::command]
async fn list_saved_accounts(state: State<'_, AppState>) -> Result<Vec<SavedAccount>, String> {
    let records = state
        .storage
        .list_accounts()
        .await
        .map_err(|err| err.to_string())?;

    let mut saved = Vec::with_capacity(records.len());
    for record in records {
        let has_password = match password_exists_in_keychain(&record.email) {
            Ok(value) => value,
            Err(err) => {
                warn!(email = %record.email, ?err, "failed to check keychain password status");
                false
            }
        };
        saved.push(SavedAccount {
            provider: record.provider,
            email: record.email,
            custom_host: record.custom_host,
            custom_port: record.custom_port,
            has_password,
        });
    }

    Ok(saved)
}

#[tauri::command]
fn get_saved_password(email: String) -> Result<Option<String>, String> {
    if email.trim().is_empty() {
        return Ok(None);
    }
    let normalized_email = email.trim().to_lowercase();
    fetch_password_from_keychain(&normalized_email)
}

#[tauri::command]
async fn fetch_recent(
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
    limit: Option<usize>,
) -> Result<Vec<EmailSummary>, String> {
    let normalized_email = email.trim().to_lowercase();
    let limit = limit.unwrap_or(25);
    info!(%normalized_email, limit, ?provider, "fetch_recent invoked");

    let credentials = {
        let accounts = state.accounts.read().await;
        accounts
            .get(&normalized_email)
            .cloned()
            .ok_or_else(|| "Account is not connected".to_string())?
    };

    if credentials.provider != provider {
        warn!(%normalized_email, stored_provider = ?credentials.provider, requested_provider = ?provider, "provider mismatch");
        return Err("Provider mismatch for stored credentials".into());
    }

    let emails = providers::fetch_recent(&credentials, limit)
        .await
        .map_err(|err| {
            error!(%normalized_email, limit, ?err, "failed to fetch recent emails");
            provider_error_to_message(err)
        })?;

    let mut inserts = Vec::with_capacity(emails.len());
    let mut analyses = Vec::with_capacity(emails.len());
    for summary in &emails {
        let (insert, analysis) = build_records(&normalized_email, summary, None, None, None);
        inserts.push(insert);
        analyses.push(analysis);
    }

    if let Err(err) = state.storage.upsert_messages(inserts).await {
        error!(%normalized_email, ?err, "failed to cache mailbox during fetch_recent");
    }

    if let Err(err) = state.storage.upsert_analysis(analyses).await {
        error!(%normalized_email, ?err, "failed to persist analysis during fetch_recent");
    }

    debug!(%normalized_email, count = emails.len(), "fetch_recent returning emails");

    Ok(emails)
}

#[tauri::command]
async fn sync_account_full(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
    chunk_size: Option<usize>,
) -> Result<SyncReport, String> {
    let normalized_email = email.trim().to_lowercase();
    let chunk = chunk_size.unwrap_or(50);

    let credentials = {
        let accounts = state.accounts.read().await;
        accounts
            .get(&normalized_email)
            .cloned()
            .ok_or_else(|| "Account is not connected".to_string())?
    };

    if credentials.provider != provider {
        warn!(%normalized_email, stored_provider = ?credentials.provider, requested_provider = ?provider, "provider mismatch for full sync");
        return Err("Provider mismatch for stored credentials".into());
    }

    info!(%normalized_email, chunk, "starting full mailbox sync");
    let started = Instant::now();

    let (mut batch_rx, producer_handle) = providers::fetch_all(&credentials, None, chunk)
        .await
        .map_err(|err| {
            error!(%normalized_email, ?err, "full mailbox fetch failed");
            provider_error_to_message(err)
        })?;

    let mut total_fetched = 0usize;
    let mut total_stored = 0usize;

    while let Some(batch_result) = batch_rx.recv().await {
        if batch_result.messages.is_empty() {
            continue;
        }

        let mut inserts = Vec::with_capacity(batch_result.messages.len());
        let mut analyses = Vec::with_capacity(batch_result.messages.len());

        for envelope in batch_result.messages {
            let flags_slice = if envelope.flags.is_empty() {
                None
            } else {
                Some(envelope.flags.as_slice())
            };
            let (insert, analysis) = build_records(
                &normalized_email,
                &envelope.summary,
                envelope.snippet.clone(),
                envelope.body.clone(),
                flags_slice,
            );
            inserts.push(insert);
            analyses.push(analysis);
        }

        total_fetched += inserts.len();

        if let Err(err) = state.storage.upsert_messages(inserts).await {
            error!(%normalized_email, ?err, "failed to persist messages after full sync batch");
        } else {
            total_stored = total_fetched;
        }

        if let Err(err) = state.storage.upsert_analysis(analyses).await {
            error!(%normalized_email, ?err, "failed to persist analyses after full sync batch");
        }

        let elapsed_ms = started.elapsed().as_millis() as u64;
        let payload = SyncProgressPayload {
            email: normalized_email.clone(),
            batch: batch_result.index,
            total_batches: batch_result.total,
            fetched: total_fetched,
            stored: total_stored,
            elapsed_ms,
        };

        if let Err(err) = app.emit_to("main", "full-sync-progress", &payload) {
            warn!(%normalized_email, ?err, "failed to emit full-sync-progress event");
        }
    }

    producer_handle
        .await
        .map_err(|err| ProviderError::Other(format!("Background task failure: {err}")))
        .and_then(|result| result)
        .map_err(|err| {
            error!(%normalized_email, ?err, "full mailbox fetch failed");
            provider_error_to_message(err)
        })?;

    let latest_uid = state
        .storage
        .latest_uid_for_account(&normalized_email)
        .await
        .map_err(|err| err.to_string())?;

    state
        .storage
        .update_sync_state(&normalized_email, latest_uid.as_deref(), true, total_stored)
        .await
        .map_err(|err| err.to_string())?;

    let duration_ms = started.elapsed().as_millis() as u64;

    Ok(SyncReport {
        fetched: total_fetched,
        stored: total_stored,
        duration_ms,
    })
}

#[tauri::command]
async fn sync_account_incremental(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
    chunk_size: Option<usize>,
) -> Result<SyncReport, String> {
    let normalized_email = email.trim().to_lowercase();
    let chunk = chunk_size.unwrap_or(50);

    let credentials = {
        let accounts = state.accounts.read().await;
        accounts
            .get(&normalized_email)
            .cloned()
            .ok_or_else(|| "Account is not connected".to_string())?
    };

    if credentials.provider != provider {
        warn!(
            %normalized_email,
            stored_provider = ?credentials.provider,
            requested_provider = ?provider,
            "provider mismatch for incremental sync"
        );
        return Err("Provider mismatch for stored credentials".into());
    }

    let since_uid = state
        .storage
        .latest_uid_for_account(&normalized_email)
        .await
        .map_err(|err| err.to_string())?
        .and_then(|value| value.parse::<u32>().ok());

    info!(%normalized_email, chunk, since_uid, "starting incremental mailbox sync");
    let started = Instant::now();

    let (mut batch_rx, producer_handle) = providers::fetch_all(&credentials, since_uid, chunk)
        .await
        .map_err(|err| {
            error!(%normalized_email, ?err, "incremental mailbox fetch failed");
            provider_error_to_message(err)
        })?;

    let mut total_fetched = 0usize;
    let mut total_stored = 0usize;

    while let Some(batch_result) = batch_rx.recv().await {
        if batch_result.messages.is_empty() {
            continue;
        }

        let mut inserts = Vec::with_capacity(batch_result.messages.len());
        let mut analyses = Vec::with_capacity(batch_result.messages.len());

        for envelope in batch_result.messages {
            let flags_slice = if envelope.flags.is_empty() {
                None
            } else {
                Some(envelope.flags.as_slice())
            };
            let (insert, analysis) = build_records(
                &normalized_email,
                &envelope.summary,
                envelope.snippet.clone(),
                envelope.body.clone(),
                flags_slice,
            );
            inserts.push(insert);
            analyses.push(analysis);
        }

        total_fetched += inserts.len();

        if let Err(err) = state.storage.upsert_messages(inserts).await {
            error!(%normalized_email, ?err, "failed to persist messages after incremental sync batch");
        } else {
            total_stored += batch_result.fetched;
        }

        if let Err(err) = state.storage.upsert_analysis(analyses).await {
            error!(%normalized_email, ?err, "failed to persist analyses after incremental sync batch");
        }

        let elapsed_ms = started.elapsed().as_millis() as u64;
        let payload = SyncProgressPayload {
            email: normalized_email.clone(),
            batch: batch_result.index,
            total_batches: batch_result.total,
            fetched: total_fetched,
            stored: total_stored,
            elapsed_ms,
        };

        if let Err(err) = app.emit_to("main", "full-sync-progress", &payload) {
            warn!(%normalized_email, ?err, "failed to emit incremental-sync progress event");
        }
    }

    producer_handle
        .await
        .map_err(|err| ProviderError::Other(format!("Background task failure: {err}")))
        .and_then(|result| result)
        .map_err(|err| {
            error!(%normalized_email, ?err, "incremental mailbox fetch failed");
            provider_error_to_message(err)
        })?;

    let latest_uid = state
        .storage
        .latest_uid_for_account(&normalized_email)
        .await
        .map_err(|err| err.to_string())?;

    state
        .storage
        .update_sync_state(
            &normalized_email,
            latest_uid.as_deref(),
            false,
            total_stored,
        )
        .await
        .map_err(|err| err.to_string())?;

    let duration_ms = started.elapsed().as_millis() as u64;

    Ok(SyncReport {
        fetched: total_fetched,
        stored: total_stored,
        duration_ms,
    })
}

#[tauri::command]
async fn list_sender_groups(
    state: State<'_, AppState>,
    email: String,
) -> Result<Vec<SenderGroupResponse>, String> {
    let normalized_email = email.trim().to_lowercase();
    let groups = state
        .storage
        .grouped_messages_for_account(&normalized_email)
        .await
        .map_err(|err| err.to_string())?;

    let mut response = Vec::with_capacity(groups.len());

    for group in groups {
        let messages = group
            .messages
            .into_iter()
            .map(|message| MessageItem {
                uid: message.uid,
                subject: message.subject,
                date: message.date,
                snippet: message.snippet,
                status: message.status.as_str().to_string(),
                flags: message.flags,
                analysis_summary: message.analysis_summary,
                analysis_sentiment: message.analysis_sentiment,
                analysis_categories: message.analysis_categories,
            })
            .collect::<Vec<_>>();

        response.push(SenderGroupResponse {
            sender_email: group.sender_email,
            sender_display: group.sender_display,
            status: group.status.as_str().to_string(),
            message_count: messages.len(),
            messages,
        });
    }

    Ok(response)
}

#[tauri::command]
#[allow(non_snake_case)]
async fn set_sender_status(
    state: State<'_, AppState>,
    senderEmail: String,
    status: String,
) -> Result<(), String> {
    let normalized_sender = senderEmail.trim().to_lowercase();
    let desired_status = match status.as_str() {
        "allowed" => SenderStatus::Allowed,
        "blocked" => SenderStatus::Blocked,
        _ => SenderStatus::Neutral,
    };

    state
        .storage
        .update_sender_status(&normalized_sender, desired_status)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
async fn list_recent_messages(
    state: State<'_, AppState>,
    email: String,
    limit: Option<usize>,
) -> Result<Vec<EmailSummary>, String> {
    let normalized_email = email.trim().to_lowercase();
    let limit = limit.unwrap_or(200).clamp(1, 100_000);

    let cached = state
        .storage
        .recent_message_summaries(&normalized_email, limit)
        .await
        .map_err(|err| err.to_string())?;

    let messages = cached
        .into_iter()
        .map(|summary| EmailSummary {
            uid: summary.uid,
            subject: summary.subject,
            sender: MailAddress {
                display_name: summary.sender_display,
                email: summary.sender_email,
            },
            date: summary.date,
        })
        .collect();

    Ok(messages)
}

#[tauri::command]
async fn cached_message_count(state: State<'_, AppState>, email: String) -> Result<usize, String> {
    let normalized_email = email.trim().to_lowercase();
    state
        .storage
        .message_count_for_account(&normalized_email)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn delete_message_remote(
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
    uid: String,
) -> Result<(), String> {
    let normalized_email = email.trim().to_lowercase();

    let credentials = {
        let accounts = state.accounts.read().await;
        accounts
            .get(&normalized_email)
            .cloned()
            .ok_or_else(|| "Account is not connected".to_string())?
    };

    if credentials.provider != provider {
        return Err("Provider mismatch for stored credentials".into());
    }

    providers::delete_message(&credentials, &uid)
        .await
        .map_err(|err| {
            error!(%normalized_email, %uid, ?err, "remote delete failed");
            provider_error_to_message(err)
        })?;

    state
        .storage
        .delete_message(&normalized_email, &uid)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
async fn configure_periodic_sync(
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
    minutes: Option<u64>,
) -> Result<(), String> {
    let normalized_email = email.trim().to_lowercase();

    {
        let mut jobs = state.sync_jobs.write().await;
        if let Some(existing) = jobs.remove(&normalized_email) {
            existing.cancel.cancel();
            existing.handle.abort();
        }
    }

    let Some(interval_minutes) = minutes.filter(|value| *value > 0) else {
        info!(%normalized_email, "periodic sync disabled");
        return Ok(());
    };

    let credentials = {
        let accounts = state.accounts.read().await;
        accounts
            .get(&normalized_email)
            .cloned()
            .ok_or_else(|| "Account is not connected".to_string())?
    };

    if credentials.provider != provider {
        return Err("Provider mismatch for stored credentials".into());
    }

    let storage = state.storage.clone();
    let cancel = CancellationToken::new();
    let child_token = cancel.clone();
    let email_clone = normalized_email.clone();
    let credentials_clone = credentials.clone();

    let handle = tokio::spawn(async move {
        if let Err(err) =
            perform_incremental_sync(&storage, &credentials_clone, &email_clone, 200).await
        {
            error!(%email_clone, ?err, "initial periodic sync failed");
        }

        let mut ticker = time::interval(Duration::from_secs(interval_minutes * 60));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                _ = child_token.cancelled() => {
                    info!(%email_clone, "periodic sync cancelled");
                    break;
                }
                _ = ticker.tick() => {
                    if let Err(err) = perform_incremental_sync(&storage, &credentials_clone, &email_clone, 200).await {
                        error!(%email_clone, ?err, "periodic sync iteration failed");
                    }
                }
            }
        }
    });

    {
        let mut jobs = state.sync_jobs.write().await;
        jobs.insert(normalized_email, SyncHandle { cancel, handle });
    }

    Ok(())
}

#[tauri::command]
async fn apply_block_filter(
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
    target_folder: Option<String>,
) -> Result<usize, String> {
    let normalized_email = email.trim().to_lowercase();
    let folder = target_folder.unwrap_or_else(|| "Blocked".to_string());

    let credentials = {
        let accounts = state.accounts.read().await;
        accounts
            .get(&normalized_email)
            .cloned()
            .ok_or_else(|| "Account is not connected".to_string())?
    };

    if credentials.provider != provider {
        return Err("Provider mismatch for stored credentials".into());
    }

    let statuses = state
        .storage
        .list_statuses()
        .await
        .map_err(|err| err.to_string())?;

    let blocked: Vec<String> = statuses
        .into_iter()
        .filter(|(_, status)| matches!(status, SenderStatus::Blocked))
        .map(|(sender, _)| sender)
        .collect();

    if blocked.is_empty() {
        return Ok(0);
    }

    providers::move_blocked_to_folder(&credentials, &blocked, &folder)
        .await
        .map_err(|err| provider_error_to_message(err))
}

#[tauri::command]
async fn disconnect_account(state: State<'_, AppState>, email: String) -> Result<(), String> {
    let normalized_email = email.trim().to_lowercase();
    let mut accounts = state.accounts.write().await;
    if accounts.remove(&normalized_email).is_none() {
        warn!(%normalized_email, "disconnect_account requested but account not found");
        return Err("Account not found".into());
    }
    drop(accounts);

    if let Err(err) = state.storage.remove_account(&normalized_email).await {
        error!(%normalized_email, ?err, "failed to remove persisted account metadata");
    }
    if let Err(err) = delete_password_from_keychain(&normalized_email) {
        warn!(%normalized_email, ?err, "failed to delete keychain password during disconnect");
    }
    info!(%normalized_email, "account disconnected");
    Ok(())
}

#[tauri::command]
async fn oauth(client_id: String, provider: String) -> Result<String, String> {
    let (auth_url, token_url, scope) = match provider.as_str() {
        "gmail" => (
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
            "https://mail.google.com/",
        ),
        "outlook" => (
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            "https://outlook.office.com/IMAP.AccessAsUser.All",
        ),
        "yahoo" => (
            "https://api.login.yahoo.com/oauth2/request_auth",
            "https://api.login.yahoo.com/oauth2/get_token",
            "mail-r",
        ),
        _ => return Err("Unsupported provider".to_string()),
    };

    let client = oauth2::basic::BasicClient::new(
        ClientId::new(client_id),
        None, // no secret for public clients
        oauth2::AuthUrl::new(auth_url.to_string()).map_err(|e| e.to_string())?,
        Some(oauth2::TokenUrl::new(token_url.to_string()).map_err(|e| e.to_string())?),
    )
    .set_redirect_uri(
        RedirectUrl::new("http://localhost:8080".to_string()).map_err(|e| e.to_string())?,
    );

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    let (auth_url_final, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new(scope.to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    // Open the URL
    Command::new("open")
        .arg(&auth_url_final.to_string())
        .spawn()
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Start server
    let code_shared = Arc::new(Mutex::new(None::<String>));
    let code_clone = Arc::clone(&code_shared);

    let routes = warp::get()
        .and(warp::query::<HashMap<String, String>>())
        .and_then(move |query: HashMap<String, String>| {
            let code = Arc::clone(&code_clone);
            async move {
                if let Some(c) = query.get("code") {
                    *code.lock().unwrap() = Some(c.clone());
                    Ok::<_, warp::Rejection>(warp::reply::html(
                        "Authorization successful! You can close this window.",
                    ))
                } else {
                    Ok::<_, warp::Rejection>(warp::reply::html("Authorization failed."))
                }
            }
        });

    let server = warp::serve(routes).bind(([127, 0, 0, 1], 8080));

    tokio::spawn(async move {
        let _ = server.await;
    });

    // Wait for the code
    let code = loop {
        time::sleep(time::Duration::from_millis(100)).await;
        if let Some(c) = code_shared.lock().unwrap().take() {
            break c;
        }
    };

    let token = client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(pkce_verifier)
        .request_async(oauth2::reqwest::async_http_client)
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    Ok(token.access_token().secret().clone())
}

fn provider_error_to_message(error: ProviderError) -> String {
    match error {
        ProviderError::Authentication(message) => message,
        ProviderError::Network(message) => format!("Network error: {message}"),
        ProviderError::Imap(message) => format!("IMAP error: {message}"),
        ProviderError::Other(message) => message,
    }
}

async fn perform_incremental_sync(
    storage: &Storage,
    credentials: &Credentials,
    account_email: &str,
    limit: usize,
) -> Result<(), ProviderError> {
    let summaries = providers::fetch_recent(credentials, limit).await?;

    if summaries.is_empty() {
        return Ok(());
    }

    let mut inserts = Vec::with_capacity(summaries.len());
    let mut analyses = Vec::with_capacity(summaries.len());

    for summary in &summaries {
        let (insert, analysis) = build_records(account_email, summary, None, None, None);
        inserts.push(insert);
        analyses.push(analysis);
    }

    if let Err(err) = storage.upsert_messages(inserts).await {
        error!(account = %account_email, ?err, "failed to persist messages during periodic sync");
    }

    if let Err(err) = storage.upsert_analysis(analyses).await {
        error!(account = %account_email, ?err, "failed to persist analysis during periodic sync");
    }

    Ok(())
}

fn build_records(
    account_email: &str,
    summary: &EmailSummary,
    snippet: Option<String>,
    body: Option<Vec<u8>>,
    flags: Option<&[String]>,
) -> (MessageInsert, AnalysisInsert) {
    let flags_string = flags.and_then(|values| {
        if values.is_empty() {
            None
        } else {
            Some(values.join(" "))
        }
    });

    let display_name = summary
        .sender
        .display_name
        .clone()
        .unwrap_or_else(|| summary.sender.email.clone());

    let snippet_clone = snippet.clone();
    let (analysis_summary, analysis_sentiment, categories) =
        analyze_message(&summary.subject, snippet_clone.as_deref());

    let insert = MessageInsert {
        account_email: account_email.to_string(),
        uid: summary.uid.clone(),
        sender_display: display_name,
        sender_email: summary.sender.email.clone(),
        subject: summary.subject.clone(),
        date: summary.date.clone(),
        snippet,
        body,
        flags: flags_string,
    };

    let analysis = AnalysisInsert {
        account_email: account_email.to_string(),
        uid: summary.uid.clone(),
        summary: analysis_summary,
        sentiment: analysis_sentiment,
        categories,
    };

    (insert, analysis)
}

fn analyze_message(
    subject: &str,
    snippet: Option<&str>,
) -> (Option<String>, Option<String>, Vec<String>) {
    const POSITIVE_WORDS: &[&str] = &[
        "thanks",
        "thank you",
        "appreciate",
        "great",
        "success",
        "approved",
    ];
    const NEGATIVE_WORDS: &[&str] = &["issue", "urgent", "problem", "failed", "declined", "error"];

    let snippet_text = snippet.unwrap_or("");
    let combined = format!("{} {}", subject, snippet_text).to_lowercase();

    let base_text = if snippet_text.trim().is_empty() {
        subject.trim()
    } else {
        snippet_text.trim()
    };

    let summary = if base_text.is_empty() {
        None
    } else {
        let mut truncated = base_text.chars().take(200).collect::<String>();
        if base_text.len() > truncated.len() {
            truncated.push('…');
        }
        Some(truncated)
    };

    let mut score = 0i32;
    for word in POSITIVE_WORDS {
        if combined.contains(word) {
            score += 1;
        }
    }
    for word in NEGATIVE_WORDS {
        if combined.contains(word) {
            score -= 1;
        }
    }

    let sentiment = if score > 1 {
        Some("positive".to_string())
    } else if score < -1 {
        Some("negative".to_string())
    } else if combined.trim().is_empty() {
        None
    } else {
        Some("neutral".to_string())
    };

    let mut categories = Vec::new();
    if combined.contains("invoice") || combined.contains("receipt") || combined.contains("payment")
    {
        categories.push("billing".to_string());
    }
    if combined.contains("alert") || combined.contains("warning") || combined.contains("security") {
        categories.push("alert".to_string());
    }
    if combined.contains("newsletter")
        || combined.contains("subscribe")
        || combined.contains("update")
    {
        categories.push("newsletter".to_string());
    }
    if combined.contains("meeting")
        || combined.contains("schedule")
        || combined.contains("calendar")
    {
        categories.push("calendar".to_string());
    }
    categories.sort();
    categories.dedup();

    (summary, sentiment, categories)
}

fn main() {
    init_tracing();

    tauri::Builder::default()
        .setup(|app| {
            let storage = Storage::initialize(&app.app_handle())
                .map_err(|err| -> Box<dyn std::error::Error> { Box::new(err) })?;
            app.manage(AppState::new(storage));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_account,
            connect_account_saved,
            test_account_connection,
            list_saved_accounts,
            get_saved_password,
            fetch_recent,
            sync_account_full,
            sync_account_incremental,
            list_sender_groups,
            set_sender_status,
            list_recent_messages,
            cached_message_count,
            delete_message_remote,
            configure_periodic_sync,
            apply_block_filter,
            disconnect_account,
            oauth
        ])
        .run(tauri::generate_context!())
        .expect("error while running personal mail client application");
}
