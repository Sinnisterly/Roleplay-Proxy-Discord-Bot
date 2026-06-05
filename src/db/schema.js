export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS server_config (
    guild_id TEXT NOT NULL,
    key      TEXT NOT NULL,
    value    TEXT NOT NULL,
    PRIMARY KEY (guild_id, key)
  );

  -- Multi-role tier assignments
  CREATE TABLE IF NOT EXISTS config_roles (
    guild_id TEXT NOT NULL,
    tier     TEXT NOT NULL CHECK(tier IN ('roleplayer','staff','senior_staff')),
    role_id  TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, tier, role_id)
  );

  -- Staff-managed selectable lists: mood, rank, clan
  CREATE TABLE IF NOT EXISTS config_lists (
    guild_id   TEXT NOT NULL,
    list_type  TEXT NOT NULL CHECK(list_type IN ('mood','rank','clan')),
    value      TEXT NOT NULL,
    added_by   TEXT NOT NULL,
    added_at   INTEGER NOT NULL,
    PRIMARY KEY (guild_id, list_type, value)
  );

  -- Character templates (senior staff only)
  CREATE TABLE IF NOT EXISTS templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    preset_clan TEXT,
    preset_rank TEXT,
    created_by  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    UNIQUE (guild_id, name)
  );

  -- Characters
  CREATE TABLE IF NOT EXISTS characters (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id        TEXT NOT NULL,
    owner_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    pronouns        TEXT,
    trigger         TEXT NOT NULL,
    avatar_url      TEXT,
    bio             TEXT,
    appearance      TEXT,
    personality     TEXT,
    backstory       TEXT,
    clan            TEXT,
    rank            TEXT,
    age_moons       INTEGER,
    ic_birthday     TEXT,
    oc_doc_url      TEXT,
    is_default      INTEGER NOT NULL DEFAULT 0,
    is_shared       INTEGER NOT NULL DEFAULT 0,
    current_mood    TEXT,
    mood_expires_at INTEGER,
    status          TEXT NOT NULL DEFAULT 'active',
    color           INTEGER,
    message_count   INTEGER NOT NULL DEFAULT 0,
    first_used_at   INTEGER,
    last_used_at    INTEGER,
    created_at      INTEGER NOT NULL
  );

  -- Shared character access grants
  CREATE TABLE IF NOT EXISTS character_access (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id         TEXT NOT NULL,
    character_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    grantee_user_id  TEXT,
    grantee_role_id  TEXT,
    granted_by       TEXT NOT NULL,
    granted_at       INTEGER NOT NULL
  );

  -- Webhook pool (one per channel). channel_id is globally unique in Discord,
  -- so it stays the primary key; guild_id is kept for guild-scoped cleanup.
  CREATE TABLE IF NOT EXISTS webhooks (
    channel_id    TEXT PRIMARY KEY,
    guild_id      TEXT NOT NULL,
    webhook_id    TEXT NOT NULL,
    webhook_token TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  -- Proxy message records (edit / delete / export)
  CREATE TABLE IF NOT EXISTS proxy_messages (
    message_id    TEXT PRIMARY KEY,
    guild_id      TEXT NOT NULL,
    channel_id    TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    webhook_id    TEXT NOT NULL,
    webhook_token TEXT NOT NULL,
    content       TEXT NOT NULL,
    sent_at       INTEGER NOT NULL
  );

  -- Current moderation status per user, per guild
  CREATE TABLE IF NOT EXISTS user_status (
    guild_id      TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    is_blocked    INTEGER NOT NULL DEFAULT 0,
    timeout_until INTEGER,
    updated_by    TEXT,
    updated_at    INTEGER,
    PRIMARY KEY (guild_id, user_id)
  );

  -- Permanent moderation history
  CREATE TABLE IF NOT EXISTS mod_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id        TEXT NOT NULL,
    target_user_id  TEXT NOT NULL,
    moderator_id    TEXT NOT NULL,
    action          TEXT NOT NULL,
    reason          TEXT NOT NULL,
    duration_ms     INTEGER,
    expires_at      INTEGER,
    character_id    INTEGER,
    extra_data      TEXT,
    timestamp       INTEGER NOT NULL
  );

  -- Proxy trigger aliases per character
  CREATE TABLE IF NOT EXISTS character_aliases (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    trigger      TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    UNIQUE(character_id, trigger)
  );

  -- Per-user, per-channel auto-proxy overrides
  CREATE TABLE IF NOT EXISTS channel_autopilot (
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    channel_id   TEXT NOT NULL,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    PRIMARY KEY (guild_id, user_id, channel_id)
  );

  -- IC relationships between characters (one-directional, approval required)
  CREATE TABLE IF NOT EXISTS character_relationships (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id           TEXT NOT NULL,
    requester_char_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    target_char_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    relationship_type  TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'pending',
    created_at         INTEGER NOT NULL,
    approved_at        INTEGER
  );

  -- Staff-managed relationship types
  CREATE TABLE IF NOT EXISTS config_relationship_types (
    guild_id   TEXT NOT NULL,
    value      TEXT NOT NULL,
    added_by   TEXT NOT NULL,
    added_at   INTEGER NOT NULL,
    PRIMARY KEY (guild_id, value)
  );
`;

export const DEFAULT_CONFIG = {
  default_proxy_trigger:   '!!',
  edit_prefix:             '!e',
  max_characters_per_user: '20',
  max_timeout_duration:    '2592000000', // 30 days in ms
  proxy_logging_enabled:   'true',
  mod_logging_enabled:     'true',
  log_edits:               'true',
  log_deletes:             'true',
  staff_channel_id:        '',
  audit_log_channel_id:    '',
  mood_auto_expire_hours:  '24',
};
