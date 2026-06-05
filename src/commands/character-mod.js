import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserCharacters } from '../db/queries/characters.js';
import { getUserStatus, getModHistory, timeoutUser, untimeoutUser, logModAction } from '../db/queries/moderation.js';
import { requireStaff } from '../utils/guards.js';
import { logModAction as discordLogMod } from '../utils/logger.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { TIMEOUT_DURATIONS, msToHuman, tsToDiscord } from '../utils/time.js';
import { getConfig } from '../db/queries/config.js';

export const data = new SlashCommandBuilder()
  .setName('character-mod')
  .setDescription('Staff moderation tools for the proxy system')
  .addSubcommandGroup(g => g
    .setName('user')
    .setDescription('User moderation')
    .addSubcommand(s => s
      .setName('timeout')
      .setDescription('Temporarily prevent a user from using the proxy system')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption(o => o
        .setName('duration')
        .setDescription('Timeout duration')
        .setRequired(true)
        .addChoices(...TIMEOUT_DURATIONS.map(d => ({ name: d.label, value: d.value })))
      )
      .addStringOption(o => o.setName('reason').setDescription('Reason (required)').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('untimeout')
      .setDescription('Remove a proxy system timeout from a user')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason (required)').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('history')
      .setDescription('View moderation history for a user')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('status')
      .setDescription('View current proxy system status for a user')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    )
  )
  .addSubcommandGroup(g => g
    .setName('character')
    .setDescription('View other users\' characters')
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all characters belonging to a user')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    )
  );

export async function execute(interaction, client) {
  if (!await requireStaff(interaction)) return;

  const group = interaction.options.getSubcommandGroup();
  const sub   = interaction.options.getSubcommand();

  if (group === 'user') {
    if (sub === 'timeout')   return handleTimeout(interaction, client);
    if (sub === 'untimeout') return handleUntimeout(interaction, client);
    if (sub === 'history')   return handleHistory(interaction);
    if (sub === 'status')    return handleStatus(interaction);
  }

  if (group === 'character') {
    if (sub === 'list') return handleCharList(interaction);
  }
}

async function handleTimeout(interaction, client) {
  const target   = interaction.options.getUser('user');
  const durationMs = parseInt(interaction.options.getString('duration'));
  const reason   = interaction.options.getString('reason');

  // Enforce max timeout cap
  const maxMs = parseInt(getConfig('max_timeout_duration') ?? '2592000000');
  if (durationMs > maxMs) {
    return interaction.reply({ embeds: [errorEmbed(`Maximum timeout duration is **${msToHuman(maxMs)}**.`)], ephemeral: true });
  }

  const expiresAt = Date.now() + durationMs;
  timeoutUser(target.id, interaction.user.id, expiresAt);
  logModAction({
    target_user_id: target.id,
    moderator_id:   interaction.user.id,
    action:         'timeout',
    reason,
    duration_ms:    durationMs,
    expires_at:     expiresAt,
  });

  await discordLogMod(client, {
    moderator: interaction.user,
    target,
    action:    'Timeout',
    reason,
    extra:     `Duration: **${msToHuman(durationMs)}** · Expires: ${tsToDiscord(expiresAt)}`,
  });

  await interaction.reply({
    embeds: [successEmbed(`<@${target.id}> has been timed out for **${msToHuman(durationMs)}**.\nExpires: ${tsToDiscord(expiresAt)}`)],
    ephemeral: true,
  });
}

async function handleUntimeout(interaction, client) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  untimeoutUser(target.id, interaction.user.id);
  logModAction({ target_user_id: target.id, moderator_id: interaction.user.id, action: 'untimeout', reason });

  await discordLogMod(client, { moderator: interaction.user, target, action: 'Untimeout', reason });
  await interaction.reply({ embeds: [successEmbed(`Timeout removed for <@${target.id}>.`)], ephemeral: true });
}

async function handleHistory(interaction) {
  const target  = interaction.options.getUser('user');
  const history = getModHistory(target.id, 15);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`Mod History - ${target.tag}`)
    .setThumbnail(target.displayAvatarURL());

  if (history.length === 0) {
    embed.setDescription('No moderation history.');
  } else {
    embed.setDescription(
      history.map(h =>
        `**${h.action.toUpperCase()}** · <t:${Math.floor(h.timestamp / 1000)}:R>\n` +
        `By: <@${h.moderator_id}> · Reason: ${h.reason}` +
        (h.duration_ms ? `\nDuration: ${msToHuman(h.duration_ms)}` : '')
      ).join('\n\n').slice(0, 4000)
    );
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStatus(interaction) {
  const target = interaction.options.getUser('user');
  const status = getUserStatus(target.id);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`Status - ${target.tag}`);

  if (!status) {
    embed.setDescription('No restrictions on record.');
  } else {
    const lines = [];
    lines.push(`**Blocked:** ${status.is_blocked ? '🔴 Yes' : '🟢 No'}`);
    if (status.timeout_until && status.timeout_until > Date.now()) {
      lines.push(`**Timed out:** Yes - expires ${tsToDiscord(status.timeout_until)}`);
    } else {
      lines.push('**Timed out:** 🟢 No');
    }
    if (status.updated_by) lines.push(`Last updated by <@${status.updated_by}>`);
    embed.setDescription(lines.join('\n'));
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCharList(interaction) {
  const target = interaction.options.getUser('user');
  const chars  = getUserCharacters(target.id);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`Characters - ${target.tag}`)
    .setDescription(
      chars.length === 0
        ? 'No characters found.'
        : chars.map(c => `**${c.name}** · \`${c.trigger}\` · ${c.message_count} posts`).join('\n')
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
