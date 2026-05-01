use crate::db::Database;
use crate::timer::TimerState;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn show_context_menu(
    app: tauri::AppHandle,
    window: tauri::Window,
    x: f64,
    y: f64,
) -> Result<(), String> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};

    let quit = MenuItemBuilder::with_id("quit_app", "退出应用")
        .build(&app)
        .map_err(|e| e.to_string())?;
    let menu = MenuBuilder::new(&app)
        .item(&quit)
        .build()
        .map_err(|e| e.to_string())?;

    window
        .popup_menu_at(&menu, tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn quit_app(
    app: tauri::AppHandle,
    timer: State<'_, Mutex<TimerState>>,
    db: State<'_, Database>,
) {
    // End active timer session if one exists
    if let Ok(mut t) = timer.lock() {
        if t.phase != crate::timer::TimerPhase::Idle {
            if let (Some(session), total_ms) = t.end() {
                let now = chrono::Utc::now().to_rfc3339();
                let _ = db.update_session_end(&session.id, &now, total_ms, "completed");
            }
        }
    }
    app.exit(0);
}
