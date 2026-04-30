# Time Tracker - 执行计划

## 总览

| 阶段 | 名称 | 预计工期 | 核心交付物 |
|------|------|---------|-----------|
| P0 | 项目初始化 | 0.5天 | Tauri 脚手架、Vite 配置、空窗口 |
| P1 | 后端核心 | 1天 | 配置管理、SQLite 初始化、计时器状态机、IPC 命令 |
| P2 | 浮动球 UI | 1.5天 | 球体渲染、扇形菜单、状态机、动画 |
| P3 | 计时流程 | 0.5天 | 开始/暂停/结束完整流程 |
| P4 | Dashboard | 1.5天 | 历史记录、图表、CSV 导出 |
| P5 | 收尾 | 0.5天 | 图标、打包、测试、bug 修复 |

---

## P0: 项目初始化

### 任务清单

- [ ] **P0.1** 安装 Tauri CLI 和初始化项目
  ```bash
  cargo install tauri-cli --version "^2"
  npm create tauri-app@latest time-tracker -- --template vanilla-ts
  ```

- [ ] **P0.2** 配置 Vite + 前端依赖
  - 安装 `chart.js` (Dashboard 图表)
  - 配置 `vite.config.js` 支持多页面 (index.html + dashboard.html)

- [ ] **P0.3** 配置 Tauri 窗口
  - `tauri.conf.json` 中设置主窗口 (浮动球):
    ```json
    {
      "windows": [{
        "label": "ball",
        "url": "index.html",
        "width": 300, "height": 300,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "resizable": false,
        "shadow": false
      }]
    }
    ```
  - 预先声明 Dashboard 窗口 label: `"dashboard"`（运行时动态创建）
  - macOS 权限配置: `tauri.conf.json` 中不需要特殊权限（浮动窗口不需要 accessibility）

- [ ] **P0.4** 创建项目目录结构（见蓝图 §7）

- [ ] **P0.5** 在 `~/.time-tracker/` 创建默认 `categories.json`

---

## P1: 后端核心

### P1.1 数据模型 (`models.rs`)

```rust
// 核心数据结构
struct CategoriesConfig { version: u8, categories: Vec<Category> }
struct Category { id: String, name: String, color: String, children: Vec<Task> }
struct Task { id: String, name: String }
struct Session { id, category_id, category_name, task_id, task_name,
                 start_time, end_time, duration_ms, status, created_at, updated_at }
struct DailySummary { date: String, total_ms: i64 }
struct CategorySummary { category_id, category_name, total_ms, percentage: f64 }
```

### P1.2 配置管理 (`config.rs`)

- `load_categories() -> Result<CategoriesConfig>`: 读取 `~/.time-tracker/categories.json`，不存在则复制默认模板
- `save_categories(config: &CategoriesConfig) -> Result<()>`: 先 validate 再写入
- `validate_categories(config: &CategoriesConfig) -> Result<()>`: 检查 id 唯一性、颜色格式、children 无嵌套等

### P1.3 数据库 (`db.rs`)

- `init_db() -> Result<Connection>`: 创建/迁移 SQLite 数据库，执行 CREATE TABLE
- CRUD 函数:
  - `insert_session(session: &Session)`
  - `update_session(id, end_time, duration_ms, status)`
  - `get_active_session() -> Option<Session>`
  - `query_sessions(date_from, date_to, category_id) -> Vec<Session>`
  - `query_daily_summary(date_from, date_to) -> Vec<DailySummary>`
  - `query_category_summary(date_from, date_to) -> Vec<CategorySummary>`
- 使用 `rusqlite` crate，开启 WAL 模式

### P1.4 计时器状态机 (`timer.rs`)

```rust
struct TimerState {
    active_session: Option<Session>,
    accumulator: Duration,  // 暂停期间累计时长
    phase: TimerPhase,      // Idle | Running | Paused
    start_instant: Option<Instant>,
}

impl TimerState {
    fn start(&mut self, category_id, task_id) -> Session;
    fn pause(&mut self) -> Session;
    fn resume(&mut self) -> Session;
    fn end(&mut self) -> Session;
    fn elapsed_ms(&self) -> i64;  // 当前已过毫秒数
}
```

- 使用 `Mutex<TimerState>` 作为 Tauri 全局状态

### P1.5 IPC 命令 (`commands/`)

- 按蓝图 §6 的接口定义注册所有 Tauri commands
- 所有命令通过 `tauri::State<TimerState>` 访问计时器
- Dashboard 命令直接访问 SQLite

---

## P2: 浮动球 UI

### P2.1 球体渲染 (`ball.css` + `index.html`)

- HTML: 一个 `<div id="ball">` 作为球体，外围 `<div id="fan-container">` 容纳扇形
- CSS: 球体 `border-radius: 50%`, 背景渐变, `box-shadow` 光晕
- 鼠标事件: `mouseenter`/`mouseleave` 控制菜单显隐

### P2.2 扇形菜单 (`fan-menu.js` + `fan-menu.css`)

核心算法:

```javascript
function renderFan(items, backLabel = null) {
  const n = items.length + (backLabel ? 1 : 0);
  const arcAngle = clamp(360 / n, 45, 90); // 每项角度
  const startAngle = backLabel ? -90 - (arcAngle * (n-1)) / 2 : -90 - (arcAngle * n) / 2;
  // 从顶部 (-90°) 开始均匀分布

  items.forEach((item, i) => {
    const angle = startAngle + i * arcAngle;
    const sector = createSector(item, angle, arcAngle);
    fanContainer.appendChild(sector);
  });

  if (backLabel) {
    // 「返回」放在正下方 (90° 位置)
    const backSector = createBackSector(backLabel, arcAngle);
    fanContainer.appendChild(backSector);
  }
}

function createSector(item, angle, arcAngle) {
  const el = document.createElement('div');
  el.className = 'fan-sector';
  // clip-path + transform: rotate 实现扇形
  el.style.transform = `rotate(${angle}deg)`;
  el.style.clipPath = sectorClipPath(arcAngle);
  // 文字反向旋转
  el.querySelector('.label').style.transform = `rotate(${-angle}deg)`;
  return el;
}
```

扇形 CSS 要点:
- `position: absolute; top: 50%; left: 50%;`
- `transform-origin: 0 0;` (扇形顶点在球心)
- `width: 150px; height: 150px;` (扇形半径)
- `clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);` → 动态计算为扇形
- `transition: transform 0.2s ease, opacity 0.15s ease;`

### P2.3 菜单动画
- 展开: `@keyframes fanIn { from { opacity: 0; transform: scale(0.5); } }`
- 收起: `@keyframes fanOut { to { opacity: 0; transform: scale(0.8); } }`
- 扇形 hover: 轻微放大 `scale(1.05)`, 亮度提升 `filter: brightness(1.1)`

### P2.4 UI 状态机 (`state-machine.js`)

```
States: idle → menu_level_1 → menu_level_2 → selected → running → timer_menu → paused → ...

Events:
  ball:hover        → 展开对应菜单
  sector:click      → 进入下级 / 选中任务
  ball:click        → 开始计时 (仅 selected 状态)
  menu:mouseleave   → 收起菜单
  end:click         → 结束计时，保存，回 idle
```

每个状态对应 DOM 的 class 切换，控制可见性和动画。

### P2.5 拖拽 (`ball.js`)

- 球体区域标记 `data-tauri-drag-region`
- Tauri 自动处理窗口拖拽
- 拖拽时隐藏菜单

---

## P3: 计时流程

### P3.1 选中 → 开始计时
- UI 端: 双击球体 或 选中后单击球体 → `invoke('start_timer', { categoryId, taskId })`
- 后端: 创建 Session, 写入 DB (status=running), 启动计时
- 前端: 定时器 `setInterval(200ms)` 调用 `get_elapsed_ms()`, 更新球体数字显示

### P3.2 计时中菜单
- 鼠标移入 → 显示 2 个扇形：「⏸ 暂停」「⏹ 结束」
- 暂停 → `invoke('pause_timer')` → 菜单变为「▶ 继续」「⏹ 结束」
- 结束 → `invoke('end_timer')` → 保存记录 → 回 idle

### P3.3 恢复机制
- 应用启动时调用 `get_active_session()`
- 若有 paused session → 恢复到 paused 状态，显示继续/结束选项
- 若有 running session → 自动恢复计时显示（实际的 start_time 不变，继续计时）

### P3.4 边缘情况
- 计时中拖拽球体 → 正常继续计时，隐藏菜单
- 计时中切屏/锁屏 → 计时持续，回来显示正确时间
- macOS 睡眠唤醒 → 计时持续（Instant 在 macOS 上可能受睡眠影响，改用 `SystemTime` 做 fallback），如果 Instant 偏差超过阈值（如 5 分钟），用 SystemTime 修正

---

## P4: Dashboard

### P4.1 Dashboard 窗口创建

- 从小球的右键菜单或一级菜单中的「Dashboard」选项触发
- Tauri 命令: `create_dashboard_window()` → 创建/聚焦 Dashboard 窗口
- Dashboard 关闭时只隐藏 (`.hide()`)，下次打开复用

### P4.2 页面布局

```
┌──────────────────────────────────────────────┐
│  Time Tracker Dashboard            [_] [□] [X]│
├──────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ 今日     │ │ 本周     │ │ 本月     │        │
│  │ 3.5h    │ │ 18.2h   │ │ 72.5h   │        │
│  └─────────┘ └─────────┘ └─────────┘        │
│                                              │
│  [日期选择器: 2026-04-22 ~ 2026-04-29]        │
│                                              │
│  ┌─────────────────┐ ┌──────────────────┐   │
│  │  每日时长趋势     │ │  分类占比饼图     │   │
│  │  (折线图)        │ │  (饼图)          │   │
│  │                 │ │                  │   │
│  └─────────────────┘ └──────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  计时记录列表                          │   │
│  │  时间 | 项目 | 任务 | 时长 | 状态     │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  [ 编辑分类 ]  [ 导出 CSV ]                  │
└──────────────────────────────────────────────┘
```

### P4.3 图表 (`charts.js`)

- 使用 Chart.js
- 每日趋势图: line chart, X=日期 Y=小时数
- 分类占比: doughnut chart, 按一级目录汇总
- 颜色使用分类配置中的 color

### P4.4 分类编辑

- 点击「编辑分类」→ 展开一个 `<textarea>` 显示当前 `categories.json` 内容
- 用户手动编辑 JSON → 点击「保存」→ `invoke('save_categories', { config })` → 后端校验
- 校验失败 → 显示错误信息，不覆盖现有配置
- 校验成功 → 保存，浮动球下次展开菜单时使用新配置

### P4.5 CSV 导出

- `invoke('export_csv', { dateFrom, dateTo })` 返回 CSV 字符串
- 前端触发文件保存对话框 (`tauri-plugin-dialog`)
- 文件命名: `time-tracker-export-2026-04-22-2026-04-29.csv`

---

## P5: 收尾

### P5.1 应用图标
- 设计/生成 icns 图标 (macOS)
- 放置于 `src-tauri/icons/`

### P5.2 打包配置
- `tauri.conf.json` 中设置 `bundle.identifier` (如 `com.user.timetracker`)
- 设置应用名称、版本号
- `cargo tauri build --target universal-apple-darwin` 构建 macOS .dmg

### P5.3 测试清单
- [ ] 分类 JSON 解析错误处理（格式错误、缺少字段）
- [ ] 空分类（无任何目录）时的 UI 表现
- [ ] 单分类无子项时的菜单交互
- [ ] 8+ 个一级目录时的扇形布局
- [ ] 计时中强制退出应用 → 重启恢复
- [ ] 暂停超过 24h → 继续计时
- [ ] Dashboard 无数据时的空状态
- [ ] Dashboard 大量数据时的性能（1000+ sessions）
- [ ] 系统睡眠/唤醒时的计时准确性
- [ ] 多显示器下的窗口位置

### P5.4 性能优化
- 球体窗口最小化 CSS 动画开销（`will-change`, `transform: translateZ(0)`）
- Dashboard 大数据集分页加载（每次 100 条）
- SQLite 查询使用索引，避免全表扫描

---

## 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| Tauri 透明窗口在 macOS 上的兼容性 | 球体无法透明显示 | 备选: 非透明窗口 + `NSVisualEffectView` 毛玻璃背景 |
| 扇形 CSS 实现复杂度高 | 菜单动画 buggy | 退化方案: 简单圆形扩散菜单（项目排列为围绕球体的圆点） |
| macOS 睡眠导致计时不准 | 数据偏差 | 双重计时: Instant + SystemTime 互校验 |
| Tauri v2 API 不稳定 | 构建失败 | 锁定版本，参考官方示例 |
