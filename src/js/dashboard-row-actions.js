export function normalizeSessionId(id) {
  if (id === null || id === undefined) return null;
  const normalized = String(id);
  return normalized.length > 0 ? normalized : null;
}

export function removeSessionById(sessions, id) {
  const normalizedId = normalizeSessionId(id);
  if (!normalizedId) return sessions || [];
  return (sessions || []).filter((session) => String(session.id) !== normalizedId);
}
