import { getDb } from '../index.js';
import { currentGuildId } from '../context.js';

export function createCharacter(data) {
  return getDb().prepare(`
    INSERT INTO characters
      (guild_id, owner_id, name, pronouns, trigger, avatar_url, bio, is_shared, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    currentGuildId(), data.owner_id, data.name, data.pronouns ?? null, data.trigger,
    data.avatar_url ?? null, data.bio ?? null, data.is_shared ? 1 : 0, Date.now()
  );
}

export function getCharacterById(id) {
  return getDb().prepare('SELECT * FROM characters WHERE id = ? AND guild_id = ?')
    .get(id, currentGuildId()) ?? null;
}

export function getCharacterByTrigger(userId, trigger) {
  // Check user's own characters + shared characters they have access to
  return getDb().prepare(`
    SELECT c.* FROM characters c
    WHERE c.guild_id = ? AND LOWER(c.trigger) = LOWER(?)
      AND (
        c.owner_id = ?
        OR (c.is_shared = 1 AND EXISTS (
          SELECT 1 FROM character_access ca
          WHERE ca.character_id = c.id AND ca.grantee_user_id = ?
        ))
      )
    LIMIT 1
  `).get(currentGuildId(), trigger, userId, userId) ?? null;
}

export function getUserCharacters(userId) {
  return getDb().prepare(
    'SELECT * FROM characters WHERE guild_id = ? AND owner_id = ? ORDER BY name'
  ).all(currentGuildId(), userId);
}

export function getSharedCharactersForUser(userId, roleIds = []) {
  const gid = currentGuildId();
  // Characters shared to this specific user or to any of their roles
  if (roleIds.length === 0) {
    return getDb().prepare(`
      SELECT DISTINCT c.* FROM characters c
      JOIN character_access ca ON ca.character_id = c.id
      WHERE c.guild_id = ? AND c.is_shared = 1 AND ca.grantee_user_id = ?
      ORDER BY c.name
    `).all(gid, userId);
  }
  const placeholders = roleIds.map(() => '?').join(',');
  return getDb().prepare(`
    SELECT DISTINCT c.* FROM characters c
    JOIN character_access ca ON ca.character_id = c.id
    WHERE c.guild_id = ? AND c.is_shared = 1
      AND (ca.grantee_user_id = ? OR ca.grantee_role_id IN (${placeholders}))
    ORDER BY c.name
  `).all(gid, userId, ...roleIds);
}

export function getDefaultCharacter(userId) {
  return getDb().prepare(
    'SELECT * FROM characters WHERE guild_id = ? AND owner_id = ? AND is_default = 1 LIMIT 1'
  ).get(currentGuildId(), userId) ?? null;
}

export function setDefaultCharacter(userId, characterId) {
  const gid = currentGuildId();
  const db = getDb();
  db.prepare('UPDATE characters SET is_default = 0 WHERE guild_id = ? AND owner_id = ?').run(gid, userId);
  db.prepare('UPDATE characters SET is_default = 1 WHERE id = ? AND guild_id = ? AND owner_id = ?').run(characterId, gid, userId);
}

export function clearDefaultCharacter(userId) {
  getDb().prepare('UPDATE characters SET is_default = 0 WHERE guild_id = ? AND owner_id = ?')
    .run(currentGuildId(), userId);
}

export function updateCharacter(id, data) {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  getDb().prepare(`UPDATE characters SET ${fields} WHERE id = ? AND guild_id = ?`)
    .run(...values, id, currentGuildId());
}

export function deleteCharacter(id) {
  getDb().prepare('DELETE FROM characters WHERE id = ? AND guild_id = ?').run(id, currentGuildId());
}

export function incrementMessageCount(id) {
  const now = Date.now();
  getDb().prepare(`
    UPDATE characters
    SET message_count = message_count + 1,
        last_used_at  = ?,
        first_used_at = COALESCE(first_used_at, ?)
    WHERE id = ? AND guild_id = ?
  `).run(now, now, id, currentGuildId());
}

export function setMood(characterId, mood, expiresAt) {
  getDb().prepare(
    'UPDATE characters SET current_mood = ?, mood_expires_at = ? WHERE id = ? AND guild_id = ?'
  ).run(mood ?? null, expiresAt ?? null, characterId, currentGuildId());
}

export function clearExpiredMoods() {
  getDb().prepare(
    'UPDATE characters SET current_mood = NULL, mood_expires_at = NULL WHERE guild_id = ? AND mood_expires_at IS NOT NULL AND mood_expires_at <= ?'
  ).run(currentGuildId(), Date.now());
}

// Shared character access
export function grantAccess(characterId, granteeUserId, granteeRoleId, grantedBy) {
  getDb().prepare(`
    INSERT OR IGNORE INTO character_access (guild_id, character_id, grantee_user_id, grantee_role_id, granted_by, granted_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(currentGuildId(), characterId, granteeUserId ?? null, granteeRoleId ?? null, grantedBy, Date.now());
}

export function revokeAccess(characterId, granteeUserId, granteeRoleId) {
  getDb().prepare(`
    DELETE FROM character_access
    WHERE character_id = ?
      AND (grantee_user_id = ? OR grantee_role_id = ?)
  `).run(characterId, granteeUserId ?? null, granteeRoleId ?? null);
}

export function getSharedCharacters() {
  return getDb().prepare('SELECT * FROM characters WHERE guild_id = ? AND is_shared = 1 ORDER BY name')
    .all(currentGuildId());
}

export function getSharedCharacterByName(name) {
  return getDb().prepare(
    'SELECT * FROM characters WHERE guild_id = ? AND is_shared = 1 AND LOWER(name) = LOWER(?)'
  ).get(currentGuildId(), name) ?? null;
}

export function getAccessList(characterId) {
  return getDb().prepare('SELECT * FROM character_access WHERE character_id = ?').all(characterId);
}

// For trigger matching — returns all main triggers + aliases a user can fire
export function getAllTriggersForUser(userId, roleIds = []) {
  const gid = currentGuildId();
  const accessClause = roleIds.length === 0
    ? `c.owner_id = ? OR (c.is_shared = 1 AND EXISTS (
         SELECT 1 FROM character_access ca WHERE ca.character_id = c.id AND ca.grantee_user_id = ?
       ))`
    : `c.owner_id = ? OR (c.is_shared = 1 AND (
         SELECT COUNT(*) FROM character_access ca
         WHERE ca.character_id = c.id
           AND (ca.grantee_user_id = ? OR ca.grantee_role_id IN (${roleIds.map(() => '?').join(',')}))
       ) > 0)`;

  const baseWhere = `c.guild_id = ? AND (${accessClause})`;
  const args = roleIds.length === 0 ? [gid, userId, userId] : [gid, userId, userId, ...roleIds];

  return getDb().prepare(`
    SELECT c.id, c.trigger AS trigger, c.owner_id FROM characters c
    WHERE ${baseWhere}
    UNION
    SELECT c.id, al.trigger AS trigger, c.owner_id FROM characters c
    JOIN character_aliases al ON al.character_id = c.id
    WHERE ${baseWhere}
  `).all(...args, ...args);
}

// ── Aliases ───────────────────────────────────────────────────────────────────

export function getAliasesForCharacter(characterId) {
  return getDb().prepare(
    'SELECT * FROM character_aliases WHERE character_id = ? ORDER BY trigger'
  ).all(characterId);
}

export function addAlias(characterId, trigger) {
  getDb().prepare(
    'INSERT OR IGNORE INTO character_aliases (guild_id, character_id, trigger, created_at) VALUES (?, ?, ?, ?)'
  ).run(currentGuildId(), characterId, trigger, Date.now());
}

export function removeAlias(characterId, trigger) {
  getDb().prepare(
    'DELETE FROM character_aliases WHERE character_id = ? AND LOWER(trigger) = LOWER(?)'
  ).run(characterId, trigger);
}

// ── Channel autopilot ─────────────────────────────────────────────────────────

export function getChannelAutopilot(userId, channelId) {
  const row = getDb().prepare(
    'SELECT character_id FROM channel_autopilot WHERE guild_id = ? AND user_id = ? AND channel_id = ?'
  ).get(currentGuildId(), userId, channelId);
  if (!row) return null;
  return getCharacterById(row.character_id);
}

export function setChannelAutopilot(userId, channelId, characterId) {
  getDb().prepare(
    'INSERT OR REPLACE INTO channel_autopilot (guild_id, user_id, channel_id, character_id) VALUES (?, ?, ?, ?)'
  ).run(currentGuildId(), userId, channelId, characterId);
}

export function clearChannelAutopilot(userId, channelId) {
  getDb().prepare(
    'DELETE FROM channel_autopilot WHERE guild_id = ? AND user_id = ? AND channel_id = ?'
  ).run(currentGuildId(), userId, channelId);
}

export function getChannelAutopilotList(userId) {
  return getDb().prepare(`
    SELECT cp.channel_id, c.name as character_name, c.id as character_id
    FROM channel_autopilot cp
    JOIN characters c ON c.id = cp.character_id
    WHERE cp.guild_id = ? AND cp.user_id = ?
    ORDER BY c.name
  `).all(currentGuildId(), userId);
}

// ── Status & color ────────────────────────────────────────────────────────────

export function setCharacterStatus(id, status) {
  getDb().prepare('UPDATE characters SET status = ? WHERE id = ? AND guild_id = ?')
    .run(status, id, currentGuildId());
}

export function setCharacterColor(id, color) {
  getDb().prepare('UPDATE characters SET color = ? WHERE id = ? AND guild_id = ?')
    .run(color, id, currentGuildId());
}

// ── Relationships ─────────────────────────────────────────────────────────────

export function createRelationshipRequest(requesterCharId, targetCharId, type) {
  return getDb().prepare(`
    INSERT INTO character_relationships (guild_id, requester_char_id, target_char_id, relationship_type, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(currentGuildId(), requesterCharId, targetCharId, type, Date.now());
}

export function getRelationshipById(id) {
  return getDb().prepare('SELECT * FROM character_relationships WHERE id = ? AND guild_id = ?')
    .get(id, currentGuildId()) ?? null;
}

export function getPendingRelationshipsForUser(userId) {
  return getDb().prepare(`
    SELECT r.*,
           rc.name as requester_name, rc.owner_id as requester_owner_id,
           tc.name as target_name, tc.owner_id as target_owner_id
    FROM character_relationships r
    JOIN characters rc ON rc.id = r.requester_char_id
    JOIN characters tc ON tc.id = r.target_char_id
    WHERE r.guild_id = ? AND r.status = 'pending' AND tc.owner_id = ?
    ORDER BY r.created_at DESC
  `).all(currentGuildId(), userId);
}

export function approveRelationship(id) {
  getDb().prepare(
    "UPDATE character_relationships SET status = 'approved', approved_at = ? WHERE id = ? AND guild_id = ?"
  ).run(Date.now(), id, currentGuildId());
}

export function deleteRelationship(id) {
  getDb().prepare('DELETE FROM character_relationships WHERE id = ? AND guild_id = ?')
    .run(id, currentGuildId());
}

export function getApprovedRelationships(characterId) {
  return getDb().prepare(`
    SELECT r.*,
           rc.name as requester_name, rc.status as requester_status,
           tc.name as target_name,    tc.status as target_status
    FROM character_relationships r
    JOIN characters rc ON rc.id = r.requester_char_id
    JOIN characters tc ON tc.id = r.target_char_id
    WHERE (r.requester_char_id = ? OR r.target_char_id = ?)
      AND r.guild_id = ? AND r.status = 'approved'
    ORDER BY r.relationship_type
  `).all(characterId, characterId, currentGuildId());
}

export function hasPendingRelationships(userId) {
  const row = getDb().prepare(`
    SELECT COUNT(*) as cnt FROM character_relationships r
    JOIN characters tc ON tc.id = r.target_char_id
    WHERE r.guild_id = ? AND r.status = 'pending' AND tc.owner_id = ?
  `).get(currentGuildId(), userId);
  return (row?.cnt ?? 0) > 0;
}

export function getLeaderboard(limit = 10) {
  return getDb().prepare(`
    SELECT * FROM characters
    WHERE guild_id = ? AND status = 'active' AND message_count > 0
    ORDER BY message_count DESC LIMIT ?
  `).all(currentGuildId(), limit);
}

// Search across this guild's characters
export function searchCharacters({ name, clan, rank } = {}) {
  const conditions = ['c.guild_id = ?'];
  const args = [currentGuildId()];

  if (name) { conditions.push("LOWER(c.name) LIKE LOWER(?)"); args.push(`%${name}%`); }
  if (clan) { conditions.push("LOWER(c.clan) = LOWER(?)"); args.push(clan); }
  if (rank) { conditions.push("LOWER(c.rank) = LOWER(?)"); args.push(rank); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  return getDb().prepare(
    `SELECT * FROM characters c ${where} ORDER BY c.name LIMIT 100`
  ).all(...args);
}
