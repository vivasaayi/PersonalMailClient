#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use personal_mail_client::models::{AppState, ConnectAccountResponse, Credentials, EmailSummary, Provider};
use personal_mail_client::providers::{self, ProviderError};
use tauri::State;
use tracing::Level;

fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "personal_mail_client=info,tauri=info".into()),
        )
        .with_max_level(Level::INFO)
        .try_init();
}

#[tauri::command]
async fn connect_account(
    state: State<'_, AppState>,
    provider: Provider,
    email: String,
    password: String,
) -> Result<ConnectAccountResponse, String> {
    if email.trim().is_empty() {
        return Err("Email address is required".into());
    }
    if password.trim().is_empty() {
        return Err("App password is required".into());
    }

    let normalized_email = email.trim().to_lowercase();
    let credentials = Credentials::new(provider, normalized_email.clone(), password);
    let emails = providers::fetch_recent(&credentials, 25)
        .await
        .map_err(provider_error_to_message)?;

    let account = credentials.account();
    state
        .accounts
        .write()
        .await
        .insert(normalized_email.clone(), credentials);

    Ok(ConnectAccountResponse { account, emails })
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

    providers::fetch_recent(&credentials, limit)
        .await
        .map_err(provider_error_to_message)
}

#[tauri::command]
async fn disconnect_account(state: State<'_, AppState>, email: String) -> Result<(), String> {
    let normalized_email = email.trim().to_lowercase();
    let mut accounts = state.accounts.write().await;
    if accounts.remove(&normalized_email).is_none() {
        return Err("Account not found".into());
    }
    Ok(())
}

fn provider_error_to_message(error: ProviderError) -> String {
    match error {
        ProviderError::Authentication(message) => message,
        ProviderError::Network(message) => format!("Network error: {message}"),
        ProviderError::Imap(message) => format!("IMAP error: {message}"),
        ProviderError::Other(message) => message,
    }
}

fn main() {
    init_tracing();

    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            connect_account,
            fetch_recent,
            disconnect_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running personal mail client application");
}
