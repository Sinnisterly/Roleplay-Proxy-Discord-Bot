import { getDb } from '../index.js';
import { currentGuildId } from '../context.js';

export function getUserStatus(userId) {
  return getDb().prepare('SELECT * FROM user_status WHERE guild_id = ? AND user_id = ?')
    .get(currentGuildId(), userId) ?? null;
}

export function isUserBlocked(userId) {
  const row = getUserStatus(userId);
  return row?.is_blocked === 1;
}

export function isUserTimedOut(userId) {
  const row = getUserStatus(userId);
  if (!row?.timeout_until) return false;
  if (row.timeout_until <= Date.now()) {
    // Auto-expire
    getDb().prepare('UPDATE user_status SET timeout_until = NULL WHERE guild_id = ? AND user_id = ?')
      .run(currentGuildId(), userId);
    return false;
  }
  return true;
}

export function blockUser(userId, moderatorId) {
  getDb().prepare(`
    INSERT INTO user_status (guild_id, user_id, is_blocked, updated_by, updated_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET is_blocked = 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(currentGuildId(), userId, moderatorId, Date.now());
}

export function unblockUser(userId, moderatorId) {
  getDb().prepare(`
    INSERT INTO user_status (guild_id, user_id, is_blocked, updated_by, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET is_blocked = 0, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(currentGuildId(), userId, moderatorId, Date.now());
}

export function timeoutUser(userId, moderatorId, expiresAt) {
  getDb().prepare(`
    INSERT INTO user_status (guild_id, user_id, timeout_until, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET timeout_until = excluded.timeout_until, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(currentGuildId(), userId, expiresAt, moderatorId, Date.now());
}

export function untimeoutUser(userId, moderatorId) {
  getDb().prepare(`
    INSERT INTO user_status (guild_id, user_id, timeout_until, updated_by, updated_at)
    VALUES (?, ?, NULL, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET timeout_until = NULL, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(currentGuildId(), userId, moderatorId, Date.now());
}

export function logModAction(data) {
  return getDb().prepare(`
    INSERT INTO mod_log
      (guild_id, target_user_id, moderator_id, action, reason, duration_ms, expires_at, character_id, extra_data, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    currentGuildId(), data.target_user_id, data.moderator_id, data.action, data.reason,
    data.duration_ms ?? null, data.expires_at ?? null, data.character_id ?? null,
    data.extra_data ? JSON.stringify(data.extra_data) : null, Date.now()
  );
}

export function getModHistory(userId, limit = 20) {
  return getDb().prepare(`
    SELECT * FROM mod_log WHERE guild_id = ? AND target_user_id = ? ORDER BY timestamp DESC LIMIT ?
  `).all(currentGuildId(), userId, limit);
}
