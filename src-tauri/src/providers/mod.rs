use crate::models::{Credentials, EmailSummary};
use ::imap::Error as ImapError;
use native_tls::Error as TlsError;
use thiserror::Error;
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::task::JoinHandle;

pub mod imap;

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("authentication failed: {0}")]
    Authentication(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("imap error: {0}")]
    Imap(String),
    #[error("unexpected provider error: {0}")]
    Other(String),
}

impl From<std::io::Error> for ProviderError {
    fn from(value: std::io::Error) -> Self {
        Self::Network(value.to_string())
    }
}

impl From<TlsError> for ProviderError {
    fn from(value: TlsError) -> Self {
        Self::Network(value.to_string())
    }
}

impl From<ImapError> for ProviderError {
    fn from(value: ImapError) -> Self {
        Self::Imap(value.to_string())
    }
}

pub async fn fetch_recent(
    credentials: &Credentials,
    limit: usize,
) -> Result<Vec<EmailSummary>, ProviderError> {
    if limit == 0 {
        return Err(ProviderError::Other(
            "limit must be greater than zero".into(),
        ));
    }

    imap::fetch_recent(credentials, limit).await
}

pub async fn verify_credentials(credentials: &Credentials) -> Result<(), ProviderError> {
    imap::verify_credentials(credentials).await
}

#[derive(Debug, Clone)]
pub struct MessageEnvelope {
    pub summary: EmailSummary,
    pub snippet: Option<String>,
    pub body: Option<Vec<u8>>,
    pub flags: Vec<String>,
}

#[derive(Debug)]
pub struct BatchResult {
    pub index: usize,
    pub total: usize,
    pub requested: usize,
    pub fetched: usize,
    pub messages: Vec<MessageEnvelope>,
}

pub async fn fetch_all(
    credentials: &Credentials,
    since_uid: Option<u32>,
    chunk_size: usize,
) -> Result<
    (
        UnboundedReceiver<BatchResult>,
        JoinHandle<Result<(), ProviderError>>,
    ),
    ProviderError,
> {
    imap::fetch_all(credentials, since_uid, chunk_size).await
}

pub async fn delete_message(credentials: &Credentials, uid: &str) -> Result<(), ProviderError> {
    imap::delete_message(credentials, uid).await
}

pub async fn move_blocked_to_folder(
    credentials: &Credentials,
    senders: &[String],
    target_folder: &str,
) -> Result<usize, ProviderError> {
    imap::move_blocked(credentials, senders, target_folder).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Credentials, Provider};

    #[tokio::test]
    async fn clamp_limit_to_bounds() {
        let credentials = Credentials::new(
            Provider::Gmail,
            "user@example.com".to_string(),
            "secret".to_string(),
            None,
            None,
        );
        let result = fetch_recent(&credentials, 0).await;
        assert!(matches!(result, Err(ProviderError::Other(_))));
    }
}
