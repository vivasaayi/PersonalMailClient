use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::{self, Display};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::storage::Storage;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Gmail,
    Outlook,
    Yahoo,
}

impl Provider {
    pub fn imap_host(&self) -> &'static str {
        match self {
            Provider::Gmail => "imap.gmail.com",
            Provider::Outlook => "outlook.office365.com",
            Provider::Yahoo => "imap.mail.yahoo.com",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Provider::Gmail => "Gmail",
            Provider::Outlook => "Outlook / Live",
            Provider::Yahoo => "Yahoo Mail",
        }
    }
}

impl Display for Provider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.display_name())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub provider: Provider,
    pub email: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailSummary {
    pub uid: String,
    pub subject: String,
    pub sender: MailAddress,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailAddress {
    pub display_name: Option<String>,
    pub email: String,
}

#[derive(Debug, Clone)]
pub struct Credentials {
    pub provider: Provider,
    pub email: String,
    pub password: String,
}

impl Credentials {
    pub fn new(provider: Provider, email: String, password: String) -> Self {
        Self {
            provider,
            email,
            password,
        }
    }

    pub fn key(&self) -> String {
        format!("{}::{}", self.provider.display_name(), self.email)
    }

    pub fn account(&self) -> Account {
        Account {
            provider: self.provider,
            email: self.email.clone(),
            display_name: None,
        }
    }
}

pub struct AppState {
    pub accounts: RwLock<HashMap<String, Credentials>>,
    pub storage: Storage,
    pub sync_jobs: RwLock<HashMap<String, SyncHandle>>,
}

impl AppState {
    pub fn new(storage: Storage) -> Self {
        Self {
            accounts: RwLock::new(HashMap::new()),
            storage,
            sync_jobs: RwLock::new(HashMap::new()),
        }
    }
}

pub struct SyncHandle {
    pub cancel: CancellationToken,
    pub handle: JoinHandle<()>,
}

#[derive(Debug, Serialize)]
pub struct ConnectAccountResponse {
    pub account: Account,
    pub emails: Vec<EmailSummary>,
}

#[derive(Debug, Serialize)]
pub struct SyncReport {
    pub fetched: usize,
    pub stored: usize,
    #[serde(rename = "duration_ms")]
    pub duration_ms: u64,
}
