use crate::models::{Credentials, EmailSummary, MailAddress};
use crate::providers::{BatchResult, MessageEnvelope, ProviderError, SyncWindow};
use chrono::{Duration, NaiveDate};
use ::imap::types::{Fetch, Flag};
use ::imap_proto::types::Address;
use native_tls::{TlsConnector, TlsStream};
use std::net::TcpStream;
use std::time::Instant;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::task::{self, JoinHandle};
use tracing::info;

const MAX_UIDS_PER_SEARCH: usize = 900; // stay safely below Yahoo's 1k cap

pub async fn verify_credentials(credentials: &Credentials) -> Result<(), ProviderError> {
    let credentials = credentials.clone();

    task::spawn_blocking(move || verify_credentials_blocking(credentials))
        .await
        .map_err(|err| ProviderError::Other(format!("Background task failure: {err}")))?
}

pub async fn fetch_recent(
    credentials: &Credentials,
    limit: usize,
) -> Result<Vec<EmailSummary>, ProviderError> {
    let credentials = credentials.clone();
    let limit = limit.min(200);

    task::spawn_blocking(move || fetch_recent_blocking(credentials, limit))
        .await
        .map_err(|err| ProviderError::Other(format!("Background task failure: {err}")))?
}

pub async fn fetch_all(
    credentials: &Credentials,
    since_uid: Option<u32>,
    chunk_size: usize,
    window: Option<SyncWindow>,
) -> Result<
    (
        UnboundedReceiver<BatchResult>,
        JoinHandle<Result<(), ProviderError>>,
    ),
    ProviderError,
> {
    let credentials = credentials.clone();
    let chunk = chunk_size.clamp(50, 1000);
    let window = window.clone();
    let (tx, rx) = unbounded_channel();

    let handle = task::spawn_blocking(move || {
        fetch_all_blocking(credentials, since_uid, chunk, window, tx)
    });

    Ok((rx, handle))
}

pub async fn delete_message(credentials: &Credentials, uid: &str) -> Result<(), ProviderError> {
    let credentials = credentials.clone();
    let uid = uid.to_string();

    task::spawn_blocking(move || delete_message_blocking(credentials, uid))
        .await
        .map_err(|err| ProviderError::Other(format!("Background task failure: {err}")))?
}

pub async fn delete_messages(
    credentials: &Credentials,
    uids: &[String],
) -> Result<(), ProviderError> {
    if uids.is_empty() {
        return Ok(());
    }

    let credentials = credentials.clone();
    let items = uids.to_vec();

    task::spawn_blocking(move || delete_messages_blocking(credentials, items))
        .await
        .map_err(|err| ProviderError::Other(format!("Background task failure: {err}")))?
}

pub async fn move_blocked(
    credentials: &Credentials,
    senders: &[String],
    target_folder: &str,
) -> Result<usize, ProviderError> {
    let credentials = credentials.clone();
    let senders = senders.to_vec();
    let folder = target_folder.to_string();

    task::spawn_blocking(move || move_blocked_blocking(credentials, senders, folder))
        .await
        .map_err(|err| ProviderError::Other(format!("Background task failure: {err}")))?
}

fn fetch_recent_blocking(
    credentials: Credentials,
    limit: usize,
) -> Result<Vec<EmailSummary>, ProviderError> {
    let domain = credentials
        .custom_host
        .as_deref()
        .unwrap_or_else(|| credentials.provider.imap_host());
    let port = credentials.custom_port.unwrap_or(993);
    let tls = TlsConnector::builder()
        .build()
        .map_err(|err| ProviderError::Network(err.to_string()))?;
    let client = ::imap::connect((domain, port), domain, &tls)
        .map_err(|err| ProviderError::Network(err.to_string()))?;

    let mut session = match client.login(&credentials.email, &credentials.password) {
        Ok(session) => session,
        Err((err, _client)) => {
            return Err(ProviderError::Authentication(err.to_string()));
        }
    };

    let mailbox = session.select("INBOX")?;

    // For fetch_recent, we can use a simpler approach: get the last N messages by sequence number
    // This is more efficient than fetching all UIDs first
    let exists = mailbox.exists;
    if exists == 0 {
        session.logout()?;
        return Ok(Vec::new());
    }

    let start_seq = exists.saturating_sub(limit as u32).max(1);
    let end_seq = exists;
    let seq_query = format!("{}:{}", start_seq, end_seq);
    
    // Fetch UIDs for this sequence range first
    let fetch_results = session.fetch(&seq_query, "UID")?;
    let mut uids: Vec<u32> = fetch_results
        .iter()
        .filter_map(|fetch| fetch.uid)
        .collect();

    if uids.is_empty() {
        session.logout()?;
        return Ok(Vec::new());
    }

    uids.sort_unstable();
    let selected = &uids[..];
    let query = selected
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");

    let fetches = session.uid_fetch(&query, "(ENVELOPE INTERNALDATE)")?;
    let mut emails: Vec<EmailSummary> = fetches
        .iter()
        .filter_map(|item| summarize_fetch(item))
        .collect();

    emails.sort_by(|a, b| b.date.cmp(&a.date));

    session.logout()?;
    Ok(emails)
}

fn verify_credentials_blocking(credentials: Credentials) -> Result<(), ProviderError> {
    let domain = credentials
        .custom_host
        .as_deref()
        .unwrap_or_else(|| credentials.provider.imap_host());
    let port = credentials.custom_port.unwrap_or(993);
    let tls = TlsConnector::builder()
        .build()
        .map_err(|err| ProviderError::Network(err.to_string()))?;
    let client = ::imap::connect((domain, port), domain, &tls)
        .map_err(|err| ProviderError::Network(err.to_string()))?;

    let mut session = match client.login(&credentials.email, &credentials.password) {
        Ok(session) => session,
        Err((err, _client)) => {
            return Err(ProviderError::Authentication(err.to_string()));
        }
    };

    // Ensure the inbox can be selected to validate permissions.
    session.select("INBOX")?;
    session.logout()?;
    Ok(())
}

fn fetch_all_blocking(
    credentials: Credentials,
    since_uid: Option<u32>,
    chunk_size: usize,
    window: Option<SyncWindow>,
    tx: UnboundedSender<BatchResult>,
) -> Result<(), ProviderError> {
    let domain = credentials
        .custom_host
        .as_deref()
        .unwrap_or_else(|| credentials.provider.imap_host());
    let port = credentials.custom_port.unwrap_or(993);
    let tls = TlsConnector::builder()
        .build()
        .map_err(|err| ProviderError::Network(err.to_string()))?;
    let client = ::imap::connect((domain, port), domain, &tls)
        .map_err(|err| ProviderError::Network(err.to_string()))?;

    let mut session = match client.login(&credentials.email, &credentials.password) {
        Ok(session) => session,
        Err((err, _client)) => {
            return Err(ProviderError::Authentication(err.to_string()));
        }
    };

    let mailbox = session.select("INBOX")?;

    let mut uids: Vec<u32> = if let Some(window) = window {
        collect_uids_for_window(&mut session, &credentials.email, window)?
    } else {
        collect_all_uids(&mut session, &credentials.email, mailbox.uid_next.unwrap_or(1))?
    };

    if uids.is_empty() {
        session.logout()?;
        return Ok(());
    }

    uids.sort_unstable();

    let filtered: Vec<u32> = match since_uid {
        Some(threshold) => uids.into_iter().filter(|uid| *uid > threshold).collect(),
        None => uids,
    };

    if filtered.is_empty() {
        session.logout()?;
        return Ok(());
    }

    info!(
        account = %credentials.email,
        total_uids = filtered.len(),
        chunk_size,
        since_uid,
        "full sync message set ready"
    );

    let total_batches = (filtered.len() + chunk_size - 1) / chunk_size;
    for (batch_index, chunk) in filtered.chunks(chunk_size).enumerate() {
        let batch_start = Instant::now();
        let query = chunk
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(",");

        let fetches = session.uid_fetch(
            &query,
            "(ENVELOPE INTERNALDATE BODY.PEEK[TEXT]<0.4096> FLAGS)",
        )?;

        let mut batch_envelopes: Vec<MessageEnvelope> = Vec::with_capacity(fetches.len());
        for item in fetches.iter() {
            if let Some(summary) = summarize_fetch(item) {
                let snippet = extract_body_snippet(item);
                let body = item.body().map(|bytes| bytes.to_vec());
                let flags = extract_flags(item);
                batch_envelopes.push(MessageEnvelope {
                    summary,
                    snippet,
                    body,
                    flags,
                });
            }
        }

        let batch_duration = batch_start.elapsed().as_millis() as u64;
        let processed = batch_envelopes.len();
        let result = BatchResult {
            index: batch_index + 1,
            total: total_batches,
            requested: chunk.len(),
            fetched: processed,
            messages: batch_envelopes,
        };
        tx.send(result)
            .map_err(|_| ProviderError::Other("progress channel closed".into()))?;
        info!(
            account = %credentials.email,
            batch = batch_index + 1,
            total_batches,
            requested_uids = chunk.len(),
            fetched_items = fetches.len(),
            processed_messages = processed,
            batch_duration_ms = batch_duration,
            "full sync batch completed"
        );
    }

    session.logout()?;
    Ok(())
}

fn collect_all_uids(
    session: &mut ::imap::Session<TlsStream<TcpStream>>,
    account_email: &str,
    uid_next: u32,
) -> Result<Vec<u32>, ProviderError> {
    if uid_next <= 1 {
        return Ok(Vec::new());
    }

    let mut uids: Vec<u32> = Vec::new();
    let batch_size: u32 = 10_000;
    let mut start_uid: u32 = 1;
    let max_uid = uid_next - 1;

    while start_uid <= max_uid {
        let end_uid = (start_uid + batch_size - 1).min(max_uid);
        let query = format!("{}:{}", start_uid, end_uid);

        match session.uid_fetch(&query, "UID") {
            Ok(fetch_results) => {
                for fetch in fetch_results.iter() {
                    if let Some(uid) = fetch.uid {
                        uids.push(uid);
                    }
                }
            }
            Err(err) => {
                info!(account = %account_email, range = %query, error = %err, "failed to fetch UID batch, continuing with partial results");
                break;
            }
        }

        start_uid = end_uid + 1;
    }

    Ok(uids)
}

fn collect_uids_for_window(
    session: &mut ::imap::Session<TlsStream<TcpStream>>,
    account_email: &str,
    window: SyncWindow,
) -> Result<Vec<u32>, ProviderError> {
    let mut collected = Vec::new();

    if let Some(before) = window.before {
        let mut stack = vec![(window.since, before)];
        while let Some((start, end)) = stack.pop() {
            if start >= end {
                continue;
            }

            let query = format!(
                "SINCE {} BEFORE {}",
                format_imap_date(start),
                format_imap_date(end)
            );

            match session.uid_search(&query) {
                Ok(uids) => {
                    let count = uids.len();
                    if count >= MAX_UIDS_PER_SEARCH {
                        let span_days = end.signed_duration_since(start).num_days();
                        if span_days > 1 {
                            let half = span_days / 2;
                            let midpoint = start + Duration::days(half.max(1));
                            if midpoint > start && midpoint < end {
                                stack.push((midpoint, end));
                                stack.push((start, midpoint));
                                continue;
                            }
                        }
                        info!(account = %account_email, start = %start, end = %end, count, threshold = MAX_UIDS_PER_SEARCH, "window search reached Yahoo cap; cannot split further");
                    }
                    collected.extend(uids);
                }
                Err(err) => {
                    info!(account = %account_email, start = %start, end = %end, ?err, "failed to execute windowed search");
                    return Err(ProviderError::from(err));
                }
            }
        }
    } else {
        let query = format!("SINCE {}", format_imap_date(window.since));
        let uids = session.uid_search(&query)?;
        collected.extend(uids);
    }

    collected.sort_unstable();
    collected.dedup();
    Ok(collected)
}

fn format_imap_date(date: NaiveDate) -> String {
    date.format("%d-%b-%Y").to_string()
}

fn delete_message_blocking(credentials: Credentials, uid: String) -> Result<(), ProviderError> {
    let domain = credentials
        .custom_host
        .as_deref()
        .unwrap_or_else(|| credentials.provider.imap_host());
    let port = credentials.custom_port.unwrap_or(993);
    let tls = TlsConnector::builder()
        .build()
        .map_err(|err| ProviderError::Network(err.to_string()))?;
    let client = ::imap::connect((domain, port), domain, &tls)
        .map_err(|err| ProviderError::Network(err.to_string()))?;

    let mut session = match client.login(&credentials.email, &credentials.password) {
        Ok(session) => session,
        Err((err, _client)) => return Err(ProviderError::Authentication(err.to_string())),
    };

    session.select("INBOX")?;
    let trash_folder = credentials.provider.trash_folder();
    let _ = session.create(trash_folder);
    session.uid_copy(&uid, trash_folder)?;
    session.uid_store(&uid, "+FLAGS (\\Deleted)")?;
    session.expunge()?;
    session.logout()?;
    Ok(())
}

fn delete_messages_blocking(
    credentials: Credentials,
    uids: Vec<String>,
) -> Result<(), ProviderError> {
    let domain = credentials
        .custom_host
        .as_deref()
        .unwrap_or_else(|| credentials.provider.imap_host());
    let port = credentials.custom_port.unwrap_or(993);
    let tls = TlsConnector::builder()
        .build()
        .map_err(|err| ProviderError::Network(err.to_string()))?;
    let client = ::imap::connect((domain, port), domain, &tls)
        .map_err(|err| ProviderError::Network(err.to_string()))?;

    let mut session = match client.login(&credentials.email, &credentials.password) {
        Ok(session) => session,
        Err((err, _client)) => return Err(ProviderError::Authentication(err.to_string())),
    };

    session.select("INBOX")?;
    let trash_folder = credentials.provider.trash_folder();
    let _ = session.create(trash_folder);
    let sequence = uids.join(",");
    session.uid_copy(&sequence, trash_folder)?;
    session.uid_store(&sequence, "+FLAGS (\\Deleted)")?;
    session.expunge()?;
    session.logout()?;
    Ok(())
}

fn move_blocked_blocking(
    credentials: Credentials,
    senders: Vec<String>,
    target_folder: String,
) -> Result<usize, ProviderError> {
    if senders.is_empty() {
        return Ok(0);
    }

    let domain = credentials
        .custom_host
        .as_deref()
        .unwrap_or_else(|| credentials.provider.imap_host());
    let port = credentials.custom_port.unwrap_or(993);
    let tls = TlsConnector::builder()
        .build()
        .map_err(|err| ProviderError::Network(err.to_string()))?;
    let client = ::imap::connect((domain, port), domain, &tls)
        .map_err(|err| ProviderError::Network(err.to_string()))?;

    let mut session = match client.login(&credentials.email, &credentials.password) {
        Ok(session) => session,
        Err((err, _client)) => return Err(ProviderError::Authentication(err.to_string())),
    };

    session.select("INBOX")?;
    let _ = session.create(&target_folder);

    let mut moved = 0usize;

    for sender in senders {
        if sender.is_empty() {
            continue;
        }
        let query = format!("FROM \"{}\"", sender);
        let uids = session.uid_search(query)?;
        if uids.is_empty() {
            continue;
        }
        let sequence = uids
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(",");
        session.uid_copy(&sequence, &target_folder)?;
        session.uid_store(&sequence, "+FLAGS (\\Deleted)")?;
        moved += uids.len();
    }

    if moved > 0 {
        let _ = session.expunge();
    }

    session.logout()?;
    Ok(moved)
}

fn summarize_fetch(fetch: &Fetch) -> Option<EmailSummary> {
    let envelope = fetch.envelope()?;
    let uid = fetch.uid?;
    let subject = decode_bytes(envelope.subject.as_ref().map(|cow| cow.as_ref()));
    let sender = primary_address(envelope.from.as_ref().map(|addresses| addresses.as_slice()));
    let date = fetch.internal_date().map(|dt| dt.to_rfc2822()).or_else(|| {
        envelope.date.as_ref().and_then(|cow| {
            let value = decode_bytes(Some(cow.as_ref()));
            if value.is_empty() {
                None
            } else {
                Some(value)
            }
        })
    });

    Some(EmailSummary {
        uid: uid.to_string(),
        subject,
        sender,
        date,
    })
}

fn primary_address(addresses: Option<&[Address]>) -> MailAddress {
    let mut address = MailAddress {
        display_name: None,
        email: String::new(),
    };

    if let Some(list) = addresses {
        if let Some(first) = list.first() {
            let name = decode_bytes(first.name.as_ref().map(|cow| cow.as_ref()));
            let mailbox = decode_bytes(first.mailbox.as_ref().map(|cow| cow.as_ref()));
            let host = decode_bytes(first.host.as_ref().map(|cow| cow.as_ref()));
            address.display_name = if name.is_empty() { None } else { Some(name) };

            address.email = match (!mailbox.is_empty(), !host.is_empty()) {
                (true, true) => format!("{}@{}", mailbox, host),
                (true, false) => mailbox,
                (false, true) => host,
                _ => String::new(),
            };
        }
    }

    if address.email.is_empty() {
        if let Some(display) = address.display_name.clone() {
            address.email = display;
        }
    }

    address
}

fn decode_bytes(data: Option<&[u8]>) -> String {
    data.map(|bytes| String::from_utf8_lossy(bytes).trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

fn extract_body_snippet(fetch: &Fetch) -> Option<String> {
    fetch
        .body()
        .map(|bytes| {
            let raw = String::from_utf8_lossy(bytes);
            let collapsed = raw
                .replace(['\r', '\n'], " ")
                .split_whitespace()
                .take(80)
                .collect::<Vec<_>>()
                .join(" ");
            let trimmed = collapsed.trim();
            if trimmed.len() > 280 {
                format!("{}…", &trimmed[..280])
            } else {
                trimmed.to_string()
            }
        })
        .filter(|snippet| !snippet.is_empty())
}

fn extract_flags(fetch: &Fetch) -> Vec<String> {
    fetch
        .flags()
        .iter()
        .map(|flag| match flag {
            Flag::Seen => "seen".to_string(),
            Flag::Answered => "answered".to_string(),
            Flag::Flagged => "flagged".to_string(),
            Flag::Deleted => "deleted".to_string(),
            Flag::Draft => "draft".to_string(),
            Flag::Recent => "recent".to_string(),
            Flag::MayCreate => "may-create".to_string(),
            Flag::Custom(value) => value.to_string(),
        })
        .collect()
}
