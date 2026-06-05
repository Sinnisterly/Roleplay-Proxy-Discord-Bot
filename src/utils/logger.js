import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../db/queries/config.js';
import { log } from './log.js';

async function sendToChannel(client, configKey, embed) {
  const channelId = getConfig(configKey);
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
    else log.warn('Logger', `Config "${configKey}" points to ${channelId}, which is not a text channel`);
  } catch (err) {
    log.warn('Logger', `Could not post to channel ${channelId} (config "${configKey}"): ${err.message}`);
  }
}

export async function logProxyPost(client, { user, character, content, channelId, messageId }) {
  if (getConfig('proxy_logging_enabled') !== 'true') return;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Proxy Post')
    .addFields(
      { name: 'User',      value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Character', value: character.name,                 inline: true },
      { name: 'Channel',   value: `<#${channelId}>`,             inline: true },
      { name: 'Content',   value: content.slice(0, 1024) || '*(attachment only)*' },
    )
    .setFooter({ text: `Message ID: ${messageId}` })
    .setTimestamp();
  await sendToChannel(client, 'staff_channel_id', embed);
}

export async function logProxyEdit(client, { user, character, oldContent, newContent, channelId, messageId }) {
  if (getConfig('log_edits') !== 'true') return;
  const embed = new EmbedBuilder()
    .setColor(0xfaa61a)
    .setTitle('Proxy Edit')
    .addFields(
      { name: 'User',      value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Character', value: character.name,                 inline: true },
      { name: 'Channel',   value: `<#${channelId}>`,             inline: true },
      { name: 'Before',    value: oldContent.slice(0, 512) || '*(empty)*' },
      { name: 'After',     value: newContent.slice(0, 512) || '*(empty)*' },
    )
    .setFooter({ text: `Message ID: ${messageId}` })
    .setTimestamp();
  await sendToChannel(client, 'staff_channel_id', embed);
}

export async function logProxyDelete(client, { user, character, content, channelId, messageId }) {
  if (getConfig('log_deletes') !== 'true') return;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Proxy Delete')
    .addFields(
      { name: 'User',      value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Character', value: character.name,                 inline: true },
      { name: 'Channel',   value: `<#${channelId}>`,             inline: true },
      { name: 'Content',   value: content.slice(0, 1024) || '*(attachment only)*' },
    )
    .setFooter({ text: `Message ID: ${messageId}` })
    .setTimestamp();
  await sendToChannel(client, 'staff_channel_id', embed);
}

export async function logModAction(client, { moderator, target, action, reason, extra = '' }) {
  // Always surface mod actions in the terminal, regardless of the Discord-channel toggle
  log.info('Mod', `${action} — ${moderator.tag} → ${target.tag} | ${reason}${extra ? ` | ${extra.replace(/<[@#&!]+\d+>/g, '').trim()}` : ''}`);
  if (getConfig('mod_logging_enabled') !== 'true') return;
  const embed = new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle(`Mod Action — ${action}`)
    .addFields(
      { name: 'Moderator', value: `<@${moderator.id}> (${moderator.tag})`, inline: true },
      { name: 'Target',    value: `<@${target.id}> (${target.tag})`,       inline: true },
      { name: 'Reason',    value: reason },
    )
    .setTimestamp();
  if (extra) embed.addFields({ name: 'Details', value: extra });
  await sendToChannel(client, 'audit_log_channel_id', embed);
}
