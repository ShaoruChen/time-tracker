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

async function loadConfigToEditor() {
  try {
    const config = await api.getCategories();
    if (config) {
      document.getElementById('config-textarea').value = JSON.stringify(config, null, 2);
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

async function saveConfig() {
  const textarea = document.getElementById('config-textarea');
  const errorDiv = document.getElementById('config-error');
  errorDiv.textContent = '';

  try {
    const config = await api.validateCategoriesJson(textarea.value);
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

  refreshAll();
});
