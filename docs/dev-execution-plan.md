# Dev Execution Plan — Phase 1

## Overview

Time Tracker: a macOS desktop time tracking app with a floating ball interface, radial fan menu, SQLite-backed session storage, and a Chart.js dashboard. Built on Tauri v2 (Rust + vanilla HTML/CSS/JS + Vite).

---

## Implemented Features

### P1: Project Scaffold
- Tauri v2 app with dual windows: floating ball (index.html) + dashboard (dashboard.html)
- Vite multi-page build with dev server on port 1420
- Transparent, undecorated window: `decorations: false, transparent: true, alwaysOnTop: true, shadow: false`

### P2: Backend Core
- **Models** (`src-tauri/src/models.rs`): `CategoriesConfig`, `Category`, `Task`, `Session`, `DailySummary`, `CategorySummary`
- **SQLite** (`src-tauri/src/db.rs`): rusqlite with `bundled` feature, `Arc<Mutex<Connection>>`, CRUD for sessions, aggregate queries for dashboard charts
- **Timer State Machine** (`src-tauri/src/timer.rs`): `Idle | Running | Paused` with `accumulated_ms`, UTC-based timestamps, session restore on app restart
- **Config** (`src-tauri/src/config.rs`): JSON stored at `~/.time-tracker/categories.json`, auto-creates defaults (工作/深度学习/休息), validation (duplicate ID check, empty name check)
- **IPC Commands** (`src-tauri/src/commands/`): 16 commands for config, timer, and dashboard operations

### P3: Floating Ball UI
- 80px gradient ball with state-driven colors: idle (purple), selected (green), running (pink pulse), paused (orange)
- SVG fan menu (`src/js/fan-menu.js`): mathematically computed wedge sectors using polar-to-cartesian arc paths (`M … A … L … A … Z`)
- `FAN_OUTER_R = 150`, `FAN_INNER_R = 42` — sectors arranged around a 300px diameter circle
- State-driven label display: empty → task name → elapsed timer text

### P4: Timer Flow
- Start timer on ball click when task selected
- Pause/Resume/End via fan menu (appears on hover while running/paused)
- Elapsed time polling at 200ms intervals
- Active session recovery on app restart via `get_active_session()`

### P5: Dashboard
- Daily trend bar chart + category doughnut chart (Chart.js)
- Session history table with date filtering
- CSV export with UTF-8 BOM
- Visual category editor with form-based category/task CRUD
- Three preset color themes: 靛蓝 (Indigo), 霞光 (Sunset), 极光 (Aurora)

### P6: UX Refinements (this session)
- **Fan menu hover fix**: menu stays open when mouse crosses the center ball between sectors
- **Window positioning**: ball window placed at screen right side (20px margin), vertically centered, via Rust setup hook
- **Window dragging**: `data-tauri-drag-region` + `startDragging()` fallback
- **Dynamic window resize**: window shrinks to 80×80 (ball only) when idle, expands to 320×320 when fan opens — transparent areas no longer block underlying windows
- **Fan layout**: Dashboard/Back sectors fixed at 6 o'clock, all sectors evenly divide 360° (no gaps), timer menu items arranged left-right
- **README.md**: features, setup, build instructions, project structure

---

## Issues Encountered & Resolved

| # | Issue | Root Cause | Fix |
|---|-------|-----------|-----|
| 1 | `cargo tauri` command not found | `@tauri-apps/cli` provides `npm run tauri` only; `cargo tauri` needs `cargo install tauri-cli` separately | Use `npm run tauri dev` |
| 2 | Crates named `time_tracker_lib` vs `time_tracker` | Mismatch between `main.rs` call and actual lib name | Unified to `time_tracker` |
| 3 | `rusqlite` MappedRows borrow errors | Statement outlives connection; iterator chains fail lifetime analysis | `Arc<Mutex<Connection>>` for Clone; for-loop instead of `.collect()` |
| 4 | Default config JSON parse error | `r#"..."#` raw string delimiter `#` conflicted with color codes like `#667eea` | Construct default config programmatically with struct literals |
| 5 | `generate_context!()` failed — missing icons | No PNG icons in `src-tauri/icons/` | Generated RGBA PNGs with Python Pillow (`color_type=6`) |
| 6 | `tauri.conf.json` plugin schema errors | `"dialog": {}` expected unit, `"fs": {"scope": ...}` unknown field | Removed both plugins (not needed; backend uses `std::fs` directly) |
| 7 | Vite served on 5173, Tauri expected 1420 | No `server.port` in vite config | Added `port: 1420, strictPort: true` |
| 8 | Fan sectors had wrong angles with CSS `clip-path` | Polygon approximation doesn't work for arbitrary arc sectors | Rewrote entire fan menu using SVG `<path>` with mathematical arc commands |
| 9 | Timer didn't start after task selection | `_onBallHover()` switched state from `SELECTED` back to `MENU_LEVEL_1` before click | Close menu immediately on final selection; accept `MENU_LEVEL_1/2` in click handler |
| 10 | Fan menu collapsed when mouse crossed ball | `_onBallHover()` rebuilt menu (calling `clear()`), `_onFanLeave()` couldn't detect ball hover | Guard `_onBallHover()` against re-entry in menu states; add 100ms delay + hover check in `_onFanLeave()` |
| 11 | App window fixed at top-left, blocking screen | `x: 0, y: 0` in config, 320×320 window always occupied space | Rust setup hook positions window at right side; dynamic resize 80×80 ↔ 320×320 |
| 12 | Window not draggable | Missing `core:window:allow-start-dragging` permission (not in defaults); also needed `macOSPrivateApi` for transparent windows | Added `capabilities/default.json` with permission; enabled `macos-private-api` feature in Cargo.toml |
| 13 | Dashboard sector not at 6 o'clock | Dashboard pushed into `items[]` as regular item, not passed as `backLabel` | Moved to `backLabel` option; `_onSectorClick` uses `isBack` flag for Dashboard detection |
| 14 | Timer menu items top-bottom instead of left-right | `startAngle` always computed for `backLabel` case (last item at 90°), even when no backLabel | Without `backLabel`: `startAngle = 0` (first item at 3 o'clock, second at 9 o'clock) |
| 15 | White gaps in fan when few items | `arcAngle = clamp(360/n, 40, 90)` limited max angle to 90° | Removed clamp: `arcAngle = 360 / n` always fills 360° |

---

## Architecture Decisions

- **Database & TimerState as separate Tauri managed states** rather than nesting — Dashboard commands need direct DB access independent of timer
- **SVG for fan menu** over CSS clip-path — precise angle control, reliable across platforms
- **Fan menu show/hide callbacks** (`onShow`/`onHide`) for window resize — decouples menu rendering from window management
- **Persistent data-* IDs** on category/task DOM elements — survives re-indexing after deletions, no index-based lookup bugs
- **Session restore in Rust `run()`** — checks DB for active session before building Tauri app, restores `TimerState` accumulator

## Next Steps (Phase 2)

- App icon design (currently placeholder PNGs)
- macOS `.dmg` packaging test (`cargo tauri build`)
- Comprehensive testing across macOS versions
- Potential features: keyboard shortcuts, notification on long sessions, idle detection
