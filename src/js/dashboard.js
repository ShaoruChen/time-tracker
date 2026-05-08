import { api } from './api.js';
import { normalizeSessionId, removeSessionById } from './dashboard-row-actions.js';
import Chart from 'chart.js/auto';

let dailyChart = null;
let categoryChart = null;
let _allSessions = [];
let _sessionPage = 0;
const PAGE_SIZE = 20;
let _editingSessionId = null;
let _skipNextDocumentClick = false;
let _confirmDialogEl = null;

function formatMs(ms) {
  const totalMin = ms / 60000;
  if (totalMin < 60) return `${Math.round(totalMin)}m`;
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatMsDecimal(ms) {
  return (ms / 3600000).toFixed(1);
}

function formatDurationInput(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function parseDurationInput(str) {
  const s = str.trim();
  const fullMatch = s.match(/^(\d+)\s*h\s*(\d+)\s*m?$/i);
  if (fullMatch) return parseInt(fullMatch[1]) * 3600000 + parseInt(fullMatch[2]) * 60000;
  const hMatch = s.match(/^(\d+)\s*h$/i);
  if (hMatch) return parseInt(hMatch[1]) * 3600000;
  const mMatch = s.match(/^(\d+)\s*m$/i);
  if (mMatch) return parseInt(mMatch[1]) * 60000;
  return null;
}

function getDateRange() {
  const from = document.getElementById('date-from').value;
  const to = document.getElementById('date-to').value;
  return { from, to };
}

function setDefaultDates() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  document.getElementById('date-from').value = monthStart.toISOString().slice(0, 10);
  document.getElementById('date-to').value = now.toISOString().slice(0, 10);
}

async function loadSummary() {
  const { from, to } = getDateRange();
  const today = new Date().toISOString().slice(0, 10);

  // Week range
  const now = new Date();
  const weekStart = new Date(now.getTime() - now.getDay() * 86400000);

  try {
    const [dailyData, stackedData, catData] = await Promise.all([
      api.getDailySummary(from, to),
      api.getDailyStacked(from, to),
      api.getCategorySummary(from, to),
    ]);

    // Calculate summaries
    const todayTotal = (dailyData || [])
      .filter((d) => d.date === today)
      .reduce((sum, d) => sum + d.total_ms, 0);
    const weekTotal = (dailyData || [])
      .filter((d) => d.date >= weekStart.toISOString().slice(0, 10))
      .reduce((sum, d) => sum + d.total_ms, 0);
    const monthTotal = (dailyData || []).reduce((sum, d) => sum + d.total_ms, 0);

    document.getElementById('card-today').querySelector('.card-value').textContent = formatMs(todayTotal);
    document.getElementById('card-week').querySelector('.card-value').textContent = formatMs(weekTotal);
    document.getElementById('card-month').querySelector('.card-value').textContent = formatMs(monthTotal);

    // Daily stacked chart
    renderDailyChart(stackedData || []);
    // Category chart
    renderCategoryChart(catData || []);
  } catch (err) {
    console.error('Failed to load summary:', err);
  }
}

function renderDailyChart(data) {
  const ctx = document.getElementById('chart-daily').getContext('2d');
  if (dailyChart) dailyChart.destroy();

  if (!data || data.length === 0) return;

  // Unique sorted dates
  const dateSet = new Set(data.map((d) => d.date));
  const sortedDates = [...dateSet].sort();

  // Unique categories with total accumulation for sort order
  const catMap = new Map();
  for (const d of data) {
    if (!catMap.has(d.category_id)) {
      catMap.set(d.category_id, { id: d.category_id, name: d.category_name, total: 0 });
    }
  }

  // Build lookup: date -> category_id -> hours
  const lookup = {};
  for (const d of data) {
    if (!lookup[d.date]) lookup[d.date] = {};
    const hours = parseFloat(formatMsDecimal(d.total_ms));
    lookup[d.date][d.category_id] = hours;
    catMap.get(d.category_id).total += d.total_ms;
  }

  // Sort categories by total duration descending (largest at bottom)
  const catOrder = [...catMap.values()].sort((a, b) => b.total - a.total);

  const colors = THEMES[currentTheme] || THEMES['verdant'];
  const labels = sortedDates.map((d) => d.slice(5)); // MM-DD

  const datasets = catOrder.map((cat, i) => ({
    label: cat.name,
    data: sortedDates.map((date) => lookup[date]?.[cat.id] || 0),
    backgroundColor: colors[i % colors.length],
    borderRadius: i === catOrder.length - 1 ? { topLeft: 3, topRight: 3 } : 0,
    barPercentage: 0.8,
  }));

  dailyChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, padding: 16, usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw}h`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { font: { size: 10 } },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: '小时' },
          ticks: { font: { size: 11 } },
        },
      },
    },
  });
}

function renderCategoryChart(data) {
  const ctx = document.getElementById('chart-category').getContext('2d');
  if (categoryChart) categoryChart.destroy();

  const labels = data.map((d) => d.category_name);
  const values = data.map((d) => d.total_ms);
  const colors = THEMES[currentTheme] || THEMES['verdant'];

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, data.length),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, padding: 16 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${formatMs(ctx.raw)} (${ctx.parsed.toFixed(1)}%)`,
          },
        },
      },
    },
  });
}

async function loadSessions() {
  const { from, to } = getDateRange();
  try {
    const sessions = await api.getSessions(from, to);
    _allSessions = sessions || [];
    _sessionPage = 0;
    renderSessionsPage();
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
}

function renderSessionsPage() {
  const tbody = document.getElementById('sessions-tbody');
  const empty = document.getElementById('empty-state');
  const pagination = document.getElementById('pagination');

  const totalPages = Math.ceil((_allSessions || []).length / PAGE_SIZE);
  if (totalPages > 0 && _sessionPage >= totalPages) {
    _sessionPage = totalPages - 1;
  }

  if (!_allSessions || _allSessions.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    pagination.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  const start = _sessionPage * PAGE_SIZE;
  const page = _allSessions.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = page.map((s) => {
    const startTime = s.start_time ? new Date(s.start_time) : null;
    const endTime = s.end_time ? new Date(s.end_time) : null;
    const timeStr = (d) => d ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-';
    const dateStr = (d) => d ? d.toLocaleDateString('zh-CN') : '-';

    return `
      <tr data-session-id="${s.id}">
        <td>${dateStr(startTime)}</td>
        <td>${s.category_name || '-'}</td>
        <td>${s.task_name || '-'}</td>
        <td>${timeStr(startTime)}</td>
        <td>${timeStr(endTime)}</td>
        <td class="duration-cell" data-duration-ms="${s.duration_ms}">${formatMs(s.duration_ms)}</td>
        <td class="actions-cell">
          <span class="row-dots" data-session-id="${s.id}">⋯</span>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('page-info').textContent =
    `${_sessionPage + 1} / ${totalPages}`;
  document.getElementById('btn-prev-page').disabled = _sessionPage <= 0;
  document.getElementById('btn-next-page').disabled = _sessionPage >= totalPages - 1;
  pagination.style.display = totalPages <= 1 ? 'none' : 'flex';
}

async function refreshAll() {
  await Promise.all([loadSummary(), loadSessions()]);
}

// Config editor
function toggleConfigEditor() {
  const editor = document.getElementById('config-editor');
  const show = editor.style.display === 'none';
  editor.style.display = show ? 'block' : 'none';
  if (show) {
    loadConfigToEditor();
  }
}

let _editorConfig = null;

// Theme palettes — refined, elegant, lower saturation
const THEMES = {
  verdant:    ['#8EAE9A', '#A8BD98', '#C8B098', '#96B0A2', '#B2C2A8', '#A0A8C0'],
  rosegold:   ['#C2887C', '#D4A472', '#B898A0', '#A8B098', '#C8A8B8', '#E0C098'],
  mist:       ['#80A4B4', '#BC9E8C', '#94B0C0', '#C8B8A4', '#A0BCC8', '#B8C8D4'],
  twilight:   ['#AC8CA4', '#C8B294', '#A294AC', '#D0C0B8', '#A89CC0', '#C2A6BA'],
};
let currentTheme = 'verdant';

function _themeColor(index) {
  const colors = THEMES[currentTheme];
  return colors[index % colors.length];
}

function _genId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8);
}

async function initTheme() {
  try {
    const config = await api.getCategories();
    if (config) {
      const firstColor = config.categories?.[0]?.color;
      if (firstColor) {
        for (const [key, colors] of Object.entries(THEMES)) {
          if (colors.includes(firstColor)) {
            currentTheme = key;
            break;
          }
        }
      }
    }
    _updateThemeChips();
  } catch (err) {
    console.error('Failed to init theme:', err);
  }
}

async function loadConfigToEditor() {
  try {
    _editorConfig = await api.getCategories();
    if (_editorConfig) {
      renderCategoryEditor(_editorConfig);
    }
    _updateThemeChips();
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

function _updateThemeChips() {
  document.querySelectorAll('.theme-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.theme === currentTheme);
  });
}

function _applyThemeColors() {
  const cards = document.querySelectorAll('.category-card');
  cards.forEach((card, i) => {
    const color = _themeColor(i);
    const colorInput = card.querySelector('.cat-color');
    if (colorInput) colorInput.value = color;
    card.style.borderLeftColor = color;
  });
}

function renderCategoryEditor(config) {
  const container = document.getElementById('category-editor');
  container.innerHTML = '';

  (config.categories || []).forEach((cat, i) => {
    container.appendChild(_createCategoryCard(cat, i));
  });
}

function _createCategoryCard(cat, index) {
  const card = document.createElement('div');
  card.className = 'category-card';
  card.style.borderLeftColor = cat.color || '#667eea';
  card.dataset.catIndex = index;
  card.dataset.catId = cat.id || _genId('cat');

  card.innerHTML = `
    <div class="category-header">
      <label>名称</label>
      <input type="text" class="cat-name" value="${_esc(cat.name)}" data-cat-index="${index}" />
      <span class="color-picker-wrap">
        <label>颜色</label>
        <input type="color" class="cat-color" value="${cat.color}" data-cat-index="${index}" />
      </span>
    </div>
    <div class="category-tasks" data-cat-index="${index}"></div>
    <div class="category-actions">
      <button class="btn-add-task" data-cat-index="${index}">+ 添加任务</button>
      <button class="btn-delete-cat" data-cat-index="${index}">删除分类</button>
    </div>
  `;

  const tasksContainer = card.querySelector('.category-tasks');
  (cat.children || []).forEach((task, ti) => {
    tasksContainer.appendChild(_createTaskRow(task.name, task.id, index, ti));
  });

  return card;
}

function _createTaskRow(name, taskId, catIndex, taskIndex) {
  const row = document.createElement('div');
  row.className = 'task-row';
  row.dataset.catIndex = catIndex;
  row.dataset.taskIndex = taskIndex;
  row.dataset.taskId = taskId || _genId('task');
  row.innerHTML = `
    <span class="task-index">${taskIndex + 1}.</span>
    <input type="text" class="task-name" value="${_esc(name)}" data-cat-index="${catIndex}" data-task-index="${taskIndex}" />
    <button class="btn-delete" data-cat-index="${catIndex}" data-task-index="${taskIndex}" title="删除任务">&times;</button>
  `;
  return row;
}

function _esc(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Event delegation for add/delete actions
document.addEventListener('click', (e) => {
  const btnAddTask = e.target.closest('.btn-add-task');
  const btnDeleteCat = e.target.closest('.btn-delete-cat');
  const btnDelete = e.target.closest('.btn-delete');

  if (btnAddTask) {
    const ci = parseInt(btnAddTask.dataset.catIndex);
    const tasksContainer = document.querySelector(`.category-tasks[data-cat-index="${ci}"]`);
    const existingRows = tasksContainer.querySelectorAll('.task-row');
    const row = _createTaskRow('', null, ci, existingRows.length);
    tasksContainer.appendChild(row);
    row.querySelector('.task-name').focus();
    // Shift+Enter on task input adds the next task row
    const input = row.querySelector('.task-name');
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        const allRows = tasksContainer.querySelectorAll('.task-row');
        const row2 = _createTaskRow('', null, ci, allRows.length);
        tasksContainer.appendChild(row2);
        row2.querySelector('.task-name').focus();
      }
    });
  }

  if (btnDeleteCat) {
    const ci = parseInt(btnDeleteCat.dataset.catIndex);
    const card = document.querySelector(`.category-card[data-cat-index="${ci}"]`);
    if (card) card.remove();
    // Re-index remaining cards
    _reindexCategories();
  }

  if (btnDelete) {
    const ci = parseInt(btnDelete.dataset.catIndex);
    const ti = parseInt(btnDelete.dataset.taskIndex);
    const tasksContainer = document.querySelector(`.category-tasks[data-cat-index="${ci}"]`);
    const row = tasksContainer.querySelector(`.task-row[data-task-index="${ti}"]`);
    if (row) row.remove();
    // Re-index task rows
    _reindexTasks(ci);
  }
});

// --- Row action menu ---
let _rowMenuEl = null;

function _buildRowMenu() {
  if (_rowMenuEl) return;

  const menu = document.createElement('div');
  menu.id = 'row-menu';
  menu.className = 'row-menu';
  menu.style.display = 'none';

  const editBtn = document.createElement('button');
  editBtn.className = 'row-menu-item';
  editBtn.dataset.action = 'edit';
  editBtn.textContent = '修改';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'row-menu-item row-menu-item-danger';
  deleteBtn.dataset.action = 'delete';
  deleteBtn.textContent = '删除';

  const handleMenuAction = (e) => {
    const item = e.target.closest('.row-menu-item');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const action = item.dataset.action;
    const id = item.dataset.sessionId || _rowMenuEl?.dataset.sessionId;
    hideRowMenu();
    _skipNextDocumentClick = true;
    if (action === 'delete') _rowActionDelete(id);
    else if (action === 'edit') _rowActionEdit(id);
  };

  menu.addEventListener('pointerup', handleMenuAction);
  menu.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  menu.appendChild(editBtn);
  menu.appendChild(deleteBtn);
  document.body.appendChild(menu);
  _rowMenuEl = menu;
}

function hideRowMenu() {
  if (_rowMenuEl) _rowMenuEl.style.display = 'none';
}

function confirmAction(message) {
  return new Promise((resolve) => {
    if (_confirmDialogEl) _confirmDialogEl.remove();

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog" role="dialog" aria-modal="true">
        <p>${_esc(message)}</p>
        <div class="confirm-actions">
          <button class="confirm-cancel" type="button">取消</button>
          <button class="confirm-delete" type="button">删除</button>
        </div>
      </div>
    `;

    const cleanup = (result) => {
      overlay.remove();
      if (_confirmDialogEl === overlay) _confirmDialogEl = null;
      resolve(result);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.confirm-cancel')) {
        cleanup(false);
      } else if (e.target.closest('.confirm-delete')) {
        cleanup(true);
      }
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    });

    document.body.appendChild(overlay);
    _confirmDialogEl = overlay;
    overlay.querySelector('.confirm-delete').focus();
  });
}

function showRowMenu(dotsBtn, sessionId) {
  if (!_rowMenuEl) return;
  const normalizedId = normalizeSessionId(sessionId);
  if (!normalizedId) return;
  _rowMenuEl.dataset.sessionId = normalizedId;
  _rowMenuEl.querySelectorAll('.row-menu-item').forEach((item) => {
    item.dataset.sessionId = normalizedId;
  });
  const rect = dotsBtn.getBoundingClientRect();
  _rowMenuEl.style.position = 'fixed';
  _rowMenuEl.style.top = `${rect.bottom + 4}px`;
  _rowMenuEl.style.left = '0px';
  _rowMenuEl.style.display = 'block';
  // measure after display to get real width, then adjust position
  let left = rect.right - _rowMenuEl.offsetWidth;
  if (left < 8) left = 8;
  _rowMenuEl.style.left = `${left}px`;
}

// Document-level delegation for showing menu and dismissing
document.addEventListener('click', (e) => {
  if (_skipNextDocumentClick) {
    _skipNextDocumentClick = false;
    return;
  }

  const dotsBtn = e.target.closest('.row-dots');
  if (dotsBtn) {
    e.stopPropagation();
    showRowMenu(dotsBtn, dotsBtn.dataset.sessionId);
    return;
  }

  // Click outside menu -> dismiss
  if (_rowMenuEl && _rowMenuEl.style.display === 'block' && !e.target.closest('#row-menu')) {
    hideRowMenu();
  }

  // Click outside edit input -> cancel edit
  if (_editingSessionId && !e.target.closest('.duration-edit-input')) {
    cancelEditDuration();
  }
});

function removeSessionFromUi(id) {
  const normalizedId = normalizeSessionId(id);
  if (!normalizedId) return;
  _allSessions = removeSessionById(_allSessions, normalizedId);
  document.querySelector(`tr[data-session-id="${CSS.escape(normalizedId)}"]`)?.remove();
  renderSessionsPage();
}

async function _rowActionDelete(id) {
  const normalizedId = normalizeSessionId(id);
  if (!normalizedId) return;
  if (!(await confirmAction('确认删除该记录？此操作不可撤销。'))) return;

  const previousSessions = [..._allSessions];
  const previousPage = _sessionPage;
  removeSessionFromUi(normalizedId);

  try {
    await api.deleteSession(normalizedId);
    await refreshAll();
  } catch (err) {
    _allSessions = previousSessions;
    _sessionPage = previousPage;
    renderSessionsPage();
    console.error('Failed to delete session:', err);
    alert('删除失败: ' + (typeof err === 'string' ? err : err.message || '未知错误'));
  }
}

function _rowActionEdit(id) {
  const normalizedId = normalizeSessionId(id);
  if (!normalizedId) return;
  const row = document.querySelector(`tr[data-session-id="${CSS.escape(normalizedId)}"]`);
  if (!row) return;
  const cell = row.querySelector('.duration-cell');
  if (!cell) return;
  const currentMs = parseInt(cell.dataset.durationMs) || 0;
  const currentText = formatDurationInput(currentMs);
  _editingSessionId = normalizedId;
  cell.innerHTML = `<input type="text" class="duration-edit-input" value="${_esc(currentText)}" />`;
  const input = cell.querySelector('.duration-edit-input');
  input.focus();
  input.select();
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      saveEditDuration(normalizedId, input.value);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      cancelEditDuration();
    }
  });
}

async function saveEditDuration(id, rawValue) {
  const ms = parseDurationInput(rawValue);
  if (ms === null || ms < 0) {
    alert('格式错误，请输入如 "2h 30m" 或 "1h" 或 "45m" 的格式');
    return;
  }
  try {
    await api.updateSessionDuration(id, ms);
    _editingSessionId = null;
    await refreshAll();
  } catch (err) {
    console.error('Failed to update session duration:', err);
    alert('更新失败: ' + (typeof err === 'string' ? err : err.message || '未知错误'));
  }
}

function cancelEditDuration() {
  if (!_editingSessionId) return;
  _editingSessionId = null;
  renderSessionsPage();
}

// Re-index category cards after deletion
function _reindexCategories() {
  const cards = document.querySelectorAll('.category-card');
  cards.forEach((card, i) => {
    card.dataset.catIndex = i;
    card.querySelectorAll('.cat-name, .cat-color, .btn-add-task, .btn-delete-cat, .category-tasks').forEach((el) => {
      el.dataset.catIndex = i;
    });
  });
}

// Re-index task rows after deletion
function _reindexTasks(catIndex) {
  const tasksContainer = document.querySelector(`.category-tasks[data-cat-index="${catIndex}"]`);
  if (!tasksContainer) return;
  const rows = tasksContainer.querySelectorAll('.task-row');
  rows.forEach((row, i) => {
    row.dataset.taskIndex = i;
    const numSpan = row.querySelector('.task-index');
    if (numSpan) numSpan.textContent = (i + 1) + '.';
    row.querySelectorAll('.task-name, .btn-delete').forEach((el) => {
      el.dataset.taskIndex = i;
    });
  });
}

function collectConfig() {
  const cards = document.querySelectorAll('.category-card');
  const categories = [];

  cards.forEach((card) => {
    const nameInput = card.querySelector('.cat-name');
    const colorInput = card.querySelector('.cat-color');
    const name = (nameInput?.value || '').trim();
    const color = colorInput?.value || '#667eea';
    if (!name) return;

    const catId = card.dataset.catId || _genId('cat');
    const tasks = [];
    const taskRows = card.querySelectorAll('.task-row');
    taskRows.forEach((row) => {
      const tNameInput = row.querySelector('.task-name');
      const tName = (tNameInput?.value || '').trim();
      if (!tName) return;

      const taskId = row.dataset.taskId || _genId('task');
      tasks.push({ id: taskId, name: tName });
    });

    categories.push({ id: catId, name, color, children: tasks });
  });

  return { version: 1, categories };
}

async function saveConfig() {
  const errorDiv = document.getElementById('config-error');
  errorDiv.textContent = '';

  try {
    const config = collectConfig();
    // Validation: ensure no empty names
    if (config.categories.length === 0) {
      errorDiv.textContent = '至少需要一个分类';
      return;
    }
    for (const cat of config.categories) {
      if (!cat.name) {
        errorDiv.textContent = '分类名称不能为空';
        return;
      }
    }
    await api.saveCategories(config);
    document.getElementById('config-editor').style.display = 'none';
    await refreshAll();
  } catch (err) {
    errorDiv.textContent = typeof err === 'string' ? err : (err.message || '保存失败');
  }
}

async function exportCsv() {
  const { from, to } = getDateRange();
  try {
    const csv = await api.exportCsv(from, to);
    if (csv) {
      // Create download
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `time-tracker-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error('Failed to export:', err);
  }
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();
  _buildRowMenu();
  initTheme();

  document.getElementById('btn-refresh').addEventListener('click', refreshAll);
  document.getElementById('btn-edit-config').addEventListener('click', toggleConfigEditor);
  document.getElementById('btn-cancel-config').addEventListener('click', () => {
    document.getElementById('config-editor').style.display = 'none';
    document.getElementById('config-error').textContent = '';
  });
  document.getElementById('btn-save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-export').addEventListener('click', exportCsv);

  // Add new category
  document.getElementById('btn-add-category').addEventListener('click', () => {
    const container = document.getElementById('category-editor');
    const existing = container.querySelectorAll('.category-card');
    const card = _createCategoryCard(
      { id: _genId('cat'), name: '', color: _themeColor(existing.length), children: [] },
      existing.length
    );
    container.appendChild(card);
    card.querySelector('.cat-name').focus();
  });

  // Theme switcher — auto-saves to backend
  document.getElementById('theme-options').addEventListener('click', async (e) => {
    const chip = e.target.closest('.theme-chip');
    if (!chip) return;
    currentTheme = chip.dataset.theme;
    _updateThemeChips();
    _applyThemeColors();

    // Auto-save theme change to backend
    try {
      const config = _editorConfig || await api.getCategories();
      if (config && config.categories) {
        config.categories.forEach((cat, i) => {
          cat.color = _themeColor(i);
        });
        await api.saveCategories(config);
        _editorConfig = config;
      }
    } catch (err) { /* ignore */ }

    await refreshAll();
  });

  // Real-time color preview: update card border on color change
  document.getElementById('category-editor').addEventListener('input', (e) => {
    if (e.target.classList.contains('cat-color')) {
      const card = e.target.closest('.category-card');
      if (card) card.style.borderLeftColor = e.target.value;
    }
  });

  // Pagination
  document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (_sessionPage > 0) {
      _sessionPage--;
      renderSessionsPage();
    }
  });
  document.getElementById('btn-next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(_allSessions.length / PAGE_SIZE);
    if (_sessionPage < totalPages - 1) {
      _sessionPage++;
      renderSessionsPage();
    }
  });

  refreshAll();
});
