import { api } from './api.js';
import { FanMenu } from './fan-menu.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';

const State = {
  IDLE: 'idle',
  MENU_LEVEL_1: 'menu_level_1',
  MENU_LEVEL_2: 'menu_level_2',
  SELECTED: 'selected',
  RUNNING: 'running',
  PAUSED: 'paused',
  TIMER_MENU: 'timer_menu',
};

class App {
  constructor() {
    this.state = State.IDLE;
    this.categories = [];
    this.currentCategory = null;
    this.selectedCategoryId = null;
    this.selectedTaskId = null;
    this.timerInterval = null;

    this.ball = document.getElementById('ball');
    this.ballLabel = document.getElementById('ball-label');
    this.fanMenu = new FanMenu('fan-container');
    this._windowExpanded = true; // window starts at 320x320

    this.fanMenu.onSectorClick = (id, isBack) => this._onSectorClick(id, isBack);
    this.fanMenu.onShow = () => this._expandWindow();
    this.fanMenu.onHide = () => this._shrinkWindow();

    this._setupEventListeners();
    this._init();
  }

  async _init() {
    try {
      const config = await api.getCategories();
      if (config) {
        this.categories = config.categories || [];
      }

      const status = await api.getTimerStatus();
      if (status) {
        if (status.phase === 'Running') {
          this.state = State.RUNNING;
          this._startTimerDisplay();
        } else if (status.phase === 'Paused') {
          this.state = State.PAUSED;
        }
        this._updateBallDisplay();
      }
    } catch (err) {
      console.error('Init error:', err);
    }

    if (this.state === State.IDLE) {
      this._updateBallDisplay();
    }
    // Always shrink on startup — fan menu starts closed
    this._shrinkWindow();

    listen('config-changed', async () => {
      try {
        const config = await api.getCategories();
        if (config) {
          this.categories = config.categories || [];
        }
        this._updateBallDisplay();
      } catch (e) { /* ignore */ }
    });
  }

  _setupEventListeners() {
    this.ball.addEventListener('mouseenter', () => this._onBallHover());
    this.ball.addEventListener('mouseleave', (e) => {
      const fan = document.getElementById('fan-container');
      if (fan && fan.contains(e.relatedTarget)) return;
      this._onBallLeave();
    });

    const fan = document.getElementById('fan-container');
    fan.addEventListener('mouseleave', () => this._onFanLeave());

    this.ball.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        getCurrentWindow().startDragging();
      }
    });

    this.ball.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this._onBallClick();
    });

    this.ball.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await api.showContextMenu(e.clientX, e.clientY);
      } catch (err) { /* ignore */ }
    });
  }

  _onBallHover() {
    if (this.state === State.RUNNING || this.state === State.PAUSED) {
      this._showTimerMenu();
    } else if (
      this.state !== State.TIMER_MENU &&
      this.state !== State.MENU_LEVEL_1 &&
      this.state !== State.MENU_LEVEL_2
    ) {
      this._showLevel1Menu();
    }
  }

  _onBallLeave() {
    setTimeout(() => {
      const fan = document.getElementById('fan-container');
      if (fan && fan.matches(':hover')) return;

      if (this.state === State.MENU_LEVEL_1 || this.state === State.MENU_LEVEL_2) {
        this.fanMenu.hide();
        this.state = this.selectedCategoryId ? State.SELECTED : State.IDLE;
      } else if (this.state === State.TIMER_MENU) {
        this.fanMenu.hide();
        this.state = this._wasPausedBeforeMenu ? State.PAUSED : State.RUNNING;
      }
      this._updateBallDisplay();
    }, 100);
  }

  _onFanLeave() {
    setTimeout(() => {
      const ball = document.getElementById('ball');
      if (ball && ball.matches(':hover')) return;

      if (this.state === State.MENU_LEVEL_1 || this.state === State.MENU_LEVEL_2) {
        this.fanMenu.hide();
        this.state = this.selectedCategoryId ? State.SELECTED : State.IDLE;
      } else if (this.state === State.TIMER_MENU) {
        this.fanMenu.hide();
        this.state = this._wasPausedBeforeMenu ? State.PAUSED : State.RUNNING;
      }
      this._updateBallDisplay();
    }, 100);
  }

  async _expandWindow() {
    if (this._windowExpanded) return;
    this._windowExpanded = true;
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const offset = (320 - 80) / 2;
      await win.setPosition(new PhysicalPosition(
        Math.max(0, pos.x - offset),
        Math.max(0, pos.y - offset),
      ));
      await win.setSize(new PhysicalSize(320, 320));
    } catch (e) { /* ignore */ }
  }

  async _shrinkWindow() {
    if (!this._windowExpanded) return;
    this._windowExpanded = false;
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const offset = (320 - 80) / 2;
      await win.setSize(new PhysicalSize(80, 80));
      await win.setPosition(new PhysicalPosition(
        pos.x + offset,
        pos.y + offset,
      ));
    } catch (e) { /* ignore */ }
  }

  _onBallClick() {
    // Allow starting timer when a task is selected, regardless of menu state
    if (this.selectedCategoryId) {
      if (this.state === State.SELECTED ||
          this.state === State.MENU_LEVEL_1 ||
          this.state === State.MENU_LEVEL_2) {
        this._startTimer();
      }
    }
  }

  _showLevel1Menu() {
    this.state = State.MENU_LEVEL_1;
    const items = this.categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    }));
    this.fanMenu.show(items, {
      selectedId: this.selectedCategoryId,
      backLabel: 'Dashboard',
      backColor: '#888',
    });

    if (this.selectedCategoryId && !this.selectedTaskId) {
      this.fanMenu.highlightSelected(this.selectedCategoryId);
    }
  }

  _showLevel2Menu(category) {
    this.state = State.MENU_LEVEL_2;
    this.currentCategory = category;

    const tasks = category.children || [];
    const items = tasks.map((t, i) => ({
      id: t.id,
      name: t.name,
      color: this._shadeColor(category.color, i, tasks.length),
    }));

    this.fanMenu.show(items, {
      backLabel: '返回',
      backColor: category.color,
      selectedId: this.selectedTaskId,
    });

    if (this.selectedTaskId) {
      this.fanMenu.highlightSelected(this.selectedTaskId);
    }
  }

  _showTimerMenu() {
    this._wasPausedBeforeMenu = this.state === State.PAUSED;
    const prevState = this.state;
    this.state = State.TIMER_MENU;

    if (prevState === State.PAUSED) {
      this.fanMenu.show([
        { id: 'resume', name: '继续', color: '#56ab2f' },
        { id: 'end', name: '结束', color: '#f5576c' },
      ]);
    } else {
      this.fanMenu.show([
        { id: 'pause', name: '暂停', color: '#ffd89b' },
        { id: 'end', name: '结束', color: '#f5576c' },
      ]);
    }
  }

  async _onSectorClick(id, isBack) {
    if (this.state === State.MENU_LEVEL_1) {
      if (isBack) {
        try { await api.openDashboard(); } catch (e) { /* ignore */ }
        return;
      }

      const cat = this.categories.find((c) => c.id === id);
      if (!cat) return;

      if (cat.children && cat.children.length > 0) {
        this._showLevel2Menu(cat);
      } else {
        // Final selection - close menu so user can click ball to start
        this.selectedCategoryId = id;
        this.selectedTaskId = null;
        this.fanMenu.hide();
        this.state = State.SELECTED;
        try { await api.selectTask(id, null); } catch (e) { /* ignore */ }
        this._updateBallDisplay();
      }
    } else if (this.state === State.MENU_LEVEL_2) {
      if (isBack) {
        this._showLevel1Menu();
        return;
      }

      // Final selection - close menu so user can click ball to start
      this.selectedCategoryId = this.currentCategory?.id;
      this.selectedTaskId = id;
      this.fanMenu.hide();
      this.state = State.SELECTED;
      try { await api.selectTask(this.currentCategory.id, id); } catch (e) { /* ignore */ }
      this._updateBallDisplay();
    } else if (this.state === State.TIMER_MENU) {
      if (id === 'pause') {
        await this._pauseTimer();
      } else if (id === 'resume') {
        await this._resumeTimer();
      } else if (id === 'end') {
        await this._endTimer();
      }
    }
  }

  async _startTimer() {
    try {
      await api.startTimer();
      this.state = State.RUNNING;
      this.fanMenu.hide();
      this._startTimerDisplay();
      this._updateBallDisplay();
    } catch (err) {
      console.error('Failed to start timer:', err);
    }
  }

  async _pauseTimer() {
    try {
      await api.pauseTimer();
      this.state = State.PAUSED;
      this.fanMenu.hide();
      this._stopTimerDisplay();
      this._updateBallDisplay();
    } catch (err) {
      console.error('Failed to pause timer:', err);
    }
  }

  async _resumeTimer() {
    try {
      await api.resumeTimer();
      this.state = State.RUNNING;
      this.fanMenu.hide();
      this._startTimerDisplay();
      this._updateBallDisplay();
    } catch (err) {
      console.error('Failed to resume timer:', err);
    }
  }

  async _endTimer() {
    try {
      await api.endTimer();
      this.state = State.IDLE;
      this.selectedCategoryId = null;
      this.selectedTaskId = null;
      this.fanMenu.hide();
      this._stopTimerDisplay();
      this._updateBallDisplay();
    } catch (err) {
      console.error('Failed to end timer:', err);
    }
  }

  _startTimerDisplay() {
    this._stopTimerDisplay();
    this.timerInterval = setInterval(async () => {
      try {
        const elapsed = await api.getElapsed();
        if (elapsed !== null) {
          this._renderTimer(elapsed);
        }
      } catch (err) { /* ignore */ }
    }, 200);
  }

  _stopTimerDisplay() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  async _updatePausedDisplay() {
    try {
      const elapsed = await api.getElapsed();
      if (elapsed !== null) {
        this._renderTimer(elapsed);
      }
    } catch (err) { /* ignore */ }
  }

  _renderTimer(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    let text;
    if (hours > 0) {
      text = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      text = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    this.ballLabel.textContent = text;
    this.ballLabel.classList.add('timer-text');
  }

  _updateBallDisplay() {
    const app = document.getElementById('app');
    app.classList.remove('phase-running', 'phase-paused', 'phase-selected');
    this._clearCategoryColor();

    switch (this.state) {
      case State.RUNNING:
        app.classList.add('phase-running');
        break;
      case State.PAUSED:
        app.classList.add('phase-paused');
        this.ballLabel.classList.add('timer-text');
        this._updatePausedDisplay();
        break;
      case State.SELECTED:
        app.classList.add('phase-selected');
        this.ballLabel.classList.remove('timer-text');
        this._updateSelectedLabel();
        {
          const cat = this.categories.find((c) => c.id === this.selectedCategoryId);
          if (cat) this._applyCategoryColor(cat.color);
        }
        break;
      default:
        this.ballLabel.classList.remove('timer-text');
        this.ballLabel.textContent = '';
        break;
    }
  }

  async _updateSelectedLabel() {
    try {
      const label = await api.getSelection();
      if (label) {
        this.ballLabel.textContent = label;
      }
    } catch (err) { /* ignore */ }
  }

  _shadeColor(hex, index, total) {
    const t = total <= 1 ? 0 : index / (total - 1);
    const factor = 0.22 * (1 - 2 * t);
    return this._adjustLightness(hex, factor);
  }

  _adjustLightness(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const hsl = this._rgbToHsl(r, g, b);
    hsl[2] = Math.min(1, Math.max(0, hsl[2] + factor));

    const [nr, ng, nb] = this._hslToRgb(hsl[0], hsl[1], hsl[2]);
    return '#' + [nr, ng, nb].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  _rgbToHsl(r, g, b) {
    const nr = r / 255, ng = g / 255, nb = b / 255;
    const max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === nr) h = ((ng - nb) / d + (ng < nb ? 6 : 0)) / 6;
      else if (max === ng) h = ((nb - nr) / d + 2) / 6;
      else h = ((nr - ng) / d + 4) / 6;
    }
    return [h, s, l];
  }

  _hslToRgb(h, s, l) {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      hue2rgb(p, q, h + 1 / 3) * 255,
      hue2rgb(p, q, h) * 255,
      hue2rgb(p, q, h - 1 / 3) * 255,
    ];
  }

  _applyCategoryColor(hex) {
    const darkHex = this._adjustLightness(hex, -0.18);
    const face = document.getElementById('ball-face');
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    face.style.background = `linear-gradient(135deg, ${hex} 0%, ${darkHex} 100%)`;
    face.style.boxShadow = `0 4px 20px rgba(${r},${g},${b},0.4), 0 2px 8px rgba(0,0,0,0.15), inset 0 2px 4px rgba(255,255,255,0.2)`;
  }

  _clearCategoryColor() {
    const face = document.getElementById('ball-face');
    face.style.background = '';
    face.style.boxShadow = '';
  }

}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
