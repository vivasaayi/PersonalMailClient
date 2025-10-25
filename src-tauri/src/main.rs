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
use personal_mail_client::storage::{
    AccountRecord, AnalysisInsert, AnalysisValidation, ExistingAnalysisRecord, MessageForAnalysis,
    MessageInsert, SenderStatus, Storage,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{Manager, State};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::time::{self, Duration, MissedTickBehavior};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn, Level};
use uuid::Uuid;
use warp::Filter;

use chrono::Utc;
use futures_util::StreamExt;
use personal_mail_client::llm::{LlmService, LlmStatus};

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
    analysis_metadata: Option<Value>,
    analysis_model_id: Option<String>,
    analysis_analyzed: bool,
    analysis_analyzed_at: Option<i64>,
    analysis_confidence: Option<f64>,
    analysis_validator_model_id: Option<String>,
    analysis_validation_status: Option<String>,
    analysis_validation_confidence: Option<f64>,
    analysis_validation_notes: Option<String>,
    analysis_validated_at: Option<i64>,
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

#[derive(Serialize)]
struct KnownModelResponse {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    filename: &'static str,
    url: &'static str,
    size_bytes: u64,
    recommended_ram_gb: u16,
    context_length: u32,
    notes: &'static str,
    is_default: bool,
    downloaded: bool,
    active: bool,
    installed_size_bytes: Option<u64>,
}

const KEYCHAIN_SERVICE: &str = "PersonalMailClient";
const LLM_MODEL_SETTING_KEY: &str = "llm_model_path";
const DEFAULT_LLM_MODEL_ID: &str = "tinyllama-1.1b-q4";

#[derive(Clone, Copy)]
struct KnownModel {
    id: &'static str,
    display_name: &'static str,
    description: &'static str,
    filename: &'static str,
    download_url: &'static str,
    estimated_size_bytes: u64,
    recommended_ram_gb: u16,
    context_length: u32,
    notes: &'static str,
    is_default: bool,
}

const KNOWN_MODELS: &[KnownModel] = &[
    KnownModel {
        id: "tinyllama-1.1b-q4",
        display_name: "TinyLlama 1.1B Chat (Q4_K_M)",
        description: "Fastest option for quick label checks and lightweight analysis.",
        filename: "tinyllama-1.1b-chat-q4_k_m.gguf",
        download_url: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf?download=1",
        estimated_size_bytes: 205_000_000,
        recommended_ram_gb: 4,
        context_length: 2048,
        notes: "Great on low-power devices, but offers the least nuanced reasoning.",
        is_default: true,
    },
    KnownModel {
        id: "mistral-7b-instruct-q4",
        display_name: "Mistral 7B Instruct v0.2 (Q4_K_M)",
        description: "High-quality summaries and classifications on modern hardware.",
        filename: "mistral-7b-instruct-v0.2-q4_k_m.gguf",
        download_url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf?download=1",
        estimated_size_bytes: 4_100_000_000,
        recommended_ram_gb: 8,
        context_length: 8192,
        notes: "Best balance for most users – strong reasoning with moderate memory needs.",
        is_default: false,
    },
    KnownModel {
        id: "llama3-8b-instruct-q8",
        display_name: "Llama 3 8B Instruct (Q8_0)",
        description: "Premium quality responses with deep understanding and tone control.",
        filename: "llama3-8b-instruct-q8_0.gguf",
        download_url: "https://huggingface.co/TheBloke/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct.Q8_0.gguf?download=1",
        estimated_size_bytes: 9_100_000_000,
        recommended_ram_gb: 14,
        context_length: 8192,
        notes: "Requires plenty of RAM/VRAM – ideal when you want the best accuracy locally.",
        is_default: false,
    },
];

const DEFAULT_BULK_TAGS: &[&str] = &[
    "billing",
    "meeting",
    "travel",
    "urgent",
    "security",
    "personal",
    "newsletter",
    "promotions",
    "social",
    "updates",
    "receipts",
    "action-required",
    "follow-up",
    "waiting-for-response",
    "system-alert",
    "legal",
    "support-request",
    "shipping",
    "marketing",
    "event",
];
const BULK_PRIORITY_VALUES: &[&str] = &["low", "normal", "high", "critical"];
const BULK_ACTIONABILITY_VALUES: &[&str] = &[
    "informational",
    "needs-response",
    "waiting",
    "delegate",
    "auto-archive",
];
const BULK_RISK_VALUES: &[&str] = &["none", "sensitive", "financial", "PII", "security-critical", "phishing-suspect"];
const BULK_SOURCE_VALUES: &[&str] = &["human", "automated system", "bot/no-reply"];
const BULK_THREAD_ROLE_VALUES: &[&str] = &["new thread", "reply", "forward", "digest"];
const BULK_LIFECYCLE_VALUES: &[&str] = &["new", "snoozed", "pending", "done", "archived"];
const DEFAULT_BULK_COMPLETION_TOKENS: usize = 512;
const DEFAULT_BULK_SNIPPET_CHARS: usize = 2048;

#[derive(Debug)]
struct NormalizedBulkAnalysis {
    summary: Option<String>,
    sentiment: Option<String>,
    tags: Vec<String>,
    confidence: Option<f64>,
    metadata: Value,
}

fn emit_bulk_event(app: &tauri::AppHandle, payload: Value) {
    if let Err(err) = app.emit_all("llm-bulk-analysis-progress", payload) {
        warn!(?err, "failed to emit llm bulk analysis event");
    }
}

fn clip_text(input: &str, max_len: usize) -> String {
    if input.len() <= max_len {
        return input.trim().to_string();
    }
    let mut result = input
        .chars()
        .take(max_len.saturating_sub(1))
        .collect::<String>();
    result.push('…');
    result
}

fn sanitize_enum_value(value: Option<&str>, allowed: &[&str]) -> Option<String> {
    let candidate = value?.trim();
    if candidate.is_empty() {
        return None;
    }
    let lower = candidate.to_lowercase();
    allowed
        .iter()
        .find(|item| item.to_lowercase() == lower)
        .map(|item| (*item).to_string())
}

fn sanitize_sentiment(value: Option<&str>) -> Option<String> {
    let candidate = value?.trim();
    if candidate.is_empty() {
        return None;
    }
    match candidate.to_lowercase().as_str() {
        "positive" | "pos" => Some("positive".to_string()),
        "negative" | "neg" => Some("negative".to_string()),
        "neutral" => Some("neutral".to_string()),
        "unknown" | "mixed" => Some("unknown".to_string()),
        _ => None,
    }
}

fn value_to_string(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Some(Value::Number(number)) => Some(number.to_string()),
        Some(Value::Bool(flag)) => Some(flag.to_string()),
        _ => None,
    }
}

fn value_to_vec(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| value_to_string(Some(item)))
            .collect(),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else if trimmed.contains(',') {
                trimmed
                    .split(',')
                    .filter_map(|part| {
                        let part = part.trim();
                        if part.is_empty() {
                            None
                        } else {
                            Some(part.to_string())
                        }
                    })
                    .collect()
            } else {
                vec![trimmed.to_string()]
            }
        }
        Some(Value::Null) | None => Vec::new(),
        Some(other) => value_to_string(Some(other))
            .map(|single| vec![single])
            .unwrap_or_default(),
    }
}

fn value_to_f64(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(number)) => number.as_f64(),
        Some(Value::String(text)) => text.trim().parse::<f64>().ok(),
        _ => None,
    }
}

fn value_to_object(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Object(_)) => value.cloned().unwrap_or(Value::Null),
        Some(Value::Null) | None => json!({}),
        Some(other) => json!({ "raw": other }),
    }
}

fn sanitize_tags(raw_tags: &[String], allowed_tags: &[String]) -> Vec<String> {
    let mut output = Vec::new();
    for allowed in allowed_tags {
        if raw_tags
            .iter()
            .any(|candidate| candidate.trim().eq_ignore_ascii_case(allowed))
        {
            output.push(allowed.clone());
        }
    }
    output
}

fn parse_bulk_json(raw: &str) -> Result<Value, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("model response was empty".to_string());
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
        return Ok(parsed);
    }
    if let Some(slice) = extract_json_object(trimmed) {
        return serde_json::from_str::<Value>(&slice)
            .map_err(|err| format!("failed to parse JSON object from model: {err}"));
    }
    Err("model response did not contain valid JSON".to_string())
}

fn extract_json_object(raw: &str) -> Option<String> {
    let mut start = None;
    let mut depth = 0isize;
    for (idx, ch) in raw.char_indices() {
        match ch {
            '{' => {
                if start.is_none() {
                    start = Some(idx);
                }
                depth += 1;
            }
            '}' => {
                if depth > 0 {
                    depth -= 1;
                    if depth == 0 {
                        let end = idx;
                        return start.map(|s| raw[s..=end].to_string());
                    }
                }
            }
            _ => {}
        }
    }
    None
}

fn normalize_bulk_output(raw: Value, allowed_tags: &[String]) -> Result<NormalizedBulkAnalysis, String> {
    let object = raw
        .as_object()
        .ok_or_else(|| "model response must be a JSON object".to_string())?;

    let summary = value_to_string(object.get("summary")).map(|value| clip_text(&value, 320));
    let sentiment = sanitize_sentiment(value_to_string(object.get("sentiment")).as_deref());
    let raw_tags = value_to_vec(object.get("tags"));
    let tags = sanitize_tags(&raw_tags, allowed_tags);

    let priority = sanitize_enum_value(
        value_to_string(object.get("priority")).as_deref(),
        BULK_PRIORITY_VALUES,
    );
    let actionability = sanitize_enum_value(
        value_to_string(object.get("actionability")).as_deref(),
        BULK_ACTIONABILITY_VALUES,
    );
    let risk = sanitize_enum_value(
        value_to_string(object.get("risk")).as_deref(),
        BULK_RISK_VALUES,
    );
    let source_type = sanitize_enum_value(
        value_to_string(object.get("source_type")).as_deref(),
        BULK_SOURCE_VALUES,
    );
    let thread_role = sanitize_enum_value(
        value_to_string(object.get("thread_role")).as_deref(),
        BULK_THREAD_ROLE_VALUES,
    );
    let lifecycle = sanitize_enum_value(
        value_to_string(object.get("lifecycle")).as_deref(),
        BULK_LIFECYCLE_VALUES,
    );

    let confidence = value_to_f64(object.get("confidence")).map(|value| value.clamp(0.0, 1.0));
    let rationale = value_to_string(object.get("rationale"));
    let extractions = value_to_object(object.get("extractions"));

    let mut metadata = json!({
        "version": 1,
        "priority": priority,
        "actionability": actionability,
        "risk": risk,
        "source_type": source_type,
        "thread_role": thread_role,
        "lifecycle": lifecycle,
        "confidence": confidence,
        "rationale": rationale,
        "extractions": extractions,
        "raw_model_output": raw,
    });

    if let Some(extractions_value) = metadata.get_mut("extractions") {
        if extractions_value.is_null() {
            *extractions_value = json!({});
        }
    }

    Ok(NormalizedBulkAnalysis {
        summary,
        sentiment,
        tags,
        confidence,
        metadata,
    })
}

fn build_bulk_prompt(allowed_tags: &[String], message: &MessageForAnalysis, snippet_limit: usize) -> String {
    let mut sorted_tags = allowed_tags.to_vec();
    sorted_tags.sort();
    let tags_block = if sorted_tags.is_empty() {
        "(no predefined tags)".to_string()
    } else {
        sorted_tags
            .iter()
            .map(|tag| format!("- {tag}"))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let subject = {
        let trimmed = message.subject.trim();
        if trimmed.is_empty() {
            "(no subject)".to_string()
        } else {
            clip_text(trimmed, 240)
        }
    };

    let sender_name = message
        .sender_display
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or("(unknown sender)");
    let sender_email = &message.sender_email;
    let message_id = message.message_id;
    let date = message.date.as_deref().unwrap_or("(unknown date)");
    let snippet = message.snippet.as_deref().unwrap_or("(no snippet available)");
    let clipped_snippet = clip_text(snippet, snippet_limit);

    format!(
        r#"You are an email triage system. Analyze the email below and respond with JSON only. Strictly follow these rules:
- Return a single JSON object.
- Every field must be present even if the value is null.
- Use only the enumerated values provided.
- Populate tags exclusively from the allowed list.
- If information is missing, use null instead of guessing.

Fields to return:
{{
  "summary": string|null,
  "sentiment": one of [positive, neutral, negative, unknown] | null,
  "tags": [ ... allowed tags ... ],
  "priority": one of [{priority_values}] | null,
  "actionability": one of [{actionability_values}] | null,
  "risk": one of [{risk_values}] | null,
  "source_type": one of [{source_values}] | null,
  "thread_role": one of [{thread_values}] | null,
  "lifecycle": one of [{lifecycle_values}] | null,
  "confidence": number from 0-1 | null,
  "rationale": short string|null,
  "extractions": object with any additional structured data you deem useful
}}

Allowed tags:
{tags_block}

Email Context:
- Message ID: {message_id}
- IMAP UID: {uid}
- Sender: {sender_name} <{sender_email}>
- Date: {date}
- Subject: {subject}

Email Snippet (trimmed for length):
"""
{clipped_snippet}
"""
"#,
        priority_values = BULK_PRIORITY_VALUES.join(", "),
        actionability_values = BULK_ACTIONABILITY_VALUES.join(", "),
        risk_values = BULK_RISK_VALUES.join(", "),
        source_values = BULK_SOURCE_VALUES.join(", "),
        thread_values = BULK_THREAD_ROLE_VALUES.join(", "),
        lifecycle_values = BULK_LIFECYCLE_VALUES.join(", "),
        tags_block = tags_block,
        message_id = message_id,
        uid = message.uid.as_str(),
        sender_name = sender_name,
        sender_email = sender_email,
        date = date,
        subject = subject,
        clipped_snippet = clipped_snippet,
    )
}

fn infer_model_id_from_status(status: &LlmStatus) -> Option<String> {
    let path = status.configured_path.as_ref()?;
    let path = Path::new(path);
    let filename = path.file_name()?.to_string_lossy();

    KNOWN_MODELS
        .iter()
        .find(|model| model.filename == filename)
        .map(|model| model.id.to_string())
        .or_else(|| Some(filename.to_string()))
}

async fn execute_bulk_analysis(
    app: tauri::AppHandle,
    storage: Storage,
    llm: LlmService,
    run_id: String,
    allowed_tags: Vec<String>,
    max_tokens: usize,
    snippet_limit: usize,
    force: bool,
    model_id: Option<String>,
    validator_model_id: Option<String>,
) -> Result<(), String> {
    let started = Instant::now();
    let accounts = storage
        .list_accounts()
        .await
        .map_err(|err| err.to_string())?;

    let mut targets = Vec::new();
    let mut skipped_existing = 0usize;

    for account in &accounts {
        let messages = storage
            .messages_for_analysis(&account.email)
            .await
            .map_err(|err| err.to_string())?;
        for message in messages {
            if !force && message.existing_analysis.analyzed {
                skipped_existing += 1;
                continue;
            }
            targets.push(message);
        }
    }

    let total = targets.len();
    let account_emails: Vec<String> = accounts.into_iter().map(|account| account.email).collect();

    emit_bulk_event(
        &app,
        json!({
            "runId": run_id.clone(),
            "status": "starting",
            "total": total,
            "completed": 0,
            "failed": 0,
            "skipped": skipped_existing,
            "pending": total,
            "accounts": account_emails,
            "modelId": model_id.clone(),
            "validatorModelId": validator_model_id.clone(),
            "force": force,
            "timestamp": Utc::now().timestamp(),
        }),
    );

    if total == 0 {
        emit_bulk_event(
            &app,
            json!({
                "runId": run_id.clone(),
                "status": "completed",
                "total": 0,
                "completed": 0,
                "failed": 0,
                "skipped": skipped_existing,
                "pending": 0,
                "durationMs": started.elapsed().as_millis(),
                "modelId": model_id.clone(),
                "validatorModelId": validator_model_id.clone(),
                "timestamp": Utc::now().timestamp(),
            }),
        );
        return Ok(());
    }

    let mut completed = 0usize;
    let mut failed = 0usize;

    for message in targets {
        let prompt = build_bulk_prompt(&allowed_tags, &message, snippet_limit);
        let account_email = message.account_email.clone();
        let message_uid = message.uid.clone();

        let response = match llm.analyze_prompt(prompt, Some(max_tokens)).await {
            Ok(text) => text,
            Err(err) => {
                failed += 1;
                let pending = total.saturating_sub(completed + failed);
                emit_bulk_event(
                    &app,
                    json!({
                        "runId": run_id.clone(),
                        "status": "error",
                        "stage": "llm",
                        "error": err,
                        "accountEmail": account_email,
                        "messageUid": message_uid,
                        "total": total,
                        "completed": completed,
                        "failed": failed,
                        "skipped": skipped_existing,
                        "pending": pending,
                        "timestamp": Utc::now().timestamp(),
                        "modelId": model_id.clone(),
                        "validatorModelId": validator_model_id.clone(),
                    }),
                );
                continue;
            }
        };

        let parsed = match parse_bulk_json(&response) {
            Ok(value) => value,
            Err(err) => {
                failed += 1;
                let pending = total.saturating_sub(completed + failed);
                emit_bulk_event(
                    &app,
                    json!({
                        "runId": run_id.clone(),
                        "status": "error",
                        "stage": "parse",
                        "error": err,
                        "accountEmail": account_email,
                        "messageUid": message_uid,
                        "total": total,
                        "completed": completed,
                        "failed": failed,
                        "skipped": skipped_existing,
                        "pending": pending,
                        "timestamp": Utc::now().timestamp(),
                        "modelId": model_id.clone(),
                        "validatorModelId": validator_model_id.clone(),
                    }),
                );
                continue;
            }
        };

        let normalized = match normalize_bulk_output(parsed, &allowed_tags) {
            Ok(value) => value,
            Err(err) => {
                failed += 1;
                let pending = total.saturating_sub(completed + failed);
                emit_bulk_event(
                    &app,
                    json!({
                        "runId": run_id.clone(),
                        "status": "error",
                        "stage": "normalize",
                        "error": err,
                        "accountEmail": account_email,
                        "messageUid": message_uid,
                        "total": total,
                        "completed": completed,
                        "failed": failed,
                        "skipped": skipped_existing,
                        "pending": pending,
                        "timestamp": Utc::now().timestamp(),
                        "modelId": model_id.clone(),
                        "validatorModelId": validator_model_id.clone(),
                    }),
                );
                continue;
            }
        };

        let summary = normalized.summary.clone();
        let sentiment = normalized.sentiment.clone();
        let tags = normalized.tags.clone();
        let confidence = normalized.confidence;

        let mut metadata = normalized.metadata.clone();
        if let Some(object) = metadata.as_object_mut() {
            object.insert("run_id".to_string(), json!(run_id.clone()));
            object.insert("account_email".to_string(), json!(account_email.clone()));
            object.insert("uid".to_string(), json!(message_uid.clone()));
            object.insert("tags".to_string(), json!(tags.clone()));
            object.insert("summary".to_string(), json!(summary.clone()));
            object.insert("sentiment".to_string(), json!(sentiment.clone()));
            object.insert(
                "previous_categories".to_string(),
                json!(message.existing_analysis.categories.clone()),
            );
            if let Some(previous_metadata) = &message.existing_analysis.metadata {
                object.insert("previous_metadata".to_string(), previous_metadata.clone());
            }
            if let Some(model) = &model_id {
                object.insert("model_id".to_string(), json!(model));
            }
        }

        let validation = if let Some(validator) = &validator_model_id {
            AnalysisValidation {
                validator_model_id: Some(validator.clone()),
                status: Some("pending".to_string()),
                confidence: None,
                notes: None,
                validated_at: None,
            }
        } else {
            AnalysisValidation::default()
        };

        let analysis = AnalysisInsert {
            account_email: message.account_email.clone(),
            uid: message.uid.clone(),
            summary: summary.clone(),
            sentiment: sentiment.clone(),
            categories: tags.clone(),
            metadata_json: metadata.clone(),
            model_id: model_id.clone(),
            analyzed: true,
            analyzed_at: Some(Utc::now().timestamp()),
            analysis_confidence: confidence,
            validation,
        };

        if let Err(err) = storage
            .upsert_analysis(vec![analysis])
            .await
            .map_err(|err| err.to_string())
        {
            failed += 1;
            let pending = total.saturating_sub(completed + failed);
            emit_bulk_event(
                &app,
                json!({
                    "runId": run_id.clone(),
                    "status": "error",
                    "stage": "storage",
                    "error": err,
                    "accountEmail": account_email,
                    "messageUid": message_uid,
                    "total": total,
                    "completed": completed,
                    "failed": failed,
                    "skipped": skipped_existing,
                    "pending": pending,
                    "timestamp": Utc::now().timestamp(),
                    "modelId": model_id.clone(),
                    "validatorModelId": validator_model_id.clone(),
                }),
            );
            continue;
        }

        completed += 1;
        let pending = total.saturating_sub(completed + failed);

        emit_bulk_event(
            &app,
            json!({
                "runId": run_id.clone(),
                "status": "processed",
                "accountEmail": account_email,
                "messageUid": message_uid,
                "total": total,
                "completed": completed,
                "failed": failed,
                "skipped": skipped_existing,
                "pending": pending,
                "timestamp": Utc::now().timestamp(),
                "modelId": model_id.clone(),
                "validatorModelId": validator_model_id.clone(),
                "result": {
                    "summary": summary,
                    "sentiment": sentiment,
                    "tags": tags,
                    "confidence": confidence,
                    "metadata": metadata,
                }
            }),
        );
    }

    let pending = total.saturating_sub(completed + failed);
    emit_bulk_event(
        &app,
        json!({
            "runId": run_id,
            "status": "completed",
            "total": total,
            "completed": completed,
            "failed": failed,
            "skipped": skipped_existing,
            "pending": pending,
            "durationMs": started.elapsed().as_millis(),
            "modelId": model_id,
            "validatorModelId": validator_model_id,
            "timestamp": Utc::now().timestamp(),
        }),
    );

    Ok(())
}

fn known_model_by_id(id: &str) -> Option<&'static KnownModel> {
    KNOWN_MODELS.iter().find(|model| model.id == id)
}

async fn ensure_model_downloaded(
    app: &tauri::AppHandle,
    model: &KnownModel,
    force: bool,
) -> Result<PathBuf, String> {
    let models_dir = models_directory(app)?;
    fs::create_dir_all(&models_dir)
        .await
        .map_err(|err| format!("failed to prepare models directory: {err}"))?;

    let target_path = models_dir.join(model.filename);
    let target_exists = fs::metadata(&target_path).await.is_ok();
    if target_exists && !force {
        return Ok(target_path);
    }

    let tmp_path = target_path.with_extension("tmp");
    if target_exists {
        fs::remove_file(&target_path)
            .await
            .map_err(|err| format!("failed to remove existing model: {err}"))?;
    }
    if fs::metadata(&tmp_path).await.is_ok() {
        let _ = fs::remove_file(&tmp_path).await;
    }

    let client = reqwest::Client::new();
    let response = client
        .get(model.download_url)
        .send()
        .await
        .map_err(|err| format!("failed to download model: {err}"))?;
    let response = response
        .error_for_status()
        .map_err(|err| format!("download returned error status: {err}"))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;

    let mut file = fs::File::create(&tmp_path)
        .await
        .map_err(|err| format!("failed to create temporary model file: {err}"))?;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| format!("error while downloading model: {err}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|err| format!("failed writing model data: {err}"))?;

        downloaded += chunk.len() as u64;

        // Emit progress event
        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64 * 100.0) as u32;
            let _ = app.emit_all("model-download-progress", serde_json::json!({
                "model_id": model.id,
                "downloaded": downloaded,
                "total": total_size,
                "progress": progress
            }));
        }
    }

    file.flush()
        .await
        .map_err(|err| format!("failed to flush model file: {err}"))?;
    drop(file);

    fs::rename(&tmp_path, &target_path)
        .await
        .map_err(|err| format!("failed to finalize model file: {err}"))?;

    // Emit completion event
    let _ = app.emit_all("model-download-progress", serde_json::json!({
        "model_id": model.id,
        "downloaded": total_size,
        "total": total_size,
        "progress": 100
    }));

    Ok(target_path)
}

fn expand_path(input: &str) -> Result<PathBuf, String> {
    if let Some(stripped) = input.strip_prefix("~/") {
        let home =
            std::env::var("HOME").map_err(|_| "HOME environment variable not set".to_string())?;
        Ok(PathBuf::from(home).join(stripped))
    } else {
        Ok(PathBuf::from(input))
    }
}

fn models_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| "App data directory not available".to_string())?;
    Ok(base.join("models"))
}

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
    _state: State<'_, AppState>,
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
                analysis_metadata: message.analysis_metadata,
                analysis_model_id: message.analysis_model_id,
                analysis_analyzed: message.analysis_analyzed,
                analysis_analyzed_at: message.analysis_analyzed_at,
                analysis_confidence: message.analysis_confidence,
                analysis_validator_model_id: message.analysis_validator_model_id,
                analysis_validation_status: message.analysis_validation_status,
                analysis_validation_confidence: message.analysis_validation_confidence,
                analysis_validation_notes: message.analysis_validation_notes,
                analysis_validated_at: message.analysis_validated_at,
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
        metadata_json: Value::Null,
        model_id: None,
        analyzed: false,
        analyzed_at: None,
        analysis_confidence: None,
        validation: AnalysisValidation::default(),
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

#[tauri::command]
async fn get_llm_status(state: State<'_, AppState>) -> Result<LlmStatus, String> {
    Ok(state.llm.status())
}

#[tauri::command]
async fn list_known_llm_models(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<KnownModelResponse>, String> {
    let models_dir = models_directory(&app)?;
    fs::create_dir_all(&models_dir)
        .await
        .map_err(|err| format!("failed to prepare models directory: {err}"))?;

    let active_path = state.llm.configured_path();
    let mut responses = Vec::new();

    for model in KNOWN_MODELS {
        let candidate = models_dir.join(model.filename);
        let metadata = fs::metadata(&candidate).await.ok();
        let downloaded = metadata.is_some();
        let installed_size_bytes = metadata.as_ref().map(|entry| entry.len());
        let active = active_path
            .as_ref()
            .map(|path| path == &candidate)
            .unwrap_or(false);

        responses.push(KnownModelResponse {
            id: model.id,
            name: model.display_name,
            description: model.description,
            filename: model.filename,
            url: model.download_url,
            size_bytes: model.estimated_size_bytes,
            recommended_ram_gb: model.recommended_ram_gb,
            context_length: model.context_length,
            notes: model.notes,
            is_default: model.is_default,
            downloaded,
            active,
            installed_size_bytes,
        });
    }

    Ok(responses)
}

#[tauri::command]
async fn set_llm_model_path(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<LlmStatus, String> {
    let models_dir = models_directory(&app)?;
    fs::create_dir_all(&models_dir)
        .await
        .map_err(|err| format!("failed to prepare models directory: {err}"))?;

    match path {
        Some(path_str) => {
            let expanded = expand_path(&path_str)?;
            let candidate = if expanded.is_absolute() {
                expanded.clone()
            } else {
                models_dir.join(&expanded)
            };

            let metadata = fs::metadata(&candidate)
                .await
                .map_err(|_| format!("model file not found at {}", candidate.display()))?;
            if !metadata.is_file() {
                return Err(format!("model path is not a file: {}", candidate.display()));
            }

            state
                .llm
                .set_model_path(Some(candidate.clone()))
                .map_err(|err| err)?;

            let stored_value = if candidate.starts_with(&models_dir) {
                candidate
                    .strip_prefix(&models_dir)
                    .ok()
                    .map(|p| {
                        p.to_string_lossy()
                            .trim_start_matches(std::path::MAIN_SEPARATOR)
                            .to_string()
                    })
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| candidate.to_string_lossy().to_string())
            } else if expanded.is_relative() {
                expanded.to_string_lossy().to_string()
            } else {
                candidate.to_string_lossy().to_string()
            };

            state
                .storage
                .set_setting(LLM_MODEL_SETTING_KEY, Some(&stored_value))
                .await
                .map_err(|err| err.to_string())?;
        }
        None => {
            state.llm.set_model_path(None).map_err(|err| err)?;
            state
                .storage
                .set_setting(LLM_MODEL_SETTING_KEY, None)
                .await
                .map_err(|err| err.to_string())?;
        }
    }

    Ok(state.llm.status())
}

#[tauri::command]
async fn download_default_llm_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<LlmStatus, String> {
    let model = known_model_by_id(DEFAULT_LLM_MODEL_ID)
        .ok_or_else(|| "default model metadata not available".to_string())?;
    ensure_model_downloaded(&app, model, false).await?;
    set_llm_model_path(app, state, Some(model.filename.to_string())).await
}

#[tauri::command]
async fn download_llm_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    model_id: String,
    activate: Option<bool>,
    force: Option<bool>,
) -> Result<LlmStatus, String> {
    let model =
        known_model_by_id(&model_id).ok_or_else(|| format!("unknown model id: {model_id}"))?;
    ensure_model_downloaded(&app, model, force.unwrap_or(false)).await?;

    if activate.unwrap_or(false) {
        set_llm_model_path(app, state, Some(model.filename.to_string())).await
    } else {
        Ok(state.llm.status())
    }
}

#[tauri::command]
async fn analyze_with_llm(
    state: State<'_, AppState>,
    prompt: String,
    max_tokens: Option<usize>,
) -> Result<String, String> {
    state.llm.analyze_prompt(prompt, max_tokens).await
}

#[tauri::command]
async fn start_bulk_analysis(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    allowed_tags: Vec<String>,
    max_tokens: Option<usize>,
    snippet_limit: Option<usize>,
    force: Option<bool>,
    model_id: Option<String>,
    validator_model_id: Option<String>,
) -> Result<String, String> {
    let run_id = Uuid::new_v4().to_string();
    let run_id_clone = run_id.clone();
    let max_tokens = max_tokens.unwrap_or(512);
    let snippet_limit = snippet_limit.unwrap_or(2048);
    let force = force.unwrap_or(false);

    let storage = state.storage.clone();
    let llm = state.llm.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(err) = execute_bulk_analysis(
            app,
            storage,
            llm,
            run_id_clone,
            allowed_tags,
            max_tokens,
            snippet_limit,
            force,
            model_id,
            validator_model_id,
        )
        .await
        {
            error!(?err, "bulk analysis failed");
        }
    });

    Ok(run_id)
}

fn main() {
    init_tracing();

    tauri::Builder::default()
        .setup(|app| {
            let storage = Storage::initialize(&app.app_handle())
                .map_err(|err| -> Box<dyn std::error::Error> { Box::new(err) })?;

            let data_dir = app.path_resolver().app_data_dir().ok_or_else(
                || -> Box<dyn std::error::Error> {
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "App data directory not available",
                    ))
                },
            )?;
            let models_dir = data_dir.join("models");
            std::fs::create_dir_all(&models_dir)?;

            let llm_service = LlmService::new();

            let stored_model_path = tauri::async_runtime::block_on(async {
                storage
                    .get_setting(LLM_MODEL_SETTING_KEY)
                    .await
                    .map_err(|err| -> Box<dyn std::error::Error> { Box::new(err) })
            })?;

            if let Some(path_string) = stored_model_path {
                let candidate = PathBuf::from(&path_string);
                let resolved_path = if candidate.is_absolute() {
                    candidate
                } else {
                    models_dir.join(candidate)
                };

                if let Err(err) = llm_service.set_model_path(Some(resolved_path.clone())) {
                    warn!(?err, "failed to preload configured LLM model");
                }
            }

            app.manage(AppState::new(storage.clone(), llm_service));
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
            oauth,
            get_llm_status,
            list_known_llm_models,
            set_llm_model_path,
            download_llm_model,
            download_default_llm_model,
            analyze_with_llm,
            start_bulk_analysis
        ])
        .run(tauri::generate_context!())
        .expect("error while running personal mail client application");
}
