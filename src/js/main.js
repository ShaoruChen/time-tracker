import { api } from './api.js';
import { FanMenu } from './fan-menu.js';

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

    this.fanMenu.onSectorClick = (id, isBack) => this._onSectorClick(id, isBack);

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

    this.ball.addEventListener('click', (e) => {
      e.stopPropagation();
      this._onBallClick();
    });
  }

  _onBallHover() {
    if (this.state === State.RUNNING || this.state === State.PAUSED) {
      this._showTimerMenu();
    } else if (this.state !== State.TIMER_MENU) {
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
    if (this.state === State.MENU_LEVEL_1 || this.state === State.MENU_LEVEL_2) {
      this.fanMenu.hide();
      this.state = this.selectedCategoryId ? State.SELECTED : State.IDLE;
    } else if (this.state === State.TIMER_MENU) {
      this.fanMenu.hide();
      this.state = this._wasPausedBeforeMenu ? State.PAUSED : State.RUNNING;
    }
    this._updateBallDisplay();
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
    items.push({
      id: '__dashboard__',
      name: 'Dashboard',
      color: '#888',
    });
    this.fanMenu.show(items, { selectedId: this.selectedCategoryId });

    if (this.selectedCategoryId && !this.selectedTaskId) {
      this.fanMenu.highlightSelected(this.selectedCategoryId);
    }
  }

  _showLevel2Menu(category) {
    this.state = State.MENU_LEVEL_2;
    this.currentCategory = category;

    const items = (category.children || []).map((t) => ({
      id: t.id,
      name: t.name,
      color: category.color,
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
      if (id === '__dashboard__') {
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
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
