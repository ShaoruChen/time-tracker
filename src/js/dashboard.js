import { api } from './api.js';
import Chart from 'chart.js/auto';

let dailyChart = null;
let categoryChart = null;

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
    const [dailyData, catData] = await Promise.all([
      api.getDailySummary(from, to),
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

    // Daily chart
    renderDailyChart(dailyData || []);
    // Category chart
    renderCategoryChart(catData || []);
  } catch (err) {
    console.error('Failed to load summary:', err);
  }
}

function renderDailyChart(data) {
  const ctx = document.getElementById('chart-daily').getContext('2d');
  if (dailyChart) dailyChart.destroy();

  const labels = data.map((d) => d.date.slice(5)); // MM-DD
  const values = data.map((d) => parseFloat(formatMsDecimal(d.total_ms)));

  dailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '小时',
        data: values,
        backgroundColor: '#667eea',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: '小时' },
          ticks: { font: { size: 11 } },
        },
        x: {
          ticks: { font: { size: 10 } },
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
  const colors = ['#667eea', '#f5576c', '#45B7D1', '#4ECDC4', '#ffd89b', '#a8e063'];

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
    const tbody = document.getElementById('sessions-tbody');
    const empty = document.getElementById('empty-state');

    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = sessions.map((s) => {
      const startTime = s.start_time ? new Date(s.start_time) : null;
      const endTime = s.end_time ? new Date(s.end_time) : null;
      const timeStr = (d) => d ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-';
      const dateStr = (d) => d ? d.toLocaleDateString('zh-CN') : '-';

      return `
        <tr>
          <td>${dateStr(startTime)}</td>
          <td>${s.category_name || '-'}</td>
          <td>${s.task_name || '-'}</td>
          <td>${timeStr(startTime)}</td>
          <td>${timeStr(endTime)}</td>
          <td>${formatMs(s.duration_ms)}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
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

function _genId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8);
}

async function loadConfigToEditor() {
  try {
    _editorConfig = await api.getCategories();
    if (_editorConfig) {
      renderCategoryEditor(_editorConfig);
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
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
      { id: _genId('cat'), name: '', color: '#667eea', children: [] },
      existing.length
    );
    container.appendChild(card);
    card.querySelector('.cat-name').focus();
  });

  // Real-time color preview: update card border on color change
  document.getElementById('category-editor').addEventListener('input', (e) => {
    if (e.target.classList.contains('cat-color')) {
      const card = e.target.closest('.category-card');
      if (card) card.style.borderLeftColor = e.target.value;
    }
  });

  refreshAll();
});
