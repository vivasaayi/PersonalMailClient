use crate::models::{Credentials, EmailSummary};
use crate::providers::ProviderError;
use ::imap::types::Fetch;
use ::imap_proto::types::Address;
use native_tls::TlsConnector;
use tokio::task;

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

fn fetch_recent_blocking(
    credentials: Credentials,
    limit: usize,
) -> Result<Vec<EmailSummary>, ProviderError> {
    let domain = credentials.provider.imap_host();
    let tls = TlsConnector::builder()
        .build()
        .map_err(|err| ProviderError::Network(err.to_string()))?;
    let client = ::imap::connect((domain, 993), domain, &tls)
        .map_err(|err| ProviderError::Network(err.to_string()))?;

    let mut session = match client.login(&credentials.email, &credentials.password) {
        Ok(session) => session,
        Err((err, _client)) => {
            return Err(ProviderError::Authentication(err.to_string()));
        }
    };

    session.select("INBOX")?;

    let uids = session.uid_search("ALL")?;
    if uids.is_empty() {
        session.logout()?;
        return Ok(Vec::new());
    }

    let mut sorted = uids.into_iter().collect::<Vec<_>>();
    sorted.sort_unstable();
    let end = sorted.len();
    let start = end.saturating_sub(limit);
    let selected = &sorted[start..end];
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

fn summarize_fetch(fetch: &Fetch) -> Option<EmailSummary> {
    let envelope = fetch.envelope()?;
    let uid = fetch.uid?;
    let subject = decode_bytes(envelope.subject.as_ref().map(|cow| cow.as_ref()));
    let from = format_address_list(envelope.from.as_ref().map(|addresses| addresses.as_slice()));
    let date = fetch
        .internal_date()
        .map(|dt| dt.to_rfc2822())
        .or_else(|| {
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
        from,
        date,
    })
}

fn format_address_list(addresses: Option<&[Address]>) -> String {
    match addresses {
        None => String::new(),
        Some(list) => list
            .iter()
            .map(|address| {
                let name = decode_bytes(address.name.as_ref().map(|cow| cow.as_ref()));
                let mailbox = decode_bytes(address.mailbox.as_ref().map(|cow| cow.as_ref()));
                let host = decode_bytes(address.host.as_ref().map(|cow| cow.as_ref()));
                match (!name.is_empty(), !mailbox.is_empty(), !host.is_empty()) {
                    (true, true, true) => format!("{} <{}@{}>", name, mailbox, host),
                    (true, _, _) => name,
                    (_, true, true) => format!("{}@{}", mailbox, host),
                    (_, true, false) => mailbox,
                    _ => host,
                }
            })
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(", "),
    }
}

fn decode_bytes(data: Option<&[u8]>) -> String {
    data.map(|bytes| String::from_utf8_lossy(bytes).trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}
