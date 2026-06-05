import { getDb } from '../index.js';
import { currentGuildId } from '../context.js';

export function recordProxyMessage(data) {
  getDb().prepare(`
    INSERT OR REPLACE INTO proxy_messages
      (message_id, guild_id, channel_id, user_id, character_id, webhook_id, webhook_token, content, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.message_id, currentGuildId(), data.channel_id, data.user_id, data.character_id,
    data.webhook_id, data.webhook_token, data.content, Date.now()
  );
}

export function getProxyMessage(messageId) {
  return getDb().prepare('SELECT * FROM proxy_messages WHERE message_id = ? AND guild_id = ?')
    .get(messageId, currentGuildId()) ?? null;
}

export function deleteProxyRecord(messageId) {
  getDb().prepare('DELETE FROM proxy_messages WHERE message_id = ?').run(messageId);
}

export function updateProxyContent(messageId, newContent) {
  getDb().prepare('UPDATE proxy_messages SET content = ? WHERE message_id = ?').run(newContent, messageId);
}

export function getUserProxyHistory(userId, channelId = null) {
  const gid = currentGuildId();
  if (channelId) {
    return getDb().prepare(`
      SELECT pm.*, c.name as character_name FROM proxy_messages pm
      JOIN characters c ON c.id = pm.character_id
      WHERE pm.guild_id = ? AND pm.user_id = ? AND pm.channel_id = ?
      ORDER BY pm.sent_at ASC
    `).all(gid, userId, channelId);
  }
  return getDb().prepare(`
    SELECT pm.*, c.name as character_name FROM proxy_messages pm
    JOIN characters c ON c.id = pm.character_id
    WHERE pm.guild_id = ? AND pm.user_id = ?
    ORDER BY pm.sent_at ASC
  `).all(gid, userId);
}

// Webhook pool. channel_id is globally unique, so reads/deletes key off it
// directly; guild_id is recorded on write for guild-scoped cleanup.
export function getWebhook(channelId) {
  return getDb().prepare('SELECT * FROM webhooks WHERE channel_id = ?').get(channelId) ?? null;
}

export function saveWebhook(channelId, webhookId, webhookToken) {
  getDb().prepare(`
    INSERT OR REPLACE INTO webhooks (channel_id, guild_id, webhook_id, webhook_token, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(channelId, currentGuildId(), webhookId, webhookToken, Date.now());
}

export function deleteWebhook(channelId) {
  getDb().prepare('DELETE FROM webhooks WHERE channel_id = ?').run(channelId);
}
