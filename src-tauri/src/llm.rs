use std::path::{Path, PathBuf};
use std::sync::Arc;

use llama_cpp::{standard_sampler::StandardSampler, LlamaModel, LlamaParams, SessionParams};
use parking_lot::{Mutex, RwLock};
use serde::Serialize;

/// Default number of tokens to generate when replying to user prompts.
const DEFAULT_COMPLETION_TOKENS: usize = 128;

/// System prompt injected before every completion so the local model stays on task.
const SYSTEM_PROMPT: &str = r#"You are "Personal Mail Copilot", a focused assistant embedded in an email
product. Answer only with useful, direct help related to the user's request.

Guidance:
- Be concise and practical (keep replies under ~120 words unless summarizing).
- When the user asks for a joke or small-talk, respond briefly and on-topic.
- If information is missing, state the assumption or ask a clarifying question.
- Prefer markdown bullet lists for multiple items, otherwise plain sentences.
- Never invent email content or speculate about private data you do not have.

Reply as a single assistant message that the UI can render directly."#;

#[derive(Clone)]
pub struct LlmService {
    inner: Arc<LlmInner>,
}

struct LlmInner {
    model_path: RwLock<Option<PathBuf>>,
    model: Mutex<Option<LlamaModel>>,
    last_error: RwLock<Option<String>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct LlmStatus {
    pub configured_path: Option<String>,
    pub loaded: bool,
    pub last_error: Option<String>,
}

impl LlmService {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(LlmInner {
                model_path: RwLock::new(None),
                model: Mutex::new(None),
                last_error: RwLock::new(None),
            }),
        }
    }

    pub fn status(&self) -> LlmStatus {
        let path = self.inner.model_path.read().clone();
        let loaded = self.inner.model.lock().as_ref().is_some();
        let last_error = self.inner.last_error.read().clone();

        LlmStatus {
            configured_path: path.map(|p| p.display().to_string()),
            loaded,
            last_error,
        }
    }

    pub fn configured_path(&self) -> Option<PathBuf> {
        self.inner.model_path.read().clone()
    }

    pub fn unload(&self) {
        *self.inner.model.lock() = None;
        *self.inner.last_error.write() = None;
    }

    pub fn set_model_path(&self, path: Option<PathBuf>) -> Result<(), String> {
        {
            let mut path_guard = self.inner.model_path.write();
            *path_guard = path.clone();
        }
        *self.inner.model.lock() = None;

        if let Some(ref model_path) = path {
            match self.load_model(model_path) {
                Ok(model) => {
                    *self.inner.model.lock() = Some(model);
                    *self.inner.last_error.write() = None;
                    Ok(())
                }
                Err(err) => {
                    *self.inner.last_error.write() = Some(err.clone());
                    Err(err)
                }
            }
        } else {
            *self.inner.last_error.write() = None;
            Ok(())
        }
    }

    pub async fn analyze_prompt(
        &self,
        prompt: String,
        max_tokens: Option<usize>,
    ) -> Result<String, String> {
        let service = self.clone();
        let max_tokens = max_tokens.unwrap_or(DEFAULT_COMPLETION_TOKENS);
        tokio::task::spawn_blocking(move || service.analyze_prompt_sync(&prompt, max_tokens))
            .await
            .map_err(|err| err.to_string())?
    }

    fn analyze_prompt_sync(&self, prompt: &str, max_tokens: usize) -> Result<String, String> {
        let model = self.ensure_model()?;
        let mut session = model
            .create_session(SessionParams::default())
            .map_err(|err| format!("failed to create llama session: {err}"))?;

        let full_prompt = format!(
            "{system}\n\nUser: {prompt}\nAssistant:",
            system = SYSTEM_PROMPT,
            prompt = prompt.trim()
        );

        session
            .advance_context(&full_prompt)
            .map_err(|err| format!("failed to load prompt into llama session: {err}"))?;

        let sampler = StandardSampler::default();
        let handle = session
            .start_completing_with(sampler, max_tokens)
            .map_err(|err| format!("failed to start completion: {err}"))?;

        let output = handle.into_string();
        Ok(output.trim().to_string())
    }

    fn ensure_model(&self) -> Result<LlamaModel, String> {
        if let Some(model) = self.inner.model.lock().as_ref() {
            return Ok(model.clone());
        }

        let path = self
            .inner
            .model_path
            .read()
            .clone()
            .ok_or_else(|| "No local LLM model configured".to_string())?;

        let model = self.load_model(&path)?;
        *self.inner.model.lock() = Some(model.clone());
        *self.inner.last_error.write() = None;
        Ok(model)
    }

    fn load_model(&self, path: &Path) -> Result<LlamaModel, String> {
        if !path.exists() {
            return Err(format!("Model file not found: {}", path.display()));
        }

        LlamaModel::load_from_file(path, LlamaParams::default())
            .map_err(|err| format!("failed to load model: {err}"))
    }
}

impl Default for LlmService {
    fn default() -> Self {
        Self::new()
    }
}
