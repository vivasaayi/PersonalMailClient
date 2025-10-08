#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use personal_mail_client::models::{AppState, ConnectAccountResponse, Credentials, EmailSummary, Provider};
use personal_mail_client::providers::{self, ProviderError};
use tauri::State;
use tracing::{debug, error, info, Level, warn};
use warp::Filter;
use oauth2::{AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge, RedirectUrl, Scope, TokenResponse};
use std::collections::HashMap;
use std::process::Command;
use std::sync::{Arc, Mutex};
use tokio::time;

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
        warn!("connect_account missing email address");
        return Err("Email address is required".into());
    }
    if password.trim().is_empty() {
        warn!("connect_account missing app password");
        return Err("App password is required".into());
    }

    let normalized_email = email.trim().to_lowercase();
    info!(%normalized_email, ?provider, "connecting account");
    let credentials = Credentials::new(provider, normalized_email.clone(), password);
    let emails = providers::fetch_recent(&credentials, 25)
        .await
        .map_err(|err| {
            error!(%normalized_email, ?err, "failed to fetch recent emails during connect");
            provider_error_to_message(err)
        })?;

    let account = credentials.account();
    state
        .accounts
        .write()
        .await
        .insert(normalized_email.clone(), credentials);

    info!(%normalized_email, email_count = emails.len(), "account connected successfully");
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

    debug!(%normalized_email, count = emails.len(), "fetch_recent returning emails");

    Ok(emails)
}

#[tauri::command]
async fn disconnect_account(state: State<'_, AppState>, email: String) -> Result<(), String> {
    let normalized_email = email.trim().to_lowercase();
    let mut accounts = state.accounts.write().await;
    if accounts.remove(&normalized_email).is_none() {
        warn!(%normalized_email, "disconnect_account requested but account not found");
        return Err("Account not found".into());
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
    .set_redirect_uri(RedirectUrl::new("http://localhost:8080".to_string()).map_err(|e| e.to_string())?);

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    let (auth_url_final, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new(scope.to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    // Open the URL
    Command::new("open").arg(&auth_url_final.to_string()).spawn().map_err(|e| format!("Failed to open browser: {}", e))?;

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
                    Ok::<_, warp::Rejection>(warp::reply::html("Authorization successful! You can close this window."))
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

fn main() {
    init_tracing();

    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            connect_account,
            fetch_recent,
            disconnect_account,
            oauth
        ])
        .run(tauri::generate_context!())
        .expect("error while running personal mail client application");
}
