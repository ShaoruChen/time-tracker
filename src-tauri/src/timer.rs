use crate::models::{CategoriesConfig, Session};
use chrono::Utc;
use std::time::Instant;

#[derive(Debug, Clone, PartialEq)]
pub enum TimerPhase {
    Idle,
    Running,
    Paused,
}

pub struct TimerState {
    pub active_session: Option<Session>,
    pub selected_category_id: Option<String>,
    pub selected_task_id: Option<String>,
    pub selected_label: Option<String>,
    pub phase: TimerPhase,
    pub accumulated_ms: i64,
    start_instant: Option<Instant>,
}

impl TimerState {
    pub fn new() -> Self {
        TimerState {
            active_session: None,
            selected_category_id: None,
            selected_task_id: None,
            selected_label: None,
            phase: TimerPhase::Idle,
            accumulated_ms: 0,
            start_instant: None,
        }
    }

    pub fn select_task(
        &mut self,
        config: &CategoriesConfig,
        category_id: &str,
        task_id: Option<&str>,
    ) -> Result<String, String> {
        let cat = config
            .categories
            .iter()
            .find(|c| c.id == category_id)
            .ok_or("分类不存在")?;

        let label = if let Some(tid) = task_id {
            let task = cat.children.iter().find(|t| t.id == tid).ok_or("任务不存在")?;
            format!("{} / {}", cat.name, task.name)
        } else {
            cat.name.clone()
        };

        self.selected_category_id = Some(category_id.to_string());
        self.selected_task_id = task_id.map(|s| s.to_string());
        self.selected_label = Some(label.clone());
        Ok(label)
    }

    pub fn make_session(&self) -> Result<Session, String> {
        let cat_id = self
            .selected_category_id
            .clone()
            .ok_or("未选择任务")?;
        let task_id = self.selected_task_id.clone();
        let label = self.selected_label.clone().unwrap_or_default();

        let now = Utc::now();
        Ok(Session {
            id: uuid::Uuid::new_v4().to_string(),
            category_id: cat_id,
            category_name: label,
            task_id,
            task_name: None,
            start_time: now.to_rfc3339(),
            end_time: None,
            duration_ms: 0,
            status: "running".to_string(),
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
        })
    }

    pub fn start(&mut self, session: Session) {
        self.active_session = Some(session);
        self.phase = TimerPhase::Running;
        self.accumulated_ms = 0;
        self.start_instant = Some(Instant::now());
    }

    pub fn pause(&mut self) -> Result<(), String> {
        if self.phase != TimerPhase::Running {
            return Err("当前不在计时状态".into());
        }
        self.accumulated_ms += self.elapsed_from_instant();
        self.phase = TimerPhase::Paused;
        self.start_instant = None;
        Ok(())
    }

    pub fn resume(&mut self) -> Result<(), String> {
        if self.phase != TimerPhase::Paused {
            return Err("当前不在暂停状态".into());
        }
        self.phase = TimerPhase::Running;
        self.start_instant = Some(Instant::now());
        Ok(())
    }

    pub fn end(&mut self) -> (Option<Session>, i64) {
        let session = self.active_session.take();
        let total_ms = if self.phase == TimerPhase::Running {
            self.accumulated_ms + self.elapsed_from_instant()
        } else {
            self.accumulated_ms
        };

        self.phase = TimerPhase::Idle;
        self.accumulated_ms = 0;
        self.start_instant = None;
        self.selected_category_id = None;
        self.selected_task_id = None;
        self.selected_label = None;

        (session, total_ms)
    }

    pub fn elapsed_ms(&self) -> i64 {
        match self.phase {
            TimerPhase::Running => self.accumulated_ms + self.elapsed_from_instant(),
            TimerPhase::Paused => self.accumulated_ms,
            TimerPhase::Idle => 0,
        }
    }

    fn elapsed_from_instant(&self) -> i64 {
        self.start_instant
            .map(|i| i.elapsed().as_millis() as i64)
            .unwrap_or(0)
    }

    pub fn clear_selection(&mut self) {
        self.selected_category_id = None;
        self.selected_task_id = None;
        self.selected_label = None;
    }

    pub fn restore_session(&mut self, session: Session) {
        self.accumulated_ms = session.duration_ms;
        if session.status == "running" {
            self.phase = TimerPhase::Running;
            self.start_instant = Some(Instant::now());
        } else {
            self.phase = TimerPhase::Paused;
        }
        self.active_session = Some(session);
    }
}
