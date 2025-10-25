use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::{self, Display};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::{llm::LlmService, storage::Storage};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Gmail,
    Outlook,
    Yahoo,
    Custom,
}

impl Provider {
    pub fn as_key(&self) -> &'static str {
        match self {
            Provider::Gmail => "gmail",
            Provider::Outlook => "outlook",
            Provider::Yahoo => "yahoo",
            Provider::Custom => "custom",
        }
    }

    pub fn from_key(value: &str) -> Option<Self> {
        match value {
            "gmail" => Some(Provider::Gmail),
            "outlook" => Some(Provider::Outlook),
            "yahoo" => Some(Provider::Yahoo),
            "custom" => Some(Provider::Custom),
            _ => None,
        }
    }

    pub fn imap_host(&self) -> &'static str {
        match self {
            Provider::Gmail => "imap.gmail.com",
            Provider::Outlook => "outlook.office365.com",
            Provider::Yahoo => "imap.mail.yahoo.com",
            Provider::Custom => "localhost", // Default for custom, but will be overridden
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Provider::Gmail => "Gmail",
            Provider::Outlook => "Outlook / Live",
            Provider::Yahoo => "Yahoo Mail",
            Provider::Custom => "Custom IMAP",
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
    pub custom_host: Option<String>,
    pub custom_port: Option<u16>,
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
    pub custom_host: Option<String>,
    pub custom_port: Option<u16>,
}

impl Credentials {
    pub fn new(
        provider: Provider,
        email: String,
        password: String,
        custom_host: Option<String>,
        custom_port: Option<u16>,
    ) -> Self {
        Self {
            provider,
            email,
            password,
            custom_host,
            custom_port,
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
            custom_host: self.custom_host.clone(),
            custom_port: self.custom_port,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedAccount {
    pub provider: Provider,
    pub email: String,
    pub custom_host: Option<String>,
    pub custom_port: Option<u16>,
    pub has_password: bool,
}

pub struct AppState {
    pub accounts: RwLock<HashMap<String, Credentials>>,
    pub storage: Storage,
    pub sync_jobs: RwLock<HashMap<String, SyncHandle>>,
    pub llm: LlmService,
}

impl AppState {
    pub fn new(storage: Storage, llm: LlmService) -> Self {
        Self {
            accounts: RwLock::new(HashMap::new()),
            storage,
            sync_jobs: RwLock::new(HashMap::new()),
            llm,
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
