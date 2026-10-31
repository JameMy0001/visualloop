use serde::{Deserialize, Serialize};
use tauri::{LogicalPosition, LogicalSize, Window};

#[derive(Debug, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub supports_click_through: bool,
    pub always_on_top_supported: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        supports_click_through: true,
        always_on_top_supported: true,
    }
}

#[tauri::command]
fn set_click_through(window: Window, enabled: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|e| format!("Failed to set click-through: {}", e))?;
    if !enabled {
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn set_always_on_top(window: Window, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| format!("Failed to set always on top: {}", e))
}

#[tauri::command]
fn set_window_mode(window: Window, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "mini" => {
            // Restore interactive mouse events and bring window to focus
            let _ = window.set_ignore_cursor_events(false);
            let _ = window.set_size(LogicalSize::new(360.0, 240.0));
            let _ = window.set_always_on_top(true);
            let _ = window.show();
            let _ = window.set_focus();
            Ok(())
        }
        "expanded" => {
            // Expansion disables click-through, centers bounds, and ensures key focus
            let _ = window.set_ignore_cursor_events(false);
            let _ = window.set_size(LogicalSize::new(1024.0, 768.0));
            let _ = window.center();
            let _ = window.set_always_on_top(true);
            let _ = window.show();
            let _ = window.set_focus();
            Ok(())
        }
        "hidden" => {
            let _ = window.hide();
            Ok(())
        }
        _ => Err(format!("Unknown window mode: {}", mode)),
    }
}

#[tauri::command]
fn get_window_bounds(window: Window) -> Result<WindowBounds, String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    let log_pos = pos.to_logical::<f64>(scale);
    let log_size = size.to_logical::<f64>(scale);

    Ok(WindowBounds {
        x: log_pos.x,
        y: log_pos.y,
        width: log_size.width,
        height: log_size.height,
    })
}

#[tauri::command]
fn set_window_position(window: Window, x: f64, y: f64) -> Result<(), String> {
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to set position: {}", e))
}

#[tauri::command]
fn start_dragging(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn close_window(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_auth_token() -> Option<String> {
    if let Ok(token) = std::env::var("VISUALLOOP_SECRET_TOKEN") {
        let trimmed = token.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }

    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok()?;
    let path = std::path::Path::new(&home).join(".visualloop").join("auth_token");
    if let Ok(content) = std::fs::read_to_string(path) {
        let trimmed = content.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    None
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProviderConfigPayload {
    pub provider: String,
    pub model: Option<String>,
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    #[serde(rename = "baseUrl")]
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProviderInfoPayload {
    pub provider: String,
    pub model: String,
    #[serde(rename = "hasApiKey")]
    pub has_api_key: bool,
    #[serde(rename = "maskedApiKey")]
    pub masked_api_key: String,
    #[serde(rename = "baseUrl")]
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct StoredConfigFile {
    provider: Option<String>,
    model: Option<String>,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    #[serde(rename = "baseUrl")]
    base_url: Option<String>,
    #[serde(rename = "providerKeys")]
    provider_keys: Option<std::collections::HashMap<String, String>>,
    #[serde(rename = "providerModels")]
    provider_models: Option<std::collections::HashMap<String, String>>,
}

fn mask_key(key: &str) -> String {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.len() <= 8 {
        return "••••••••".to_string();
    }
    let first = &trimmed[..4];
    let last = &trimmed[trimmed.len() - 4..];
    format!("{}••••••••{}", first, last)
}

fn get_default_model(provider: &str) -> &'static str {
    match provider {
        "gemini" => "gemini-3.8-flash",
        "openai" => "gpt-4o",
        "anthropic" => "claude-3-7-sonnet-20250219",
        "openai-compatible" => "deepseek-r1",
        _ => "gemini-3.8-flash",
    }
}

#[tauri::command]
fn get_provider_config() -> ProviderInfoPayload {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default();
    let config_path = std::path::Path::new(&home).join(".visualloop").join("provider_config.json");

    let stored: StoredConfigFile = if config_path.exists() {
        std::fs::read_to_string(&config_path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default()
    } else {
        StoredConfigFile::default()
    };

    let env_provider = std::env::var("VISUALLOOP_AI_PROVIDER").ok().filter(|s| !s.trim().is_empty());
    let provider = env_provider
        .or(stored.provider)
        .unwrap_or_else(|| "gemini".to_string())
        .trim()
        .to_lowercase();

    let model = std::env::var("VISUALLOOP_AI_MODEL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            if provider == "gemini" {
                std::env::var("GEMINI_MODEL").ok().filter(|s| !s.trim().is_empty())
            } else {
                None
            }
        })
        .or_else(|| stored.provider_models.as_ref().and_then(|m| m.get(&provider).cloned()))
        .or(stored.model)
        .unwrap_or_else(|| get_default_model(&provider).to_string());

    let env_key = match provider.as_str() {
        "gemini" => std::env::var("GEMINI_API_KEY").ok(),
        "openai" => std::env::var("OPENAI_API_KEY").ok(),
        "anthropic" => std::env::var("ANTHROPIC_API_KEY").ok(),
        "openai-compatible" => std::env::var("OPENAI_COMPATIBLE_API_KEY").ok(),
        _ => None,
    }
    .or_else(|| std::env::var("VISUALLOOP_AI_API_KEY").ok())
    .filter(|s| !s.trim().is_empty());

    let file_key = stored
        .provider_keys
        .as_ref()
        .and_then(|m| m.get(&provider).cloned())
        .or(stored.api_key)
        .filter(|s| !s.trim().is_empty());

    let active_key = env_key.or(file_key);
    let has_api_key = active_key.is_some();
    let masked_api_key = active_key.as_deref().map(mask_key).unwrap_or_default();

    let base_url = std::env::var("OPENAI_COMPATIBLE_BASE_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or(stored.base_url);

    ProviderInfoPayload {
        provider,
        model,
        has_api_key,
        masked_api_key,
        base_url,
    }
}

#[tauri::command]
fn save_provider_config(payload: ProviderConfigPayload) -> Result<ProviderInfoPayload, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine user home directory".to_string())?;
    let config_dir = std::path::Path::new(&home).join(".visualloop");
    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    let config_path = config_dir.join("provider_config.json");

    let mut stored: StoredConfigFile = if config_path.exists() {
        std::fs::read_to_string(&config_path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default()
    } else {
        StoredConfigFile::default()
    };

    let mut provider_keys = stored.provider_keys.unwrap_or_default();
    let mut provider_models = stored.provider_models.unwrap_or_default();

    let provider = payload.provider.trim().to_lowercase();

    // Update API Key
    if let Some(key) = payload.api_key {
        let trimmed = key.trim();
        if trimmed == "__CLEAR__" {
            provider_keys.remove(&provider);
        } else if !trimmed.is_empty() && !trimmed.contains('•') {
            provider_keys.insert(provider.clone(), trimmed.to_string());
        }
    }

    // Update Model
    let model = payload
        .model
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| {
            provider_models
                .get(&provider)
                .cloned()
                .unwrap_or_else(|| get_default_model(&provider).to_string())
        });
    provider_models.insert(provider.clone(), model.clone());

    stored.provider = Some(provider.clone());
    stored.model = Some(model.clone());
    stored.api_key = provider_keys.get(&provider).cloned();
    if payload.base_url.is_some() {
        stored.base_url = payload.base_url.clone();
    }
    stored.provider_keys = Some(provider_keys);
    stored.provider_models = Some(provider_models);

    let json_data = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json_data).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&config_path, std::fs::Permissions::from_mode(0o600));
    }

    Ok(get_provider_config())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            set_click_through,
            set_always_on_top,
            set_window_mode,
            get_window_bounds,
            set_window_position,
            start_dragging,
            close_window,
            get_auth_token,
            get_provider_config,
            save_provider_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running VisualLoop application");
}
