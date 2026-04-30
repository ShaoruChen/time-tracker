# Time Tracker - 产品设计蓝图

## 1. 产品概览

一款轻量级桌面时间追踪工具。以桌面浮动球为核心交互入口，通过扇形菜单选择项目/任务，一键计时。支持自定义分类（最多二级），Dashboard 提供历史数据回顾与分析。

- **技术栈**: Tauri v2 (Rust + HTML/CSS/JS)
- **目标平台**: macOS only
- **分类配置**: JSON 文件
- **数据存储**: SQLite
- **Dashboard**: 内嵌 Web 页面的独立 Tauri 窗口

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────┐
│                   Tauri Shell                     │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │   Floating Ball  │  │     Dashboard        │ │
│  │   (主窗口)        │  │   (独立窗口)          │ │
│  │                  │  │                      │ │
│  │  - 扇形菜单       │  │  - 历史记录列表       │ │
│  │  - 计时器显示     │  │  - 统计图表          │ │
│  │  - 拖拽移动       │  │  - 分类管理          │ │
│  └────────┬─────────┘  └──────────┬───────────┘ │
│           │         IPC            │             │
│  ┌────────▼────────────────────────▼───────────┐ │
│  │              Rust Backend                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │ │
│  │  │ Config   │ │  Timer   │ │  DB (SQLite) │ │ │
│  │  │ Manager  │ │  Manager │ │  Manager     │ │ │
│  │  └──────────┘ └──────────┘ └──────────────┘ │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 窗口设计

| 窗口 | 类型 | 特性 |
|------|------|------|
| 浮动球 | 主窗口 | 无标题栏、无边框、透明背景、始终置顶、可拖拽、~80px 直径圆形 |
| Dashboard | 子窗口 | 标准窗口、可最小化/关闭、内嵌 Web 页面 |

---

## 3. 数据模型

### 3.1 分类配置 (JSON)

文件路径: `~/.time-tracker/categories.json`

```json
{
  "version": 1,
  "categories": [
    {
      "id": "uuid-1",
      "name": "项目一",
      "color": "#FF6B6B",
      "children": [
        { "id": "uuid-1a", "name": "前端开发" },
        { "id": "uuid-1b", "name": "后端开发" },
        { "id": "uuid-1c", "name": "会议沟通" }
      ]
    },
    {
      "id": "uuid-2",
      "name": "休息",
      "color": "#4ECDC4",
      "children": []
    },
    {
      "id": "uuid-3",
      "name": "深度学习",
      "color": "#45B7D1",
      "children": [
        { "id": "uuid-3a", "name": "论文阅读" },
        { "id": "uuid-3b", "name": "课程学习" }
      ]
    }
  ]
}
```

**规则**:
- `id`: UUID v4，创建时自动生成
- `color`: 每个一级目录指定一个颜色，二级目录继承
- `children`: 空数组 `[]` 表示该一级目录本身即为最终选项
- 最多二级结构，children 中的项不再有 children

### 3.2 计时记录 (SQLite)

数据库路径: `~/.time-tracker/data.db`

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,          -- UUID
  category_id TEXT NOT NULL,             -- 一级目录 ID
  category_name TEXT NOT NULL,            -- 冗余：一级目录名称（快照）
  task_id     TEXT,                       -- 二级目录 ID，NULL 表示一级目录即最终选项
  task_name   TEXT,                       -- 冗余：二级目录名称（快照）
  start_time  TEXT NOT NULL,             -- ISO 8601 格式
  end_time    TEXT,                       -- ISO 8601 格式，NULL 表示未正常结束
  duration_ms INTEGER NOT NULL DEFAULT 0, -- 计时毫秒数
  status      TEXT NOT NULL DEFAULT 'completed', -- completed | paused | abandoned
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_date ON sessions(date(start_time));
CREATE INDEX idx_sessions_category ON sessions(category_id);
```

**设计说明**:
- `category_name` 和 `task_name` 冗余存储快照值，即使后续分类配置变更，历史记录仍保持当时的名称
- `status`: `completed` 正常结束, `paused` 暂停中（保留用于未来恢复）, `abandoned` 异常退出
- `duration_ms` 存毫秒，便于精确计算和聚合

---

## 4. 交互流程

### 4.1 状态机

```
                    ┌──────────┐
                    │  IDLE    │ 浮动球待机
                    │  空闲     │
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              │ 鼠标移入              │ 鼠标移出
              ▼                      ▼
     ┌────────────────┐     ┌──────────────┐
     │  MENU_LEVEL_1  │     │    (回到)     │
     │  一级菜单展开    │     │    IDLE      │
     └───────┬────────┘     └──────────────┘
             │
    ┌────────┴────────┐
    │ 点击有子项的目录  │ 点击无子项的目录
    ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ MENU_LEVEL_2 │  │   SELECTED   │
│ 二级菜单展开   │  │  已选中任务   │
└──────┬───────┘  └──────┬───────┘
       │                 │
       │ 点击二级任务      │ 点击小球
       ▼                 ▼
┌──────────────┐  ┌──────────────┐
│   SELECTED   │  │   RUNNING    │
│  已选中任务   │  │  计时中      │
└──────────────┘  └──────┬───────┘
                         │
                         │ 鼠标移入
                         ▼
                  ┌──────────────┐
                  │ TIMER_MENU   │
                  │ 暂停 / 结束   │
                  └──────┬───────┘
                         │
                ┌────────┴────────┐
                │ 暂停             │ 结束
                ▼                 ▼
         ┌──────────────┐  ┌──────────────┐
         │   PAUSED     │  │    IDLE      │
         │  已暂停       │  │ (记录保存)    │
         └──────┬───────┘  └──────────────┘
                │
       ┌────────┴────────┐
       │ 继续             │ 结束
       ▼                 ▼
┌──────────────┐  ┌──────────────┐
│   RUNNING    │  │    IDLE      │
│  计时中      │  │ (记录保存)    │
└──────────────┘  └──────────────┘
```

### 4.2 详细交互说明

#### 空闲态 → 一级菜单
- 鼠标移入浮动球，在球体周围展开一级目录扇形菜单
- 每个扇形显示目录名称，背景色为用户定义的颜色
- 扇形数量动态决定每个扇形的弧度：每个扇形约 360°/n
- 鼠标移出菜单区域（含球体），菜单收起

#### 一级菜单 → 二级菜单
- 点击有 children 的一级目录 → 扇形切换为二级目录选项
- 扇形下方出现「返回」扇形区域（使用一级目录颜色但淡化）
- 二级目录扇形继承一级目录颜色
- 点击「返回」回到一级菜单

#### 选中任务
- 点击最终任务（无 children 的一级目录或二级目录中的任务）
- 被选中的扇形颜色加深/高亮
- 其他扇形背景淡出
- 可切换点击其他任务
- 再次点击已选中任务 → 取消选中（回到上级菜单）
- 鼠标移出，选中状态保留（不消失）

#### 开始计时
- 选中任务后，点击中心小球 → 开始计时
- 球体显示计时数字（MM:SS 或 HH:MM:SS 格式）
- 球体可以有呼吸灯/脉冲动画表示计时中

#### 计时中菜单
- 鼠标移入计时中的球体 → 显示「暂停」和「结束」两个扇形
- 暂停：计时暂停，扇形变为「继续」和「结束」
- 结束：保存当前 session，球体回到空闲态

#### 暂停态
- 球体显示暂停标识，时间数字保持不动
- 鼠标移入 → 「继续」和「结束」
- 继续：恢复计时
- 结束：保存 session（只计入暂停前的时长），回到空闲态

### 4.3 视觉规格

| 元素 | 规格 |
|------|------|
| 浮动球直径 | 80px（可配置 60-100px） |
| 扇形外半径 | 150px（从球心算起） |
| 扇形内半径 | 40px（球半径） |
| 每个扇形最小弧度 | 45°（超过 8 项时需要滚动或分页机制） |
| 每个扇形最大弧度 | 90°（少于 4 项时防止扇形过大） |
| 菜单动画 | 展开 200ms ease-out，收起 150ms ease-in |
| 球体颜色 | 默认渐变 #667eea → #764ba2，计时中脉冲动画 |
| 字体 | 系统默认 sans-serif，扇形文字 12px |

---

## 5. 组件树

```
FloatingBall (主窗口)
├── BallFace (球体本身)
│   ├── IdleState        — 默认渐变球体
│   ├── SelectedState    — 显示选中任务名称缩写
│   ├── RunningState     — 显示计时数字 + 脉冲动画
│   └── PausedState      — 显示暂停图标 + 时间数字
│
├── FanMenu (扇形菜单容器)
│   ├── FanSector[]      — 扇形项数组
│   │   ├── SectorLabel  — 扇形中的文字
│   │   └── SectorIcon   — 可选 emoji/icon
│   ├── Level1Menu       — 一级目录
│   │   └── FanSector (per category)
│   ├── Level2Menu       — 二级目录
│   │   ├── FanSector (per child task)
│   │   └── BackSector   — 返回按钮（底部）
│   └── TimerMenu        — 计时中菜单
│       ├── PauseSector
│       ├── ResumeSector
│       └── EndSector

Dashboard (独立窗口)
├── SummaryBar            — 今日/本周/本月总时长
├── DateRangeFilter       — 日期范围选择
├── SessionList            — 计时记录列表
│   └── SessionRow[]
├── CategoryChart          — 分类饼图/柱状图
├── DailyChart             — 每日时长趋势图
└── ConfigEditor           — 分类 JSON 编辑区
```

---

## 6. IPC 命令设计 (Tauri Commands)

### 6.1 分类管理

```
get_categories() → CategoriesConfig
  返回完整分类树

save_categories(config: CategoriesConfig) → Result<()>
  保存分类配置（Dashboard 编辑用）

validate_categories(json: String) → Result<CategoriesConfig>
  校验 JSON 合法性
```

### 6.2 计时控制

```
start_timer(category_id: String, task_id: Option<String>) → Session
  创建新 session，状态为 running，返回 session 对象

pause_timer(session_id: String) → Session
  暂停当前 session，累计已计时长

resume_timer(session_id: String) → Session
  恢复暂停的 session

end_timer(session_id: String) → Session
  结束 session，保存最终时长到 DB

get_active_session() → Option<Session>
  查询是否有未结束的 session（用于应用重启恢复）
```

### 6.3 历史数据 (Dashboard)

```
get_sessions(date_from: String, date_to: String, category_id: Option<String>)
  → Vec<Session>
  按日期范围查询记录

get_daily_summary(date_from: String, date_to: String)
  → Vec<DailySummary { date: String, total_ms: i64 }>
  每日总时长

get_category_summary(date_from: String, date_to: String)
  → Vec<CategorySummary { category_id, category_name, total_ms, percentage }>
  分类时长占比

export_csv(date_from: String, date_to: String) → String
  导出 CSV 文本内容
```

---

## 7. 文件结构

```
time-tracker/
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Tauri 窗口配置
│   ├── build.rs
│   ├── icons/                    # 应用图标
│   └── src/
│       ├── main.rs               # 入口：Tauri builder + 命令注册
│       ├── config.rs             # 分类 JSON 读写
│       ├── db.rs                 # SQLite 初始化与 CRUD
│       ├── timer.rs              # 计时器状态机
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── config_cmd.rs     # 分类相关命令
│       │   ├── timer_cmd.rs      # 计时相关命令
│       │   └── dashboard_cmd.rs  # 查询/统计命令
│       └── models.rs             # 数据结构定义
│
├── src/                          # 前端
│   ├── index.html                # 浮动球主页面入口
│   ├── dashboard.html            # Dashboard 页面入口
│   ├── styles/
│   │   ├── ball.css              # 球体样式 + 动画
│   │   ├── fan-menu.css          # 扇形菜单样式
│   │   └── dashboard.css         # Dashboard 样式
│   ├── js/
│   │   ├── ball.js               # 浮动球主逻辑
│   │   ├── fan-menu.js           # 扇形菜单组件
│   │   ├── timer-display.js      # 计时显示更新
│   │   ├── state-machine.js      # UI 状态机
│   │   ├── dashboard.js          # Dashboard 主逻辑
│   │   ├── charts.js             # 图表渲染 (Chart.js)
│   │   └── api.js                # Tauri invoke 封装
│   └── assets/
│       └── default-categories.json  # 默认分类模板
│
├── package.json                  # 前端依赖
├── vite.config.js                # Vite 构建配置
└── dev-docs/
    ├── design-blueprint.md       # 本文档
    └── execution-plan.md         # 执行计划
```

---

## 8. 关键设计决策

### 8.1 浮动球窗口实现
- Tauri window config: `decorations: false`, `transparent: true`, `always_on_top: true`, `skip_taskbar: true`
- 窗口大小约 300×300px（球体 80px + 扇形扩展空间 150px 半径）
- 使用 `data-tauri-drag-region` 属性实现窗口拖拽
- macOS 上设置 `.has-shadow{false}` 避免透明窗口阴影

### 8.2 扇形菜单实现
- 使用 CSS `clip-path: polygon()` 创建扇形区域
- 通过 `transform: rotate()` 将每个扇形旋转到正确位置
- 扇区内文字反向旋转以保持可读性
- 动态计算每个扇形的角度：`arcAngle = Math.min(90, Math.max(45, 360 / itemCount))`

### 8.3 计时器精度
- Rust 端使用 `std::time::Instant` 记录时刻
- 前端每秒通过 `setInterval` + 读取 session start_time 计算已过时长
- 暂停时累计已过时长 `accumulated_ms`，恢复时重置 start_time
- 窗口关闭时自动暂停，重启时提供恢复选项

### 8.4 数据安全
- 每次结束 session 立即写入 SQLite
- 应用退出时如有活跃 session，标记为 `abandoned` 并保存已计时长
- JSON 配置文件保存前做 schema 校验
- SQLite 使用 WAL 模式提升并发性能
