# Time Tracker

A lightweight macOS desktop time tracker with a floating ball interface. Select a task, click the ball, and start tracking.

## Features

- **Floating Ball** — A draggable 80px ball sits on your desktop. Shrinks to just the ball when idle, so it doesn't block underlying windows.
- **Fan Menu** — Hover the ball to reveal a radial fan menu with your categories. Supports two levels: categories → tasks. Dashboard and back buttons are always at the bottom.
- **Timer** — Start / pause / resume / end. Elapsed time displayed on the ball in real time. Active sessions survive app restarts.
- **Dashboard** — Open from the fan menu. Shows daily trend chart, category breakdown doughnut chart, session history table, and CSV export.
- **Visual Category Editor** — Manage categories and tasks in the dashboard with a form UI. Three preset color themes: Indigo, Sunset, Aurora.
- **Session History** — All sessions stored in SQLite. Filter by date range, view summaries.

## Tech Stack

- [Tauri v2](https://tauri.app/) (Rust + WebView)
- Vanilla HTML/CSS/JS + [Vite](https://vitejs.dev/)
- [Chart.js](https://www.chartjs.org/) for dashboard charts
- SQLite via [rusqlite](https://github.com/rusqlite/rusqlite) (bundled)

## Prerequisites

- macOS 10.15+
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (with `rustup`)

## Install & Run

```bash
# Clone
git clone https://github.com/ShaoruChen/time-tracker.git
cd time-tracker

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

The `.dmg` will be in `src-tauri/target/release/bundle/dmg/`.

## Configuration

Categories are stored in `~/.time-tracker/categories.json`. Default categories are created automatically on first launch. You can also edit them visually in the Dashboard.

## Project Structure

```
src/                  # Frontend
  js/
    main.js           # Ball & fan menu state machine
    fan-menu.js       # SVG fan menu renderer
    dashboard.js      # Dashboard with charts & category editor
    api.js            # Tauri IPC wrapper
  styles/
    ball.css          # Ball styles & animations
    fan-menu.css      # Fan menu transitions
    dashboard.css     # Dashboard layout
src-tauri/            # Rust backend
  src/
    lib.rs            # App setup & command registration
    main.rs           # Entry point
    models.rs         # Data structures
    config.rs         # JSON config read/write
    db.rs             # SQLite operations
    timer.rs          # Timer state machine
    commands/         # IPC command handlers
```
