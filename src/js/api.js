const { invoke } = window.__TAURI__?.core ?? {};

async function safeInvoke(cmd, args = {}) {
  if (!invoke) {
    console.warn('Tauri invoke not available, running in browser mode');
    return null;
  }
  try {
    return await invoke(cmd, args);
  } catch (err) {
    console.error(`Command ${cmd} failed:`, err);
    throw err;
  }
}

export const api = {
  // Categories
  getCategories: () => safeInvoke('get_categories'),
  saveCategories: (config) => safeInvoke('save_categories', { config }),
  validateCategoriesJson: (json) => safeInvoke('validate_categories_json', { json }),

  // Selection
  selectTask: (categoryId, taskId) =>
    safeInvoke('select_task', { categoryId, taskId: taskId ?? null }),
  clearSelection: () => safeInvoke('clear_selection'),
  getSelection: () => safeInvoke('get_selection'),

  // Timer
  startTimer: () => safeInvoke('start_timer'),
  pauseTimer: () => safeInvoke('pause_timer'),
  resumeTimer: () => safeInvoke('resume_timer'),
  endTimer: () => safeInvoke('end_timer'),
  getElapsed: () => safeInvoke('get_elapsed'),
  getTimerStatus: () => safeInvoke('get_timer_status'),

  // Dashboard
  openDashboard: () => safeInvoke('open_dashboard'),
  getSessions: (dateFrom, dateTo, categoryId) =>
    safeInvoke('get_sessions', { dateFrom, dateTo, categoryId: categoryId ?? null }),
  getDailySummary: (dateFrom, dateTo) =>
    safeInvoke('get_daily_summary', { dateFrom, dateTo }),
  getCategorySummary: (dateFrom, dateTo) =>
    safeInvoke('get_category_summary', { dateFrom, dateTo }),
  exportCsv: (dateFrom, dateTo) =>
    safeInvoke('export_csv', { dateFrom, dateTo }),
};
