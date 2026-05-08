use crate::db::Database;
use crate::models::{CategorySummary, DailyCategorySlice, DailySummary, Session};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    // Check if dashboard window already exists
    if let Some(window) = app.get_webview_window("dashboard") {
        window.show().map_err(|e| format!("{}", e))?;
        window.set_focus().map_err(|e| format!("{}", e))?;
        return Ok(());
    }

    let _window = WebviewWindowBuilder::new(&app, "dashboard", WebviewUrl::App("dashboard.html".into()))
        .title("Time Tracker - Dashboard")
        .inner_size(1000.0, 750.0)
        .resizable(true)
        .min_inner_size(600.0, 500.0)
        .build()
        .map_err(|e| format!("创建窗口失败: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_sessions(
    db: State<'_, Database>,
    date_from: String,
    date_to: String,
    category_id: Option<String>,
) -> Result<Vec<Session>, String> {
    db.query_sessions(&date_from, &date_to, category_id.as_deref())
}

#[tauri::command]
pub fn get_daily_summary(
    db: State<'_, Database>,
    date_from: String,
    date_to: String,
) -> Result<Vec<DailySummary>, String> {
    db.query_daily_summary(&date_from, &date_to)
}

#[tauri::command]
pub fn get_daily_stacked(
    db: State<'_, Database>,
    date_from: String,
    date_to: String,
) -> Result<Vec<DailyCategorySlice>, String> {
    db.query_daily_stacked(&date_from, &date_to)
}

#[tauri::command]
pub fn get_category_summary(
    db: State<'_, Database>,
    date_from: String,
    date_to: String,
) -> Result<Vec<CategorySummary>, String> {
    db.query_category_summary(&date_from, &date_to)
}

#[tauri::command]
pub fn export_csv(
    db: State<'_, Database>,
    date_from: String,
    date_to: String,
) -> Result<String, String> {
    db.export_csv(&date_from, &date_to)
}

#[tauri::command]
pub fn delete_session(db: State<'_, Database>, id: String) -> Result<(), String> {
    db.delete_session(&id)
}

#[tauri::command]
pub fn update_session_duration(
    db: State<'_, Database>,
    id: String,
    duration_ms: i64,
) -> Result<(), String> {
    db.update_session_duration(&id, duration_ms)
}
