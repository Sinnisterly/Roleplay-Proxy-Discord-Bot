import { getWebhook, saveWebhook, deleteWebhook } from '../db/queries/proxy.js';
import { log } from '../utils/log.js';

// Underlying webhook name; the per-message username overrides this on every send.
const WEBHOOK_NAME = process.env.WEBHOOK_NAME ?? 'RP Proxy';

// In-memory cache on top of DB for hot path
const cache = new Map();
// Tracks in-progress creations so concurrent first-messages in a channel
// don't each create a separate (duplicate) webhook.
const inFlight = new Map();

export async function getOrCreateWebhook(channel) {
  const channelId = channel.id;

  if (cache.has(channelId)) return cache.get(channelId);

  const stored = getWebhook(channelId);
  if (stored) {
    cache.set(channelId, { id: stored.webhook_id, token: stored.webhook_token });
    return cache.get(channelId);
  }

  // If a creation is already underway for this channel, await that one
  if (inFlight.has(channelId)) return inFlight.get(channelId);

  const promise = createWebhook(channel).finally(() => inFlight.delete(channelId));
  inFlight.set(channelId, promise);
  return promise;
}

async function createWebhook(channel) {
  // If this is a thread, use the parent channel for webhook creation
  const targetChannel = channel.isThread?.() ? channel.parent : channel;

  const webhook = await targetChannel.createWebhook({
    name: WEBHOOK_NAME,
    reason: 'RP proxy webhook',
  });

  saveWebhook(channel.id, webhook.id, webhook.token);
  cache.set(channel.id, { id: webhook.id, token: webhook.token });
  log.info('Webhook', `Created webhook for #${targetChannel.name} (${channel.id})`);
  return { id: webhook.id, token: webhook.token };
}

export function invalidateWebhook(channelId) {
  cache.delete(channelId);
  deleteWebhook(channelId);
}

// Send a message via webhook, handling threads
export async function sendWebhookMessage(client, channel, { username, avatarURL, content, files = [], embeds = [] }) {
  const wh = await getOrCreateWebhook(channel);

  const webhook = await client.fetchWebhook(wh.id, wh.token).catch(async () => {
    // Webhook was deleted — recreate
    log.warn('Webhook', `Stored webhook for ${channel.id} is gone, recreating`);
    invalidateWebhook(channel.id);
    const fresh = await getOrCreateWebhook(channel);
    return client.fetchWebhook(fresh.id, fresh.token);
  });

  const options = { username, avatarURL, content, files, embeds };

  // Route to thread if applicable
  if (channel.isThread?.()) options.threadId = channel.id;

  const message = await webhook.send(options);
  // Return message alongside the known-good token so callers can store it
  return { message, webhookId: wh.id, webhookToken: wh.token };
}

export async function editWebhookMessage(client, messageId, webhookId, webhookToken, newContent) {
  const webhook = await client.fetchWebhook(webhookId, webhookToken);
  return webhook.editMessage(messageId, { content: newContent });
}

export async function deleteWebhookMessage(client, messageId, webhookId, webhookToken) {
  const webhook = await client.fetchWebhook(webhookId, webhookToken);
  return webhook.deleteMessage(messageId);
}
