import { getDb } from '../index.js';
import { currentGuildId } from '../context.js';

export function getConfig(key) {
  return getDb().prepare('SELECT value FROM server_config WHERE guild_id = ? AND key = ?')
    .get(currentGuildId(), key)?.value ?? null;
}

export function setConfig(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO server_config (guild_id, key, value) VALUES (?, ?, ?)')
    .run(currentGuildId(), key, String(value));
}

export function getAllConfig() {
  return Object.fromEntries(
    getDb().prepare('SELECT key, value FROM server_config WHERE guild_id = ?')
      .all(currentGuildId()).map(r => [r.key, r.value])
  );
}

// Roles
export function getRolesForTier(tier) {
  return getDb().prepare('SELECT role_id FROM config_roles WHERE guild_id = ? AND tier = ?')
    .all(currentGuildId(), tier).map(r => r.role_id);
}

export function addRoleToTier(tier, roleId, addedBy) {
  getDb().prepare(
    'INSERT OR IGNORE INTO config_roles (guild_id, tier, role_id, added_by, added_at) VALUES (?, ?, ?, ?, ?)'
  ).run(currentGuildId(), tier, roleId, addedBy, Date.now());
}

export function removeRoleFromTier(tier, roleId) {
  getDb().prepare('DELETE FROM config_roles WHERE guild_id = ? AND tier = ? AND role_id = ?')
    .run(currentGuildId(), tier, roleId);
}

export function getAllRoles() {
  return getDb().prepare('SELECT * FROM config_roles WHERE guild_id = ? ORDER BY tier, added_at')
    .all(currentGuildId());
}

// Managed lists (mood / rank / clan)
export function getList(listType) {
  return getDb().prepare('SELECT value FROM config_lists WHERE guild_id = ? AND list_type = ? ORDER BY value')
    .all(currentGuildId(), listType).map(r => r.value);
}

export function addToList(listType, value, addedBy) {
  getDb().prepare(
    'INSERT OR IGNORE INTO config_lists (guild_id, list_type, value, added_by, added_at) VALUES (?, ?, ?, ?, ?)'
  ).run(currentGuildId(), listType, value, addedBy, Date.now());
}

export function removeFromList(listType, value) {
  getDb().prepare('DELETE FROM config_lists WHERE guild_id = ? AND list_type = ? AND value = ?')
    .run(currentGuildId(), listType, value);
}

// Templates
export function getTemplates() {
  return getDb().prepare('SELECT * FROM templates WHERE guild_id = ? ORDER BY name')
    .all(currentGuildId());
}

export function getTemplate(name) {
  return getDb().prepare('SELECT * FROM templates WHERE guild_id = ? AND name = ?')
    .get(currentGuildId(), name) ?? null;
}

export function createTemplate(data) {
  return getDb().prepare(
    'INSERT INTO templates (guild_id, name, description, preset_clan, preset_rank, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(currentGuildId(), data.name, data.description ?? null, data.preset_clan ?? null, data.preset_rank ?? null, data.created_by, Date.now());
}

export function deleteTemplate(name) {
  getDb().prepare('DELETE FROM templates WHERE guild_id = ? AND name = ?')
    .run(currentGuildId(), name);
}

// Relationship types
export function getRelationshipTypes() {
  return getDb().prepare('SELECT value FROM config_relationship_types WHERE guild_id = ? ORDER BY value')
    .all(currentGuildId()).map(r => r.value);
}

export function addRelationshipType(value, addedBy) {
  getDb().prepare(
    'INSERT OR IGNORE INTO config_relationship_types (guild_id, value, added_by, added_at) VALUES (?, ?, ?, ?)'
  ).run(currentGuildId(), value, addedBy, Date.now());
}

export function removeRelationshipType(value) {
  getDb().prepare('DELETE FROM config_relationship_types WHERE guild_id = ? AND value = ?')
    .run(currentGuildId(), value);
}
