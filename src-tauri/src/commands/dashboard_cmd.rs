use crate::db::Database;
use crate::models::{CategorySummary, DailySummary, Session};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    // Check if dashboard window already exists
    if let Some(window) = app.get_webview_window("dashboard") {
        window.show().map_err(|e| format!("{}", e))?;
        window.set_focus().map_err(|e| format!("{}", e))?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(&app, "dashboard", WebviewUrl::App("dashboard.html".into()))
        .title("Time Tracker - Dashboard")
        .inner_size(1000.0, 750.0)
        .resizable(true)
        .min_inner_size(600.0, 500.0)
        .build()
        .map_err(|e| format!("创建窗口失败: {}", e))?;

    // Open devtools in debug mode
    #[cfg(debug_assertions)]
    window.open_devtools();

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
