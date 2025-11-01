use crate::models::Credentials;
use crate::providers::{self, ProviderError};
use crate::storage::Storage;
use chrono::Utc;
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{interval, sleep, timeout, Duration, Instant};
use tracing::{debug, error, warn};

const MAX_BATCH_SIZE: usize = 15;
const MIN_BATCH_SIZE: usize = 1;
const BATCH_GROWTH_STEP: usize = 4;
const BATCH_DEBOUNCE_MS: u64 = 150;
const BACKOFF_BASE_SECS: u64 = 1;
const BACKOFF_MAX_SECS: u64 = 120;
const SINGLE_DELETE_DELAY_MS: u64 = 200;
const RECONCILE_INTERVAL_SECS: u64 = 45;
const REMOTE_DELETE_EVENT: &str = "remote-delete-status";
const REMOTE_DELETE_ENQUEUED_EVENT: &str = "remote-delete-queued";
const REMOTE_DELETE_METRICS_EVENT: &str = "remote-delete-metrics";
const METRICS_HISTORY_LIMIT: usize = 360;
const METRIC_WINDOW_SECS: i64 = 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModeOverride {
    Auto,
    ForceBatch,
}

impl ModeOverride {
    fn as_str(&self) -> &'static str {
        match self {
            ModeOverride::Auto => "auto",
            ModeOverride::ForceBatch => "force-batch",
        }
    }
}

#[derive(Clone)]
pub struct RemoteDeleteManager {
    inner: Arc<RemoteDeleteInner>,
}

struct RemoteDeleteInner {
    storage: Storage,
    app: AppHandle,
    workers: Mutex<HashMap<String, UnboundedSender<DeleteJob>>>,
    pending: Mutex<HashMap<String, HashSet<String>>>,
    credentials: Mutex<HashMap<String, Credentials>>,
    reconcilers: Mutex<HashMap<String, JoinHandle<()>>>,
    metrics: Mutex<HashMap<String, MetricsState>>,
    overrides: Mutex<HashMap<String, ModeOverride>>,
}

#[derive(Clone)]
struct DeleteJob {
    credentials: Credentials,
    uid: String,
}

impl RemoteDeleteInner {
    async fn register_pending(&self, account_email: &str, uids: &[String]) -> Vec<String> {
        let mut pending = self.pending.lock().await;
        let set = pending
            .entry(account_email.to_string())
            .or_insert_with(HashSet::new);

        let mut newly_added = Vec::new();
        for uid in uids {
            if set.insert(uid.clone()) {
                newly_added.push(uid.clone());
            }
        }
        newly_added
    }

    async fn clear_pending_many(&self, account_email: &str, uids: &[String]) {
        let mut pending = self.pending.lock().await;
        if let Some(set) = pending.get_mut(account_email) {
            for uid in uids {
                set.remove(uid);
            }
            if set.is_empty() {
                pending.remove(account_email);
            }
        }
    }

    async fn cache_credentials(&self, account_email: &str, credentials: &Credentials) {
        let mut map = self.credentials.lock().await;
        map.insert(account_email.to_string(), credentials.clone());
    }

    async fn cached_credentials(&self, account_email: &str) -> Option<Credentials> {
        let map = self.credentials.lock().await;
        map.get(account_email).cloned()
    }

    async fn pending_count(&self, account_email: &str) -> usize {
        let pending = self.pending.lock().await;
        pending
            .get(account_email)
            .map(|set| set.len())
            .unwrap_or(0)
    }

    async fn set_mode_override(&self, account_email: &str, override_mode: ModeOverride) {
        let mut map = self.overrides.lock().await;
        match override_mode {
            ModeOverride::Auto => {
                map.remove(account_email);
            }
            ModeOverride::ForceBatch => {
                map.insert(account_email.to_string(), override_mode);
            }
        }
    }

    async fn mode_override(&self, account_email: &str) -> ModeOverride {
        let map = self.overrides.lock().await;
        map.get(account_email).copied().unwrap_or(ModeOverride::Auto)
    }

    async fn record_metrics(
        &self,
        account_email: &str,
        mode: &str,
        batch_size: usize,
        processed: usize,
        failed: usize,
        pending: usize,
        override_mode: ModeOverride,
    ) {
        let timestamp = Utc::now().timestamp();
        let total_pending = match self
            .storage
            .count_pending_remote_deletes(account_email)
            .await
        {
            Ok(count) => count,
            Err(err) => {
                warn!(account = %account_email, ?err, "failed to count pending remote deletes");
                pending
            }
        };
        let mut metrics_map = self.metrics.lock().await;
        let state = metrics_map
            .entry(account_email.to_string())
            .or_insert_with(MetricsState::default);

        state.history.push_back(MetricsEntry {
            timestamp,
            processed,
            mode: mode.to_string(),
            pending,
        });
        while state.history.len() > METRICS_HISTORY_LIMIT {
            state.history.pop_front();
        }

        let mut processed_window = 0usize;
        let mut earliest = timestamp;
        for entry in state.history.iter().rev() {
            if timestamp - entry.timestamp <= METRIC_WINDOW_SECS {
                processed_window += entry.processed;
                earliest = entry.timestamp;
            } else {
                break;
            }
        }
        let elapsed = (timestamp - earliest).max(1);
        let rate = if processed_window == 0 {
            0.0
        } else {
            (processed_window as f64) * 60.0 / (elapsed as f64)
        };

        let snapshot = RemoteDeleteMetricsSnapshot {
            account_email: account_email.to_string(),
            timestamp,
            mode: mode.to_string(),
            batch_size,
            processed,
            failed,
            pending,
            total_pending,
            rate_per_minute: rate,
            override_mode: override_mode.as_str().to_string(),
        };
        state.last = Some(snapshot.clone());

        let history_export = state
            .history
            .iter()
            .map(|entry| RemoteDeleteMetricsHistoryEntry {
                timestamp: entry.timestamp,
                processed: entry.processed,
                mode: entry.mode.clone(),
                pending: entry.pending,
            })
            .collect::<Vec<_>>();
        drop(metrics_map);

        let response = RemoteDeleteMetricsResponse {
            account_email: account_email.to_string(),
            latest: snapshot,
            history: history_export,
        };

        if let Err(err) = self.app.emit_all(REMOTE_DELETE_METRICS_EVENT, response) {
            warn!(account = %account_email, ?err, "failed to emit remote delete metrics event");
        }
    }

    async fn metrics_response(&self, account_email: &str) -> RemoteDeleteMetricsResponse {
        let (latest, history) = {
            let metrics_map = self.metrics.lock().await;
            if let Some(state) = metrics_map.get(account_email) {
                let history = state
                    .history
                    .iter()
                    .map(|entry| RemoteDeleteMetricsHistoryEntry {
                        timestamp: entry.timestamp,
                        processed: entry.processed,
                        mode: entry.mode.clone(),
                        pending: entry.pending,
                    })
                    .collect::<Vec<_>>();
                let latest = state
                    .last
                    .clone()
                    .unwrap_or_else(|| Self::empty_snapshot(account_email));
                (latest, history)
            } else {
                (Self::empty_snapshot(account_email), Vec::new())
            }
        };

        RemoteDeleteMetricsResponse {
            account_email: account_email.to_string(),
            latest,
            history,
        }
    }

    fn empty_snapshot(account_email: &str) -> RemoteDeleteMetricsSnapshot {
        RemoteDeleteMetricsSnapshot {
            account_email: account_email.to_string(),
            timestamp: Utc::now().timestamp(),
            mode: "idle".to_string(),
            batch_size: 0,
            processed: 0,
            failed: 0,
            pending: 0,
            total_pending: 0,
            rate_per_minute: 0.0,
            override_mode: ModeOverride::Auto.as_str().to_string(),
        }
    }
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

#[derive(Serialize, Clone)]
struct RemoteDeleteQueuedPayload {
    account_email: String,
    uids: Vec<String>,
}

#[derive(Clone)]
struct MetricsEntry {
    timestamp: i64,
    processed: usize,
    mode: String,
    pending: usize,
}

#[derive(Clone, Default)]
struct MetricsState {
    history: VecDeque<MetricsEntry>,
    last: Option<RemoteDeleteMetricsSnapshot>,
}

#[derive(Serialize, Clone)]
pub struct RemoteDeleteMetricsSnapshot {
    pub account_email: String,
    pub timestamp: i64,
    pub mode: String,
    pub batch_size: usize,
    pub processed: usize,
    pub failed: usize,
    pub pending: usize,
    pub total_pending: usize,
    pub rate_per_minute: f64,
    pub override_mode: String,
}

#[derive(Serialize, Clone)]
pub struct RemoteDeleteMetricsHistoryEntry {
    pub timestamp: i64,
    pub processed: usize,
    pub mode: String,
    pub pending: usize,
}

#[derive(Serialize, Clone)]
pub struct RemoteDeleteMetricsResponse {
    pub account_email: String,
    pub latest: RemoteDeleteMetricsSnapshot,
    pub history: Vec<RemoteDeleteMetricsHistoryEntry>,
}

impl RemoteDeleteManager {
    pub fn new(storage: Storage, app: AppHandle) -> Self {
        let inner = RemoteDeleteInner {
            storage,
            app,
            workers: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            credentials: Mutex::new(HashMap::new()),
            reconcilers: Mutex::new(HashMap::new()),
            metrics: Mutex::new(HashMap::new()),
            overrides: Mutex::new(HashMap::new()),
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
        let normalized = account_email.trim().to_lowercase();
        let new_items = self
            .enqueue_many_internal(&normalized, &credentials, vec![uid])
            .await?;

        if !new_items.is_empty() {
            self.emit_enqueued(&normalized, &new_items);
        }

        self.ensure_reconciler(&normalized).await;
        Ok(())
    }

    pub async fn resume_account(&self, credentials: Credentials) -> Result<(), String> {
        let account_email = credentials.email.trim().to_lowercase();
        self.inner.cache_credentials(&account_email, &credentials).await;
        self.inner
            .set_mode_override(&account_email, ModeOverride::Auto)
            .await;

        let pending = self
            .inner
            .storage
            .pending_remote_deletes(&account_email, MAX_BATCH_SIZE * 10)
            .await
            .map_err(|err| err.to_string())?;

        let mut retry_uids = Vec::new();
        for (uid, remote_error) in pending {
            if should_retry_remote_error(&remote_error) {
                if remote_error.is_some() {
                    if let Err(err) = self
                        .inner
                        .storage
                        .mark_deleted_remote(&account_email, &uid, None, None)
                        .await
                    {
                        warn!(account = %account_email, %uid, ?err, "failed to clear remote delete error before retry");
                        continue;
                    }
                }
                retry_uids.push(uid);
            }
        }

        if !retry_uids.is_empty() {
            let new_items = self
                .enqueue_many_internal(&account_email, &credentials, retry_uids)
                .await?;
            if !new_items.is_empty() {
                self.emit_enqueued(&account_email, &new_items);
            }
        }

        self.ensure_reconciler(&account_email).await;
        Ok(())
    }

    pub async fn get_metrics(&self, account_email: &str) -> RemoteDeleteMetricsResponse {
        let normalized = account_email.trim().to_lowercase();
        let mut response = self.inner.metrics_response(&normalized).await;
        response.latest.pending = self.inner.pending_count(&normalized).await;
        if let Ok(total) = self
            .inner
            .storage
            .count_pending_remote_deletes(&normalized)
            .await
        {
            response.latest.total_pending = total;
        }
        response
    }

    pub async fn set_mode(&self, account_email: &str, mode: ModeOverride) {
        let normalized = account_email.trim().to_lowercase();
        self.inner.set_mode_override(&normalized, mode).await;
        self.ensure_worker(&normalized).await;
        self.ensure_reconciler(&normalized).await;
    }

    async fn ensure_worker(&self, account_email: &str) -> UnboundedSender<DeleteJob> {
        let mut workers = self.inner.workers.lock().await;
        if let Some(existing) = workers.get(account_email) {
            return existing.clone();
        }

        let (tx, rx) = unbounded_channel();
        self.spawn_worker(account_email.to_string(), tx.clone(), rx);
        workers.insert(account_email.to_string(), tx.clone());
        tx
    }

    async fn enqueue_many_internal(
        &self,
        account_email: &str,
        credentials: &Credentials,
        mut uids: Vec<String>,
    ) -> Result<Vec<String>, String> {
        if uids.is_empty() {
            return Ok(Vec::new());
        }

        uids.retain(|uid| !uid.trim().is_empty());
        if uids.is_empty() {
            return Ok(Vec::new());
        }

        self.inner
            .cache_credentials(account_email, credentials)
            .await;

        let sender = self.ensure_worker(account_email).await;
        let new_items = self.inner.register_pending(account_email, &uids).await;

        if new_items.is_empty() {
            return Ok(Vec::new());
        }

        for uid in &new_items {
            if let Err(err) = sender.send(DeleteJob {
                credentials: credentials.clone(),
                uid: uid.clone(),
            }) {
                self.inner
                    .clear_pending_many(account_email, &[uid.clone()])
                    .await;
                return Err(format!("queue closed: {err}"));
            }
        }

        Ok(new_items)
    }

    fn emit_enqueued(&self, account_email: &str, uids: &[String]) {
        if uids.is_empty() {
            return;
        }

        if let Err(err) = self.inner.app.emit_all(
            REMOTE_DELETE_ENQUEUED_EVENT,
            RemoteDeleteQueuedPayload {
                account_email: account_email.to_string(),
                uids: uids.to_vec(),
            },
        ) {
            warn!(account = %account_email, ?err, "failed to emit remote delete queue event");
        }
    }

    async fn ensure_reconciler(&self, account_email: &str) {
        let mut reconcilers = self.inner.reconcilers.lock().await;
        if reconcilers.contains_key(account_email) {
            return;
        }

        let manager_clone = self.clone();
        let email = account_email.to_string();
        let handle = tokio::spawn(async move {
            reconciliation_loop(manager_clone, email).await;
        });

        reconcilers.insert(account_email.to_string(), handle);
    }
    fn spawn_worker(
        &self,
        account_email: String,
        sender: UnboundedSender<DeleteJob>,
        rx: UnboundedReceiver<DeleteJob>,
    ) {
        let inner = self.inner.clone();

        tokio::spawn(async move {
            run_account_worker(inner, account_email, sender, rx).await;
        });
    }
}

    async fn reconciliation_loop(manager: RemoteDeleteManager, account_email: String) {
        let mut ticker = interval(Duration::from_secs(RECONCILE_INTERVAL_SECS));

        loop {
            ticker.tick().await;

            let Some(credentials) = manager
                .inner
                .cached_credentials(&account_email)
                .await
            else {
                continue;
            };

            let pending = match manager
                .inner
                .storage
                .pending_remote_deletes(&account_email, MAX_BATCH_SIZE * 10)
                .await
            {
                Ok(items) => items,
                Err(err) => {
                    warn!(account = %account_email, ?err, "failed to load pending remote deletes during reconciliation");
                    continue;
                }
            };

            if pending.is_empty() {
                continue;
            }

            let mut retry_uids = Vec::new();
            for (uid, remote_error) in pending {
                if should_retry_remote_error(&remote_error) {
                    if remote_error.is_some() {
                        if let Err(err) = manager
                            .inner
                            .storage
                            .mark_deleted_remote(&account_email, &uid, None, None)
                            .await
                        {
                            warn!(account = %account_email, %uid, ?err, "failed to clear remote delete error before reconciliation");
                            continue;
                        }
                    }
                    retry_uids.push(uid);
                }
            }

            if retry_uids.is_empty() {
                continue;
            }

            match manager
                .enqueue_many_internal(&account_email, &credentials, retry_uids)
                .await
            {
                Ok(new_items) => {
                    if !new_items.is_empty() {
                        manager.emit_enqueued(&account_email, &new_items);
                    }
                }
                Err(err) => {
                    warn!(account = %account_email, ?err, "failed to enqueue pending remote deletes during reconciliation");
                }
            }
        }
    }

async fn run_account_worker(
    inner: Arc<RemoteDeleteInner>,
    account_email: String,
    sender: UnboundedSender<DeleteJob>,
    mut rx: UnboundedReceiver<DeleteJob>,
) {
    let mut current_batch_size = MAX_BATCH_SIZE;
    let mut cooldown_until: Option<Instant> = None;
    let mut consecutive_failures: u32 = 0;

    while let Some(first_job) = rx.recv().await {
        if let Some(until) = cooldown_until {
            let now = Instant::now();
            if until > now {
                sleep(until - now).await;
            }
        }

        let override_mode = inner.mode_override(&account_email).await;
        let force_batch = matches!(override_mode, ModeOverride::ForceBatch);

        let mut batch = vec![first_job];

        while batch.len() < current_batch_size {
            match timeout(Duration::from_millis(BATCH_DEBOUNCE_MS), rx.recv()).await {
                Ok(Some(next_job)) => batch.push(next_job),
                Ok(None) => break,
                Err(_) => break,
            }
        }

        let credentials = batch
            .last()
            .map(|job| job.credentials.clone())
            .unwrap_or_else(|| batch[0].credentials.clone());
        let uids: Vec<String> = batch.iter().map(|job| job.uid.clone()).collect();
        let batch_size_executed = batch.len();
        let mut used_single_fallback = false;
        let mut encountered_rate_limit = false;

        debug!(
            account = %account_email,
            size = uids.len(),
            batch_size = current_batch_size,
            "processing remote delete batch"
        );

        let batch_result = execute_batch(&credentials, &uids).await;

        let mut updates: Vec<RemoteDeleteUpdate> = Vec::with_capacity(uids.len());

        match batch_result {
            Ok(_) => {
                consecutive_failures = 0;
                cooldown_until = None;
                current_batch_size = (current_batch_size + BATCH_GROWTH_STEP).min(MAX_BATCH_SIZE);

                let timestamp = Utc::now().timestamp();
                for uid in &uids {
                    match inner
                        .storage
                        .mark_deleted_remote(&account_email, uid, Some(timestamp), None)
                        .await
                    {
                        Ok(_) => updates.push(RemoteDeleteUpdate {
                            uid: uid.clone(),
                            remote_deleted_at: Some(timestamp),
                            remote_error: None,
                        }),
                        Err(err) => {
                            error!(account = %account_email, %uid, ?err, "failed to mark remote delete success");
                        }
                    }
                }
            }
            Err(err) => {
                let rate_limited = is_rate_limit_error(&err);
                encountered_rate_limit = rate_limited;
                consecutive_failures = consecutive_failures.saturating_add(1);
                current_batch_size = current_batch_size
                    .saturating_sub(BATCH_GROWTH_STEP)
                    .max(MIN_BATCH_SIZE);

                if rate_limited {
                    let backoff = compute_backoff(consecutive_failures);
                    cooldown_until = Some(Instant::now() + backoff);
                    warn!(
                        account = %account_email,
                        backoff_secs = backoff.as_secs(),
                        size = uids.len(),
                        "IMAP rate limit encountered during batch delete"
                    );
                } else {
                    warn!(
                        account = %account_email,
                        size = uids.len(),
                        ?err,
                        "batched remote delete failed; falling back to per-message deletes"
                    );
                }

                if rate_limited && force_batch {
                    if let Some(until) = cooldown_until {
                        let now = Instant::now();
                        if until > now {
                            sleep(until - now).await;
                        }
                    }
                    for job in batch {
                        if let Err(send_err) = sender.send(job) {
                            error!(account = %account_email, ?send_err, "failed to requeue delete job after rate limit");
                            break;
                        }
                    }
                    let pending = inner.pending_count(&account_email).await;
                    inner
                        .record_metrics(
                            &account_email,
                            "batch-rate-limit",
                            current_batch_size,
                            0,
                            0,
                            pending,
                            override_mode,
                        )
                        .await;
                    continue;
                }

                for job in &batch {
                    if let Some(until) = cooldown_until {
                        let now = Instant::now();
                        if until > now {
                            sleep(until - now).await;
                        }
                        cooldown_until = None;
                    }

                    let result = providers::delete_message(&job.credentials, &job.uid).await;

                    if rate_limited {
                        sleep(Duration::from_millis(SINGLE_DELETE_DELAY_MS)).await;
                    }

                    match result {
                        Ok(_) => {
                            let timestamp = Utc::now().timestamp();
                            if let Err(err) = inner
                                .storage
                                .mark_deleted_remote(&account_email, &job.uid, Some(timestamp), None)
                                .await
                            {
                                error!(account = %account_email, uid = %job.uid, ?err, "failed to mark remote delete success (fallback)");
                                continue;
                            }
                            updates.push(RemoteDeleteUpdate {
                                uid: job.uid.clone(),
                                remote_deleted_at: Some(timestamp),
                                remote_error: None,
                            });
                        }
                        Err(single_err) => {
                            let message = provider_error_to_message(single_err);
                            if let Err(storage_err) = inner
                                .storage
                                .mark_deleted_remote(&account_email, &job.uid, None, Some(message.clone()))
                                .await
                            {
                                error!(account = %account_email, uid = %job.uid, ?storage_err, "failed to mark remote delete error");
                                continue;
                            }
                            updates.push(RemoteDeleteUpdate {
                                uid: job.uid.clone(),
                                remote_deleted_at: None,
                                remote_error: Some(message),
                            });
                        }
                    }

                    used_single_fallback = true;
                }

                if rate_limited {
                    cooldown_until = Some(Instant::now() + compute_backoff(consecutive_failures));
                }
            }
        }

        let success_count = updates
            .iter()
            .filter(|item| item.remote_deleted_at.is_some())
            .count();
        let failed_count = updates.len().saturating_sub(success_count);

        if !updates.is_empty() {
            if let Err(err) = inner.app.emit_all(
                REMOTE_DELETE_EVENT,
                RemoteDeleteEventPayload {
                    account_email: account_email.clone(),
                    updates,
                },
            ) {
                error!(account = %account_email, ?err, "failed to emit remote delete event");
            }
        }

        inner.clear_pending_many(&account_email, &uids).await;
        let pending = inner.pending_count(&account_email).await;

        let (mode_label, metrics_batch_size) = if used_single_fallback {
            if success_count > 0 && failed_count == 0 {
                ("single", 1)
            } else if success_count > 0 {
                ("single-mixed", 1)
            } else {
                ("single-failed", 1)
            }
        } else if batch_size_executed > 1 {
            if failed_count == 0 {
                ("batch", batch_size_executed)
            } else {
                ("batch-mixed", batch_size_executed)
            }
        } else if success_count > 0 {
            ("single", 1)
        } else if encountered_rate_limit {
            ("batch-rate-limit", batch_size_executed)
        } else if failed_count > 0 {
            ("single-failed", 1)
        } else {
            ("idle", batch_size_executed)
        };

        inner
            .record_metrics(
                &account_email,
                mode_label,
                metrics_batch_size,
                success_count,
                failed_count,
                pending,
                override_mode,
            )
            .await;
    }
}

async fn execute_batch(credentials: &Credentials, uids: &[String]) -> Result<(), ProviderError> {
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
            Err(err)
        }
    }
}

fn compute_backoff(consecutive_failures: u32) -> Duration {
    let exponent = consecutive_failures.min(6);
    let multiplier = 1u64 << exponent;
    let secs = BACKOFF_BASE_SECS.saturating_mul(multiplier).min(BACKOFF_MAX_SECS);
    Duration::from_secs(secs)
}

fn is_rate_limit_error(error: &ProviderError) -> bool {
    match error {
        ProviderError::Imap(message)
        | ProviderError::Network(message)
        | ProviderError::Other(message) => {
            let lowered = message.to_lowercase();
            lowered.contains("rate")
                || lowered.contains("too many")
                || lowered.contains("temporarily")
                || lowered.contains("unavailable")
                || lowered.contains("try again later")
        }
        _ => false,
    }
}

fn should_retry_remote_error(remote_error: &Option<String>) -> bool {
    match remote_error {
        None => true,
        Some(message) => {
            let lowered = message.to_lowercase();
            !(lowered.contains("no such message")
                || lowered.contains("not found")
                || lowered.contains("already expunged")
                || lowered.contains("invalid uid"))
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
