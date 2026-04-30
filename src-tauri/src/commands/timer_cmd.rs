use crate::db::Database;
use crate::models::Session;
use crate::timer::TimerState;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn start_timer(
    timer: State<'_, Mutex<TimerState>>,
    db: State<'_, Database>,
) -> Result<Session, String> {
    let mut timer = timer.lock().map_err(|e| format!("锁定时器失败: {}", e))?;
    let session = timer.make_session()?;
    db.insert_session(&session)?;
    timer.start(session.clone());
    Ok(session)
}

#[tauri::command]
pub fn pause_timer(
    timer: State<'_, Mutex<TimerState>>,
    db: State<'_, Database>,
) -> Result<Session, String> {
    let mut timer = timer.lock().map_err(|e| format!("锁定时器失败: {}", e))?;
    timer.pause()?;
    let acc = timer.accumulated_ms;
    let session = timer.active_session.as_mut().ok_or("没有活跃的计时")?;
    session.status = "paused".to_string();
    session.duration_ms = acc;
    db.update_session_status(&session.id, "paused")?;
    Ok(session.clone())
}

#[tauri::command]
pub fn resume_timer(
    timer: State<'_, Mutex<TimerState>>,
    db: State<'_, Database>,
) -> Result<Session, String> {
    let mut timer = timer.lock().map_err(|e| format!("锁定时器失败: {}", e))?;
    timer.resume()?;
    let session = timer.active_session.as_mut().ok_or("没有活跃的计时")?;
    session.status = "running".to_string();
    db.update_session_status(&session.id, "running")?;
    Ok(session.clone())
}

#[tauri::command]
pub fn end_timer(
    timer: State<'_, Mutex<TimerState>>,
    db: State<'_, Database>,
) -> Result<Session, String> {
    let mut timer = timer.lock().map_err(|e| format!("锁定时器失败: {}", e))?;
    let (session_opt, total_ms) = timer.end();
    let session = session_opt.ok_or("没有活跃的计时")?;
    let now = chrono::Utc::now().to_rfc3339();
    db.update_session_end(&session.id, &now, total_ms, "completed")?;
    Ok(Session {
        duration_ms: total_ms,
        end_time: Some(now),
        status: "completed".to_string(),
        ..session
    })
}

#[tauri::command]
pub fn get_elapsed(timer: State<'_, Mutex<TimerState>>) -> Result<i64, String> {
    let timer = timer.lock().map_err(|e| format!("锁定时器失败: {}", e))?;
    Ok(timer.elapsed_ms())
}

#[tauri::command]
pub fn get_timer_status(
    timer: State<'_, Mutex<TimerState>>,
) -> Result<TimerStatus, String> {
    let timer = timer.lock().map_err(|e| format!("锁定时器失败: {}", e))?;
    Ok(TimerStatus {
        phase: format!("{:?}", timer.phase),
        elapsed_ms: timer.elapsed_ms(),
        selected_label: timer.selected_label.clone(),
        active_session_id: timer.active_session.as_ref().map(|s| s.id.clone()),
    })
}

#[derive(serde::Serialize)]
pub struct TimerStatus {
    pub phase: String,
    pub elapsed_ms: i64,
    pub selected_label: Option<String>,
    pub active_session_id: Option<String>,
}
