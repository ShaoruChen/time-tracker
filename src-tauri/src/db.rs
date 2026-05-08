use crate::models::{CategorySummary, DailyCategorySlice, DailySummary, Session};
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Clone)]
pub struct Database {
    conn: std::sync::Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new() -> Result<Self, String> {
        let dir = data_dir();
        std::fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
        let path = dir.join("data.db");
        let conn = Connection::open(&path).map_err(|e| format!("打开数据库失败: {}", e))?;

        Self::initialize_connection(&conn)?;

        Ok(Database {
            conn: std::sync::Arc::new(Mutex::new(conn)),
        })
    }

    fn initialize_connection(conn: &Connection) -> Result<(), String> {
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| format!("设置 WAL 模式失败: {}", e))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                category_id TEXT NOT NULL,
                category_name TEXT NOT NULL,
                task_id TEXT,
                task_name TEXT,
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'completed',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(start_time);
            CREATE INDEX IF NOT EXISTS idx_sessions_category ON sessions(category_id);",
        )
        .map_err(|e| format!("初始化数据库表失败: {}", e))?;

        Ok(())
    }

    #[cfg(test)]
    fn new_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| format!("打开数据库失败: {}", e))?;
        Self::initialize_connection(&conn)?;
        Ok(Database {
            conn: std::sync::Arc::new(Mutex::new(conn)),
        })
    }

    pub fn insert_session(&self, session: &Session) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;
        conn.execute(
            "INSERT INTO sessions (id, category_id, category_name, task_id, task_name,
             start_time, end_time, duration_ms, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                session.id,
                session.category_id,
                session.category_name,
                session.task_id,
                session.task_name,
                session.start_time,
                session.end_time,
                session.duration_ms,
                session.status,
                session.created_at,
                session.updated_at,
            ],
        )
        .map_err(|e| format!("插入记录失败: {}", e))?;
        Ok(())
    }

    pub fn update_session_end(
        &self,
        id: &str,
        end_time: &str,
        duration_ms: i64,
        status: &str,
    ) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;
        conn.execute(
            "UPDATE sessions SET end_time=?1, duration_ms=?2, status=?3,
             updated_at=datetime('now') WHERE id=?4",
            params![end_time, duration_ms, status, id],
        )
        .map_err(|e| format!("更新记录失败: {}", e))?;
        Ok(())
    }

    pub fn update_session_status(&self, id: &str, status: &str) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;
        conn.execute(
            "UPDATE sessions SET status=?1, updated_at=datetime('now') WHERE id=?2",
            params![status, id],
        )
        .map_err(|e| format!("更新状态失败: {}", e))?;
        Ok(())
    }

    pub fn delete_session(&self, id: &str) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;
        let rows = conn
            .execute("DELETE FROM sessions WHERE id=?1", params![id])
            .map_err(|e| format!("删除记录失败: {}", e))?;
        if rows == 0 {
            return Err("删除记录失败: 记录不存在".to_string());
        }
        Ok(())
    }

    pub fn update_session_duration(&self, id: &str, duration_ms: i64) -> Result<(), String> {
        if duration_ms < 0 {
            return Err("更新时长失败: 时长不能为负数".to_string());
        }
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;
        let rows = conn
            .execute(
                "UPDATE sessions SET duration_ms=?1, updated_at=datetime('now') WHERE id=?2",
                params![duration_ms, id],
            )
            .map_err(|e| format!("更新时长失败: {}", e))?;
        if rows == 0 {
            return Err("更新时长失败: 记录不存在".to_string());
        }
        Ok(())
    }

    pub fn get_active_session(&self) -> Result<Option<Session>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, category_id, category_name, task_id, task_name,
                 start_time, end_time, duration_ms, status, created_at, updated_at
                 FROM sessions WHERE status IN ('running', 'paused') ORDER BY created_at DESC LIMIT 1",
            )
            .map_err(|e| format!("查询活跃记录失败: {}", e))?;

        let result = stmt.query_row([], map_session);

        match result {
            Ok(session) => Ok(Some(session)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("查询活跃记录出错: {}", e)),
        }
    }

    pub fn query_sessions(
        &self,
        date_from: &str,
        date_to: &str,
        category_id: Option<&str>,
    ) -> Result<Vec<Session>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;

        if let Some(cid) = category_id {
            let mut stmt = conn
                .prepare(
                    "SELECT id, category_id, category_name, task_id, task_name,
                     start_time, end_time, duration_ms, status, created_at, updated_at
                     FROM sessions
                     WHERE date(start_time) >= ?1 AND date(start_time) <= ?2
                     AND category_id = ?3 AND status = 'completed'
                     ORDER BY start_time DESC LIMIT 500",
                )
                .map_err(|e| format!("查询失败: {}", e))?;
            let rows = stmt
                .query_map(params![date_from, date_to, cid], map_session)
                .map_err(|e| format!("查询失败: {}", e))?;
            let mut sessions = Vec::new();
            for row in rows {
                sessions.push(row.map_err(|e| format!("读取行失败: {}", e))?);
            }
            Ok(sessions)
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT id, category_id, category_name, task_id, task_name,
                     start_time, end_time, duration_ms, status, created_at, updated_at
                     FROM sessions
                     WHERE date(start_time) >= ?1 AND date(start_time) <= ?2
                     AND status = 'completed'
                     ORDER BY start_time DESC LIMIT 500",
                )
                .map_err(|e| format!("查询失败: {}", e))?;
            let rows = stmt
                .query_map(params![date_from, date_to], map_session)
                .map_err(|e| format!("查询失败: {}", e))?;
            let mut sessions = Vec::new();
            for row in rows {
                sessions.push(row.map_err(|e| format!("读取行失败: {}", e))?);
            }
            Ok(sessions)
        }
    }

    pub fn query_daily_summary(
        &self,
        date_from: &str,
        date_to: &str,
    ) -> Result<Vec<DailySummary>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT date(start_time) as d, SUM(duration_ms) as total
                 FROM sessions
                 WHERE date(start_time) >= ?1 AND date(start_time) <= ?2
                 AND status = 'completed'
                 GROUP BY d ORDER BY d",
            )
            .map_err(|e| format!("查询失败: {}", e))?;

        let rows = stmt
            .query_map(params![date_from, date_to], |row| {
                Ok(DailySummary {
                    date: row.get(0)?,
                    total_ms: row.get(1)?,
                })
            })
            .map_err(|e| format!("查询失败: {}", e))?;

        let mut summaries = Vec::new();
        for row in rows {
            summaries.push(row.map_err(|e| format!("读取行失败: {}", e))?);
        }
        Ok(summaries)
    }

    pub fn query_daily_stacked(
        &self,
        date_from: &str,
        date_to: &str,
    ) -> Result<Vec<DailyCategorySlice>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT date(start_time) as d, category_id, category_name, SUM(duration_ms) as total
                 FROM sessions
                 WHERE date(start_time) >= ?1 AND date(start_time) <= ?2
                 AND status = 'completed'
                 GROUP BY d, category_id ORDER BY d, total DESC",
            )
            .map_err(|e| format!("查询失败: {}", e))?;

        let rows = stmt
            .query_map(params![date_from, date_to], |row| {
                Ok(DailyCategorySlice {
                    date: row.get(0)?,
                    category_id: row.get(1)?,
                    category_name: row.get(2)?,
                    total_ms: row.get(3)?,
                })
            })
            .map_err(|e| format!("查询失败: {}", e))?;

        let mut slices = Vec::new();
        for row in rows {
            slices.push(row.map_err(|e| format!("读取行失败: {}", e))?);
        }
        Ok(slices)
    }

    pub fn query_category_summary(
        &self,
        date_from: &str,
        date_to: &str,
    ) -> Result<Vec<CategorySummary>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("锁数据库失败: {}", e))?;

        let grand_total: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(duration_ms), 0) FROM sessions
                 WHERE date(start_time) >= ?1 AND date(start_time) <= ?2
                 AND status = 'completed'",
                params![date_from, date_to],
                |row| row.get(0),
            )
            .map_err(|e| format!("查询总时长失败: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT category_id, category_name, SUM(duration_ms) as total
                 FROM sessions
                 WHERE date(start_time) >= ?1 AND date(start_time) <= ?2
                 AND status = 'completed'
                 GROUP BY category_id ORDER BY total DESC",
            )
            .map_err(|e| format!("查询分类汇总失败: {}", e))?;

        let rows = stmt
            .query_map(params![date_from, date_to], |row| {
                let total: i64 = row.get(2)?;
                let percentage = if grand_total > 0 {
                    (total as f64 / grand_total as f64) * 100.0
                } else {
                    0.0
                };
                Ok(CategorySummary {
                    category_id: row.get(0)?,
                    category_name: row.get(1)?,
                    total_ms: total,
                    percentage,
                })
            })
            .map_err(|e| format!("查询失败: {}", e))?;

        let mut summaries = Vec::new();
        for row in rows {
            summaries.push(row.map_err(|e| format!("读取行失败: {}", e))?);
        }
        Ok(summaries)
    }

    pub fn export_csv(&self, date_from: &str, date_to: &str) -> Result<String, String> {
        let sessions = self.query_sessions(date_from, date_to, None)?;
        let mut csv = String::from("日期,分类,任务,开始时间,结束时间,时长(分钟),状态\n");
        for s in &sessions {
            let task = s.task_name.as_deref().unwrap_or("-");
            let end = s.end_time.as_deref().unwrap_or("-");
            let minutes = s.duration_ms as f64 / 60000.0;
            csv.push_str(&format!(
                "{},{},{},{},{},{:.1},{}\n",
                &s.start_time[..10.min(s.start_time.len())],
                s.category_name,
                task,
                s.start_time,
                end,
                minutes,
                s.status
            ));
        }
        Ok(csv)
    }
}

fn map_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        category_id: row.get(1)?,
        category_name: row.get(2)?,
        task_id: row.get(3)?,
        task_name: row.get(4)?,
        start_time: row.get(5)?,
        end_time: row.get(6)?,
        duration_ms: row.get(7)?,
        status: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn data_dir() -> PathBuf {
    std::env::var("HOME")
        .map(|h| PathBuf::from(h).join(".time-tracker"))
        .unwrap_or_else(|_| PathBuf::from(".time-tracker"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(id: &str, category_id: &str, category_name: &str, duration_ms: i64) -> Session {
        Session {
            id: id.to_string(),
            category_id: category_id.to_string(),
            category_name: category_name.to_string(),
            task_id: Some(format!("task-{}", id)),
            task_name: Some(format!("Task {}", id)),
            start_time: "2026-05-07T10:00:00-07:00".to_string(),
            end_time: Some("2026-05-07T11:00:00-07:00".to_string()),
            duration_ms,
            status: "completed".to_string(),
            created_at: "2026-05-07T10:00:00-07:00".to_string(),
            updated_at: "2026-05-07T11:00:00-07:00".to_string(),
        }
    }

    fn seeded_db() -> Database {
        let db = Database::new_in_memory().expect("in-memory database should initialize");
        db.insert_session(&session("s1", "work", "Work", 3_600_000))
            .expect("s1 should insert");
        db.insert_session(&session("s2", "work", "Work", 1_800_000))
            .expect("s2 should insert");
        db.insert_session(&session("s3", "study", "Study", 900_000))
            .expect("s3 should insert");
        db
    }

    #[test]
    fn delete_session_removes_record_and_updates_summaries() {
        let db = seeded_db();

        db.delete_session("s2").expect("delete should succeed");

        let sessions = db
            .query_sessions("2026-05-07", "2026-05-07", None)
            .expect("sessions should query");
        assert_eq!(sessions.len(), 2);
        assert!(sessions.iter().all(|s| s.id != "s2"));

        let daily = db
            .query_daily_summary("2026-05-07", "2026-05-07")
            .expect("daily summary should query");
        assert_eq!(daily[0].total_ms, 4_500_000);

        let stacked = db
            .query_daily_stacked("2026-05-07", "2026-05-07")
            .expect("stacked summary should query");
        let work = stacked
            .iter()
            .find(|slice| slice.category_id == "work")
            .expect("work category should remain");
        assert_eq!(work.total_ms, 3_600_000);
    }

    #[test]
    fn update_session_duration_updates_record_and_category_percentages() {
        let db = seeded_db();

        db.update_session_duration("s3", 3_600_000)
            .expect("duration update should succeed");

        let sessions = db
            .query_sessions("2026-05-07", "2026-05-07", Some("study"))
            .expect("study sessions should query");
        assert_eq!(sessions[0].duration_ms, 3_600_000);

        let category = db
            .query_category_summary("2026-05-07", "2026-05-07")
            .expect("category summary should query");
        let study = category
            .iter()
            .find(|summary| summary.category_id == "study")
            .expect("study category should exist");
        assert_eq!(study.total_ms, 3_600_000);
        assert!((study.percentage - 40.0).abs() < f64::EPSILON);
    }

    #[test]
    fn missing_session_mutations_return_errors() {
        let db = seeded_db();

        assert!(db.delete_session("missing").is_err());
        assert!(db.update_session_duration("missing", 1_000).is_err());
        assert!(db.update_session_duration("s1", -1).is_err());
    }
}
