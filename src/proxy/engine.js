import { getConfig } from '../db/queries/config.js';
import { getAllTriggersForUser, getCharacterById, getDefaultCharacter, incrementMessageCount, getChannelAutopilot } from '../db/queries/characters.js';
import { recordProxyMessage } from '../db/queries/proxy.js';
import { hasRoleplayerAccess, checkProxyAllowed, canEditProxyMessage } from '../utils/guards.js';
import { sendWebhookMessage } from './webhookPool.js';
import { logProxyPost } from '../utils/logger.js';
import { log } from '../utils/log.js';
import { clearExpiredMoods } from '../db/queries/characters.js';

// OOC notation: anything inside ((double parens)) gets pulled out of the
// message and shown as a footer instead.
const OOC_REGEX = /\(\((.+?)\)\)/gs;

function parseOOC(content) {
  const oocNotes = [];
  const cleaned = content.replace(OOC_REGEX, (_, note) => {
    oocNotes.push(note.trim());
    return '';
  }).trim();
  return { cleaned, oocNotes };
}

function buildWebhookUsername(character) {
  let name = character.name;
  if (character.pronouns) name += ` (${character.pronouns})`;
  if (character.current_mood) {
    // Skip moods that have already expired - the periodic job will clear them
    if (character.mood_expires_at && character.mood_expires_at <= Date.now()) {
      // nothing to add here
    } else {
      name += ` [${character.current_mood}]`;
    }
  }
  return name.slice(0, 80); // Discord webhook username limit
}

export async function handleProxyMessage(message, client) {
  if (message.author.bot) return false;
  if (!message.guild) return false;

  // Fetch member for role checks
  let member;
  try {
    member = message.member ?? await message.guild.members.fetch(message.author.id);
  } catch {
    return false;
  }

  if (!hasRoleplayerAccess(member)) return false;

  const block = checkProxyAllowed(message.author.id);
  if (block) return false;

  // Clear expired moods. This is cheap, so it's fine to run on every proxy check.
  clearExpiredMoods();

  const content = message.content;
  const userId = message.author.id;
  const defaultTrigger = getConfig('default_proxy_trigger') ?? '!!';

  let character = null;
  let messageText = '';

  // Default proxy trigger. A per-channel autopilot character wins over the server-wide default.
  if (content.startsWith(defaultTrigger + ' ') || content === defaultTrigger) {
    character = getChannelAutopilot(userId, message.channel.id) ?? getDefaultCharacter(userId);
    if (!character) return false;
    messageText = content.slice(defaultTrigger.length).trim();
  } else {
    // Check all triggers this user can fire, longest-first so the most
    // specific trigger wins when one is a prefix of another.
    const memberRoleIds = [...member.roles.cache.keys()];
    const triggers = getAllTriggersForUser(userId, memberRoleIds)
      .sort((a, b) => b.trigger.length - a.trigger.length);

    for (const row of triggers) {
      const trigger = row.trigger;
      if (content.toLowerCase().startsWith(trigger.toLowerCase())) {
        const after = content.slice(trigger.length).trim();
        if (after.length > 0 || message.attachments.size > 0) {
          character = getCharacterById(row.id);
          messageText = after;
          break;
        }
      }
    }
  }

  if (!character) return false;

  // Parse OOC sections
  const { cleaned, oocNotes } = parseOOC(messageText);
  messageText = cleaned;

  if (!messageText && message.attachments.size === 0) return false;

  const username = buildWebhookUsername(character);
  const avatarURL = character.avatar_url ?? undefined;

  // Build files array from attachments
  const files = [...message.attachments.values()].map(a => ({ attachment: a.url, name: a.name }));

  // Build embeds for OOC notes
  const embeds = [];
  if (oocNotes.length) {
    const { EmbedBuilder } = await import('discord.js');
    const embed = new EmbedBuilder()
      .setColor(0x4f545c)
      .setDescription(`*OOC: ${oocNotes.join(' | ')}*`);
    embeds.push(embed);
  }

  // Send the proxy FIRST, then delete the original. If the send fails, the
  // user's original message is preserved rather than silently lost.
  let sent, webhookId, webhookToken;
  try {
    ({ message: sent, webhookId, webhookToken } = await sendWebhookMessage(client, message.channel, {
      username,
      avatarURL,
      content: messageText || undefined,
      files,
      embeds,
    }));
  } catch (err) {
    log.error('Proxy', `Webhook send failed in #${message.channel.name} for ${message.author.tag}:`, err);
    return false;
  }

  try {
    await message.delete();
  } catch {
    // Proxy is already posted; original couldn't be removed (already gone or
    // missing Manage Messages). Leave it rather than losing the proxied post.
    log.warn('Proxy', `Posted proxy but could not delete original from ${message.author.tag} in #${message.channel.name}`);
  }

  // Record for edit/delete/export
  recordProxyMessage({
    message_id:    sent.id,
    channel_id:    message.channel.id,
    user_id:       userId,
    character_id:  character.id,
    webhook_id:    webhookId,
    webhook_token: webhookToken,
    content:       messageText,
  });

  incrementMessageCount(character.id);

  log.info('Proxy', `${message.author.tag} → "${character.name}" in #${message.channel.name}`);

  await logProxyPost(client, {
    user:      message.author,
    character,
    content:   messageText,
    channelId: message.channel.id,
    messageId: sent.id,
  });

  return true;
}

export async function handleEditPrefix(message, client) {
  if (message.author.bot) return false;
  if (!message.reference) return false;

  const editPrefix = getConfig('edit_prefix') ?? '!e';
  if (!message.content.startsWith(editPrefix + ' ')) return false;

  const newContent = message.content.slice(editPrefix.length).trim();
  if (!newContent) return false;

  let member;
  try {
    member = message.member ?? await message.guild.members.fetch(message.author.id);
  } catch { return false; }

  if (!hasRoleplayerAccess(member)) return false;

  // Fetch the referenced (proxied) message record
  const { getProxyMessage, updateProxyContent } = await import('../db/queries/proxy.js');
  const { editWebhookMessage } = await import('./webhookPool.js');

  const refId = message.reference.messageId;
  const record = getProxyMessage(refId);
  if (!record) return false;

  const memberRoleIds = [...member.roles.cache.keys()];
  if (!canEditProxyMessage(message.author.id, record, memberRoleIds)) return false;

  try {
    await editWebhookMessage(client, refId, record.webhook_id, record.webhook_token, newContent);
    updateProxyContent(refId, newContent);
    await message.delete().catch(() => {});

    const { logProxyEdit } = await import('../utils/logger.js');
    const { getCharacterById: getChar } = await import('../db/queries/characters.js');
    const char = getChar(record.character_id);
    log.info('Proxy', `${message.author.tag} edited "${char?.name}" message ${refId}`);
    await logProxyEdit(client, {
      user:       message.author,
      character:  char,
      oldContent: record.content,
      newContent,
      channelId:  record.channel_id,
      messageId:  refId,
    });
  } catch (err) {
    log.error('Proxy', `Edit failed for ${message.author.tag} on message ${refId}:`, err);
  }

  return true;
}
