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
        .map_err(|e| format!("Failed to set click-through: {}", e))
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
            let _ = window.set_ignore_cursor_events(false);
            let _ = window.set_size(LogicalSize::new(360.0, 240.0));
            let _ = window.set_always_on_top(true);
            let _ = window.set_resizable(false);
            let _ = window.set_focus();
            Ok(())
        }
        "expanded" => {
            // Expansion disables click-through and centers or expands bounds
            let _ = window.set_ignore_cursor_events(false);
            let _ = window.set_size(LogicalSize::new(1024.0, 768.0));
            let _ = window.center();
            let _ = window.set_resizable(true);
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
            close_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running VisualLoop application");
}
