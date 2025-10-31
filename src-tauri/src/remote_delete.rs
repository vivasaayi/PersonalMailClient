use crate::models::Credentials;
use crate::providers::{self, ProviderError};
use crate::storage::Storage;
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};
use tracing::{debug, error, warn};

const MAX_BATCH_SIZE: usize = 20;
const BATCH_DEBOUNCE_MS: u64 = 350;
const REMOTE_DELETE_EVENT: &str = "remote-delete-status";

#[derive(Clone)]
pub struct RemoteDeleteManager {
    inner: Arc<RemoteDeleteInner>,
}

struct RemoteDeleteInner {
    storage: Storage,
    app: AppHandle,
    workers: Mutex<HashMap<String, UnboundedSender<DeleteJob>>>,
}

struct DeleteJob {
    credentials: Credentials,
    uid: String,
}

#[derive(Serialize, Clone)]
struct RemoteDeleteEventPayload {
    account_email: String,
    updates: Vec<RemoteDeleteUpdate>,
}

#[derive(Serialize, Clone)]
struct RemoteDeleteUpdate {
    uid: String,
    remote_deleted_at: Option<i64>,
    remote_error: Option<String>,
}

impl RemoteDeleteManager {
    pub fn new(storage: Storage, app: AppHandle) -> Self {
        let inner = RemoteDeleteInner {
            storage,
            app,
            workers: Mutex::new(HashMap::new()),
        };
        Self {
            inner: Arc::new(inner),
        }
    }

    pub async fn enqueue(
        &self,
        account_email: &str,
        credentials: Credentials,
        uid: String,
    ) -> Result<(), String> {
        let sender = {
            let mut workers = self.inner.workers.lock().await;
            if let Some(existing) = workers.get(account_email) {
                existing.clone()
            } else {
                let (tx, rx) = unbounded_channel();
                self.spawn_worker(account_email.to_string(), rx);
                workers.insert(account_email.to_string(), tx.clone());
                tx
            }
        };

        sender
            .send(DeleteJob { credentials, uid })
            .map_err(|err| format!("queue closed: {err}"))
    }

    fn spawn_worker(&self, account_email: String, rx: UnboundedReceiver<DeleteJob>) {
        let storage = self.inner.storage.clone();
        let app = self.inner.app.clone();

        tokio::spawn(async move {
            run_account_worker(account_email, storage, app, rx).await;
        });
    }
}

async fn run_account_worker(
    account_email: String,
    storage: Storage,
    app: AppHandle,
    mut rx: UnboundedReceiver<DeleteJob>,
) {
    while let Some(first_job) = rx.recv().await {
        let mut batch = vec![first_job];

        while batch.len() < MAX_BATCH_SIZE {
            match timeout(Duration::from_millis(BATCH_DEBOUNCE_MS), rx.recv()).await {
                Ok(Some(next_job)) => {
                    batch.push(next_job);
                }
                Ok(None) => {
                    break;
                }
                Err(_) => {
                    break;
                }
            }
        }

        let credentials = batch
            .last()
            .map(|job| job.credentials.clone())
            .unwrap_or_else(|| batch[0].credentials.clone());
        let uids: Vec<String> = batch.iter().map(|job| job.uid.clone()).collect();

        debug!(
            account = %account_email,
            size = uids.len(),
            "processing remote delete batch"
        );

        let mut results = execute_batch(&credentials, &uids).await;
        if results.is_err() {
            warn!(account = %account_email, "batched delete failed; falling back to per-message deletes");
            results = Err(());
        }

        let outcomes = match results {
            Ok(_) => uids
                .into_iter()
                .map(|uid| (uid, Ok(())))
                .collect::<Vec<_>>(),
            Err(_) => {
                let mut per_item = Vec::new();
                for job in &batch {
                    let result = providers::delete_message(&job.credentials, &job.uid).await;
                    per_item.push((job.uid.clone(), result));
                }
                per_item
            }
        };

        let mut updates = Vec::with_capacity(outcomes.len());
        for (uid, outcome) in outcomes {
            match outcome {
                Ok(_) => {
                    let timestamp = Utc::now().timestamp();
                    if let Err(err) = storage
                        .mark_deleted_remote(&account_email, &uid, Some(timestamp), None)
                        .await
                    {
                        error!(account = %account_email, %uid, ?err, "failed to mark remote delete success");
                        continue;
                    }
                    updates.push(RemoteDeleteUpdate {
                        uid,
                        remote_deleted_at: Some(timestamp),
                        remote_error: None,
                    });
                }
                Err(err) => {
                    let message = provider_error_to_message(err);
                    if let Err(storage_err) = storage
                        .mark_deleted_remote(&account_email, &uid, None, Some(message.clone()))
                        .await
                    {
                        error!(account = %account_email, %uid, ?storage_err, "failed to mark remote delete error");
                        continue;
                    }
                    updates.push(RemoteDeleteUpdate {
                        uid,
                        remote_deleted_at: None,
                        remote_error: Some(message),
                    });
                }
            }
        }

        if updates.is_empty() {
            continue;
        }

        if let Err(err) = app.emit_all(
            REMOTE_DELETE_EVENT,
            RemoteDeleteEventPayload {
                account_email: account_email.clone(),
                updates,
            },
        ) {
            error!(account = %account_email, ?err, "failed to emit remote delete event");
        }
    }
}

async fn execute_batch(credentials: &Credentials, uids: &[String]) -> Result<(), ()> {
    if uids.is_empty() {
        return Ok(());
    }

    match providers::delete_messages(credentials, uids).await {
        Ok(_) => Ok(()),
        Err(err) => {
            warn!(
                account = %credentials.email,
                size = uids.len(),
                ?err,
                "batched remote delete request failed"
            );
            Err(())
        }
    }
}

fn provider_error_to_message(error: ProviderError) -> String {
    match error {
        ProviderError::Authentication(message) => message,
        ProviderError::Network(message) => format!("Network error: {message}"),
        ProviderError::Imap(message) => format!("IMAP error: {message}"),
        ProviderError::Other(message) => message,
    }
}
