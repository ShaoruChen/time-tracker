use crate::models::CategoriesConfig;
use std::fs;
use std::path::PathBuf;

fn config_dir() -> PathBuf {
    dirs_next()
}

fn config_path() -> PathBuf {
    config_dir().join("categories.json")
}

fn dirs_next() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn load_categories() -> Result<CategoriesConfig, String> {
    let path = config_path();
    if !path.exists() {
        init_default_config(&path)?;
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取配置文件失败: {}", e))?;
    serde_json::from_str::<CategoriesConfig>(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))
}

pub fn save_categories(config: &CategoriesConfig) -> Result<(), String> {
    validate_categories(config)?;
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    let json =
        serde_json::to_string_pretty(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(config_path(), json).map_err(|e| format!("写入配置文件失败: {}", e))?;
    Ok(())
}

pub fn validate_categories_json(json: &str) -> Result<CategoriesConfig, String> {
    let config: CategoriesConfig =
        serde_json::from_str(json).map_err(|e| format!("JSON 格式错误: {}", e))?;
    validate_categories(&config)?;
    Ok(config)
}

pub fn validate_categories(config: &CategoriesConfig) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();

    for cat in &config.categories {
        if cat.id.is_empty() {
            return Err("分类 ID 不能为空".into());
        }
        if cat.name.is_empty() {
            return Err("分类名称不能为空".into());
        }
        if !ids.insert(&cat.id) {
            return Err(format!("分类 ID 重复: {}", cat.id));
        }

        let mut task_ids = std::collections::HashSet::new();
        for task in &cat.children {
            if task.id.is_empty() {
                return Err(format!("分类 '{}' 下的任务 ID 不能为空", cat.name));
            }
            if task.name.is_empty() {
                return Err(format!("分类 '{}' 下的任务名称不能为空", cat.name));
            }
            if !task_ids.insert(&task.id) {
                return Err(format!("分类 '{}' 下任务 ID 重复: {}", cat.name, task.id));
            }
        }
    }

    Ok(())
}

fn init_default_config(path: &PathBuf) -> Result<(), String> {
    let default = CategoriesConfig {
        version: 1,
        categories: vec![
            crate::models::Category {
                id: "cat-default".into(),
                name: "工作".into(),
                color: "#667eea".into(),
                children: vec![
                    crate::models::Task {
                        id: "task-code".into(),
                        name: "编码".into(),
                    },
                    crate::models::Task {
                        id: "task-meeting".into(),
                        name: "会议".into(),
                    },
                    crate::models::Task {
                        id: "task-review".into(),
                        name: "代码审查".into(),
                    },
                ],
            },
            crate::models::Category {
                id: "cat-study".into(),
                name: "深度学习".into(),
                color: "#45B7D1".into(),
                children: vec![
                    crate::models::Task {
                        id: "task-paper".into(),
                        name: "论文阅读".into(),
                    },
                    crate::models::Task {
                        id: "task-course".into(),
                        name: "课程学习".into(),
                    },
                ],
            },
            crate::models::Category {
                id: "cat-rest".into(),
                name: "休息".into(),
                color: "#4ECDC4".into(),
                children: vec![],
            },
        ],
    };

    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    let json =
        serde_json::to_string_pretty(&default).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, json).map_err(|e| format!("写入默认配置失败: {}", e))?;
    Ok(())
}
