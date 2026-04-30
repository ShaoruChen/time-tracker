mod commands;
mod config;
mod db;
mod models;
mod timer;

use db::Database;
use std::sync::Mutex;
use tauri::Manager;
use timer::TimerState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Database::new().expect("无法初始化数据库");

    let mut timer_state = TimerState::new();

    // Restore active session on startup
    if let Ok(Some(active)) = database.get_active_session() {
        timer_state.restore_session(active);
    }

    tauri::Builder::default()
        .manage(Mutex::new(timer_state))
        .manage(database)
        .setup(|app| {
            let window = app.get_webview_window("ball").unwrap();
            if let Ok(Some(monitor)) = window.primary_monitor() {
                let screen = *monitor.size();
                let win: tauri::PhysicalSize<u32> = window
                    .outer_size()
                    .unwrap_or(tauri::PhysicalSize {
                        width: 320,
                        height: 320,
                    });
                let x: i32 = (screen.width.saturating_sub(win.width + 20)) as i32;
                let y: i32 = ((screen.height.saturating_sub(win.height)) / 2) as i32;
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition { x, y },
                ));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config_cmd::get_categories,
            commands::config_cmd::save_categories,
            commands::config_cmd::validate_categories_json,
            commands::config_cmd::select_task,
            commands::config_cmd::clear_selection,
            commands::config_cmd::get_selection,
            commands::timer_cmd::start_timer,
            commands::timer_cmd::pause_timer,
            commands::timer_cmd::resume_timer,
            commands::timer_cmd::end_timer,
            commands::timer_cmd::get_elapsed,
            commands::timer_cmd::get_timer_status,
            commands::dashboard_cmd::open_dashboard,
            commands::dashboard_cmd::get_sessions,
            commands::dashboard_cmd::get_daily_summary,
            commands::dashboard_cmd::get_category_summary,
            commands::dashboard_cmd::export_csv,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}
