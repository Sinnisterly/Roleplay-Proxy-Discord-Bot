import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { SCHEMA, DEFAULT_CONFIG } from './schema.js';
import { log } from '../utils/log.js';

const DB_PATH = process.env.DB_PATH ?? './data/bot.db';

const DEFAULT_RELATIONSHIP_TYPES = [
  'mentor', 'apprentice', 'mate', 'littermate', 'parent', 'kit', 'ally', 'rival',
];

let db;

export function initDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  log.info('DB', `Initialized at ${DB_PATH}`);
}

// Seed default config and relationship types for a single guild.
// Uses INSERT OR IGNORE, so it's safe to call on every startup and whenever the
// bot joins a new guild. Anything an admin has already customized stays as-is.
export function seedGuild(guildId) {
  if (!db) throw new Error('seedGuild called before initDb()');

  const insertConfig = db.prepare(
    'INSERT OR IGNORE INTO server_config (guild_id, key, value) VALUES (?, ?, ?)'
  );
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    insertConfig.run(guildId, key, value);
  }

  const insertRelType = db.prepare(
    'INSERT OR IGNORE INTO config_relationship_types (guild_id, value, added_by, added_at) VALUES (?, ?, ?, ?)'
  );
  for (const type of DEFAULT_RELATIONSHIP_TYPES) {
    insertRelType.run(guildId, type, 'system', Date.now());
  }
}

export function getDb() {
  return db;
}
