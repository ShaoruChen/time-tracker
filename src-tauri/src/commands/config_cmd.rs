use crate::config;
use crate::models::CategoriesConfig;
use tauri::Emitter;
use tauri::State;
use crate::timer::TimerState;

#[tauri::command]
pub fn get_categories() -> Result<CategoriesConfig, String> {
    config::load_categories()
}

#[tauri::command]
pub fn save_categories(
    app: tauri::AppHandle,
    config: CategoriesConfig,
) -> Result<(), String> {
    config::save_categories(&config)?;
    let _ = app.emit("config-changed", ());
    Ok(())
}

#[tauri::command]
pub fn validate_categories_json(json: String) -> Result<CategoriesConfig, String> {
    config::validate_categories_json(&json)
}

#[tauri::command]
pub fn select_task(
    timer: State<'_, std::sync::Mutex<TimerState>>,
    category_id: String,
    task_id: Option<String>,
) -> Result<String, String> {
    let config = config::load_categories()?;
    let mut timer = timer.lock().map_err(|e| format!("锁定时器失败: {}", e))?;
    timer.select_task(&config, &category_id, task_id.as_deref())
}

#[tauri::command]
pub fn clear_selection(timer: State<'_, std::sync::Mutex<TimerState>>) -> Result<(), String> {
    let mut timer = timer.lock().map_err(|e| format!("锁定时器失败: {}", e))?;
    timer.clear_selection();
    Ok(())
}

#[tauri::command]
pub fn get_selection(
    timer: State<'_, std::sync::Mutex<TimerState>>,
) -> Result<Option<String>, String> {
    let timer = timer.lock().map_err(|e| format!("锁定时器失败: {}", e))?;
    Ok(timer.selected_label.clone())
}
