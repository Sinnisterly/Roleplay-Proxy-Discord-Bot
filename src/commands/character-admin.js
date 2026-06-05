import {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder,
} from 'discord.js';
import {
  getUserCharacters, getCharacterById, updateCharacter, deleteCharacter,
  createCharacter, grantAccess, revokeAccess, getAccessList,
  getSharedCharacters, getSharedCharacterByName,
} from '../db/queries/characters.js';
import { pendingCreations } from '../utils/pendingState.js';
import {
  getUserStatus, getModHistory, blockUser, unblockUser, logModAction,
} from '../db/queries/moderation.js';
import {
  getConfig, setConfig, getAllConfig, getAllRoles, addRoleToTier, removeRoleFromTier,
  getList, addToList, removeFromList, getTemplates, createTemplate, deleteTemplate,
  getRelationshipTypes, addRelationshipType, removeRelationshipType,
} from '../db/queries/config.js';
import {
  getApprovedRelationships, getPendingRelationshipsForUser, deleteRelationship, getRelationshipById,
} from '../db/queries/characters.js';
import { requireSeniorStaff } from '../utils/guards.js';
import { logModAction as discordLogMod } from '../utils/logger.js';
import { errorEmbed, successEmbed, characterEmbed } from '../utils/embeds.js';
import { TIMEOUT_DURATIONS, msToHuman, tsToDiscord } from '../utils/time.js';

export const data = new SlashCommandBuilder()
  .setName('character-admin')
  .setDescription('Senior staff tools for the proxy system')

  // ── User group ──────────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('user')
    .setDescription('Full user moderation')
    .addSubcommand(s => s
      .setName('block')
      .setDescription('Permanently block a user from the proxy system')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason (required)').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('unblock')
      .setDescription('Unblock a user')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason (required)').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('history')
      .setDescription('View full moderation history for a user')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('status')
      .setDescription('View current proxy system status for a user')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    )
  )

  // ── Character group ─────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('character')
    .setDescription('Manage any user\'s characters')
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all characters belonging to a user')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('view')
      .setDescription('View a character\'s full profile')
      .addUserOption(o => o.setName('user').setDescription('Owner').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('delete')
      .setDescription('Delete a user\'s character')
      .addUserOption(o => o.setName('user').setDescription('Owner').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason (required)').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('transfer')
      .setDescription('Transfer a character to another user')
      .addUserOption(o => o.setName('from').setDescription('Current owner').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true))
      .addUserOption(o => o.setName('to').setDescription('New owner').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason (required)').setRequired(true))
    )
  )

  // ── Config: roles ───────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('config-roles')
    .setDescription('Manage role tier assignments')
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add a role to a tier')
      .addStringOption(o => o
        .setName('tier')
        .setDescription('Access tier')
        .setRequired(true)
        .addChoices(
          { name: 'Roleplayer', value: 'roleplayer' },
          { name: 'Staff', value: 'staff' },
          { name: 'Senior Staff', value: 'senior_staff' },
        )
      )
      .addRoleOption(o => o.setName('role').setDescription('Role to add').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove a role from a tier')
      .addStringOption(o => o
        .setName('tier').setDescription('Access tier').setRequired(true)
        .addChoices(
          { name: 'Roleplayer', value: 'roleplayer' },
          { name: 'Staff', value: 'staff' },
          { name: 'Senior Staff', value: 'senior_staff' },
        )
      )
      .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand(s => s.setName('list').setDescription('Show all configured role tiers'))
  )

  // ── Config: channels ────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('config-channels')
    .setDescription('Configure logging channels')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set a logging channel')
      .addStringOption(o => o
        .setName('type').setDescription('Channel type').setRequired(true)
        .addChoices(
          { name: 'Staff channel (proxy logs)', value: 'staff_channel_id' },
          { name: 'Audit log (mod actions)',     value: 'audit_log_channel_id' },
        )
      )
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
    )
  )

  // ── Config: triggers ────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('config-triggers')
    .setDescription('Configure proxy triggers and prefixes')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set a trigger/prefix value')
      .addStringOption(o => o
        .setName('type').setDescription('Trigger type').setRequired(true)
        .addChoices(
          { name: 'Default proxy trigger (!!) ', value: 'default_proxy_trigger' },
          { name: 'Edit prefix (!e)',            value: 'edit_prefix' },
        )
      )
      .addStringOption(o => o.setName('value').setDescription('New value').setRequired(true))
    )
  )

  // ── Config: limits ──────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('config-limits')
    .setDescription('Configure system limits')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set a limit')
      .addStringOption(o => o
        .setName('type').setDescription('Limit type').setRequired(true)
        .addChoices(
          { name: 'Max characters per user', value: 'max_characters_per_user' },
          { name: 'Max timeout duration',    value: 'max_timeout_duration' },
          { name: 'Mood auto-expire hours',  value: 'mood_auto_expire_hours' },
        )
      )
      .addStringOption(o => o
        .setName('value')
        .setDescription('For max-timeout use choices; for others enter a number')
        .setRequired(true)
      )
      .addStringOption(o => o
        .setName('timeout-duration')
        .setDescription('If setting max timeout, pick from here')
        .setRequired(false)
        .addChoices(...TIMEOUT_DURATIONS.map(d => ({ name: d.label, value: d.value })))
      )
    )
  )

  // ── Config: logging ─────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('config-logging')
    .setDescription('Toggle logging options')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Toggle a logging type')
      .addStringOption(o => o
        .setName('type').setDescription('Log type').setRequired(true)
        .addChoices(
          { name: 'Proxy logging',     value: 'proxy_logging_enabled' },
          { name: 'Mod action logging',value: 'mod_logging_enabled' },
          { name: 'Log edits',         value: 'log_edits' },
          { name: 'Log deletes',       value: 'log_deletes' },
        )
      )
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true))
    )
  )

  // ── Config: lists (moods / ranks / clans) ───────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('config-lists')
    .setDescription('Manage moods, ranks, and clans')
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add an entry to a list')
      .addStringOption(o => o
        .setName('list').setDescription('List type').setRequired(true)
        .addChoices(
          { name: 'Mood',  value: 'mood' },
          { name: 'Rank',  value: 'rank' },
          { name: 'Clan',  value: 'clan' },
        )
      )
      .addStringOption(o => o.setName('value').setDescription('Value to add').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove an entry from a list')
      .addStringOption(o => o
        .setName('list').setDescription('List type').setRequired(true)
        .addChoices(
          { name: 'Mood',  value: 'mood' },
          { name: 'Rank',  value: 'rank' },
          { name: 'Clan',  value: 'clan' },
        )
      )
      .addStringOption(o => o.setName('value').setDescription('Value to remove').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('view')
      .setDescription('View all entries in a list')
      .addStringOption(o => o
        .setName('list').setDescription('List type').setRequired(true)
        .addChoices(
          { name: 'Mood',  value: 'mood' },
          { name: 'Rank',  value: 'rank' },
          { name: 'Clan',  value: 'clan' },
        )
      )
    )
  )

  // ── Config: view all ────────────────────────────────────────────────────────
  .addSubcommand(s => s.setName('config-view').setDescription('View all current config settings'))

  // ── Templates ───────────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('templates')
    .setDescription('Manage character templates')
    .addSubcommand(s => s
      .setName('create')
      .setDescription('Create a new template')
      .addStringOption(o => o.setName('name').setDescription('Template name').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Template description').setRequired(false))
      .addStringOption(o => o.setName('clan').setDescription('Preset clan').setRequired(false).setAutocomplete(true))
      .addStringOption(o => o.setName('rank').setDescription('Preset rank').setRequired(false).setAutocomplete(true))
    )
    .addSubcommand(s => s
      .setName('delete')
      .setDescription('Delete a template')
      .addStringOption(o => o.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(s => s.setName('list').setDescription('List all templates'))
  )

  // ── Shared / NPC characters ─────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('shared')
    .setDescription('Manage shared / NPC characters')
    .addSubcommand(s => s
      .setName('create')
      .setDescription('Create a shared/NPC character')
      .addAttachmentOption(o => o.setName('file-avatar').setDescription('Upload an image as avatar').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('delete')
      .setDescription('Delete a shared character')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(s => s.setName('list').setDescription('List all shared/NPC characters'))
    .addSubcommand(s => s
      .setName('grant')
      .setDescription('Grant proxy access to a user or role (or both)')
      .addStringOption(o => o.setName('name').setDescription('Shared character name').setRequired(true).setAutocomplete(true))
      .addUserOption(o => o.setName('user').setDescription('User to grant access to').setRequired(false))
      .addRoleOption(o => o.setName('role').setDescription('Role to grant access to').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('revoke')
      .setDescription('Revoke proxy access from a user or role')
      .addStringOption(o => o.setName('name').setDescription('Shared character name').setRequired(true).setAutocomplete(true))
      .addUserOption(o => o.setName('user').setDescription('User to revoke access from').setRequired(false))
      .addRoleOption(o => o.setName('role').setDescription('Role to revoke access from').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('access')
      .setDescription('View who has access to a shared character')
      .addStringOption(o => o.setName('name').setDescription('Shared character name').setRequired(true).setAutocomplete(true))
    )
  )

  // ── Relationship types ──────────────────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('config-relationship-types')
    .setDescription('Manage IC relationship types')
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add a relationship type')
      .addStringOption(o => o.setName('value').setDescription('e.g. "mentor", "rival"').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove a relationship type')
      .addStringOption(o => o.setName('value').setDescription('Type to remove').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(s => s.setName('list').setDescription('List all relationship types'))
  )

  // ── Staff relationship management ───────────────────────────────────────────
  .addSubcommandGroup(g => g
    .setName('relationships')
    .setDescription('View and remove any character\'s relationships')
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all relationships for a user\'s character')
      .addUserOption(o => o.setName('user').setDescription('Character owner').setRequired(true))
      .addStringOption(o => o.setName('character').setDescription('Character name').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove a specific relationship')
      .addIntegerOption(o => o.setName('relationship-id').setDescription('Relationship ID (from /character-admin relationships list)').setRequired(true))
    )
  );

// ── Execute ──────────────────────────────────────────────────────────────────

export async function execute(interaction, client) {
  if (!await requireSeniorStaff(interaction)) return;

  const group = interaction.options.getSubcommandGroup(false);
  const sub   = interaction.options.getSubcommand(false);
  const key   = group ? `${group}/${sub}` : sub;

  switch (key) {
    // User
    case 'user/block':     return handleBlock(interaction, client);
    case 'user/unblock':   return handleUnblock(interaction, client);
    case 'user/history':   return handleHistory(interaction);
    case 'user/status':    return handleStatus(interaction);
    // Character
    case 'character/list':     return handleCharList(interaction);
    case 'character/view':     return handleCharView(interaction);
    case 'character/delete':   return handleCharDelete(interaction, client);
    case 'character/transfer': return handleCharTransfer(interaction, client);
    // Config
    case 'config-roles/add':    return handleRoleAdd(interaction);
    case 'config-roles/remove': return handleRoleRemove(interaction);
    case 'config-roles/list':   return handleRoleList(interaction);
    case 'config-channels/set': return handleChannelSet(interaction);
    case 'config-triggers/set': return handleTriggerSet(interaction);
    case 'config-limits/set':   return handleLimitsSet(interaction);
    case 'config-logging/set':  return handleLoggingSet(interaction);
    case 'config-lists/add':    return handleListAdd(interaction);
    case 'config-lists/remove': return handleListRemove(interaction);
    case 'config-lists/view':   return handleListView(interaction);
    case 'config-view':         return handleConfigView(interaction);
    // Templates
    case 'templates/create': return handleTemplateCreate(interaction);
    case 'templates/delete': return handleTemplateDelete(interaction);
    case 'templates/list':   return handleTemplateList(interaction);
    // Shared
    case 'shared/create': return handleSharedCreate(interaction);
    case 'shared/delete': return handleSharedDelete(interaction, client);
    case 'shared/list':   return handleSharedList(interaction);
    case 'shared/grant':  return handleSharedGrant(interaction);
    case 'shared/revoke': return handleSharedRevoke(interaction);
    case 'shared/access': return handleSharedAccess(interaction);
    // Relationship types
    case 'config-relationship-types/add':    return handleRelTypeAdd(interaction);
    case 'config-relationship-types/remove': return handleRelTypeRemove(interaction);
    case 'config-relationship-types/list':   return handleRelTypeList(interaction);
    // Staff relationship management
    case 'relationships/list':   return handleStaffRelList(interaction);
    case 'relationships/remove': return handleStaffRelRemove(interaction);
  }
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'clan') {
    const list = getList('clan');
    return interaction.respond(
      list.filter(v => v.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25).map(v => ({ name: v, value: v }))
    );
  }
  if (focused.name === 'rank') {
    const list = getList('rank');
    return interaction.respond(
      list.filter(v => v.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25).map(v => ({ name: v, value: v }))
    );
  }
  if (focused.name === 'name' && interaction.options.getSubcommandGroup() === 'templates') {
    const templates = getTemplates();
    return interaction.respond(
      templates.filter(t => t.name.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25).map(t => ({ name: t.name, value: t.name }))
    );
  }
  if (focused.name === 'name' && interaction.options.getSubcommandGroup() === 'shared') {
    const shared = getSharedCharacters();
    return interaction.respond(
      shared.filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25).map(c => ({ name: c.name, value: c.name }))
    );
  }
  if (focused.name === 'value' && interaction.options.getSubcommandGroup() === 'config-relationship-types') {
    const types = getRelationshipTypes();
    return interaction.respond(
      types.filter(v => v.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25).map(v => ({ name: v, value: v }))
    );
  }
}

// ── User handlers ─────────────────────────────────────────────────────────────

async function handleBlock(interaction, client) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  blockUser(target.id, interaction.user.id);
  logModAction({ target_user_id: target.id, moderator_id: interaction.user.id, action: 'block', reason });
  await discordLogMod(client, { moderator: interaction.user, target, action: 'Block', reason });
  await interaction.reply({ embeds: [successEmbed(`<@${target.id}> has been blocked from the proxy system.`)], ephemeral: true });
}

async function handleUnblock(interaction, client) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  unblockUser(target.id, interaction.user.id);
  logModAction({ target_user_id: target.id, moderator_id: interaction.user.id, action: 'unblock', reason });
  await discordLogMod(client, { moderator: interaction.user, target, action: 'Unblock', reason });
  await interaction.reply({ embeds: [successEmbed(`<@${target.id}> has been unblocked.`)], ephemeral: true });
}

async function handleHistory(interaction) {
  const target  = interaction.options.getUser('user');
  const history = getModHistory(target.id, 20);
  const embed   = new EmbedBuilder().setColor(0x2b2d31).setTitle(`Mod History — ${target.tag}`);

  embed.setDescription(
    history.length === 0
      ? 'No history on record.'
      : history.map(h =>
          `**${h.action.toUpperCase()}** · <t:${Math.floor(h.timestamp / 1000)}:R>\n` +
          `By: <@${h.moderator_id}> · Reason: ${h.reason}` +
          (h.duration_ms ? ` · Duration: ${msToHuman(h.duration_ms)}` : '') +
          (h.character_id ? ` · Char ID: ${h.character_id}` : '')
        ).join('\n\n').slice(0, 4000)
  );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStatus(interaction) {
  const target = interaction.options.getUser('user');
  const status = getUserStatus(target.id);
  const embed  = new EmbedBuilder().setColor(0x2b2d31).setTitle(`Status — ${target.tag}`);

  if (!status) {
    embed.setDescription('No restrictions on record.');
  } else {
    const lines = [];
    lines.push(`**Blocked:** ${status.is_blocked ? '🔴 Yes' : '🟢 No'}`);
    lines.push(status.timeout_until && status.timeout_until > Date.now()
      ? `**Timed out:** Yes — expires ${tsToDiscord(status.timeout_until)}`
      : '**Timed out:** 🟢 No'
    );
    embed.setDescription(lines.join('\n'));
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Character handlers ────────────────────────────────────────────────────────

async function handleCharList(interaction) {
  const target = interaction.options.getUser('user');
  const chars  = getUserCharacters(target.id);
  const embed  = new EmbedBuilder().setColor(0x2b2d31).setTitle(`Characters — ${target.tag}`)
    .setDescription(
      chars.length === 0
        ? 'No characters.'
        : chars.map(c => `**${c.name}** · \`${c.trigger}\` · ${c.message_count} posts${c.clan ? ` · ${c.clan}` : ''}${c.rank ? ` · ${c.rank}` : ''}`).join('\n')
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCharView(interaction) {
  const target = interaction.options.getUser('user');
  const name   = interaction.options.getString('name');
  const chars  = getUserCharacters(target.id);
  const char   = chars.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });
  await interaction.reply({ embeds: [characterEmbed(char)], ephemeral: true });
}

async function handleCharDelete(interaction, client) {
  const owner  = interaction.options.getUser('user');
  const name   = interaction.options.getString('name');
  const reason = interaction.options.getString('reason');
  const chars  = getUserCharacters(owner.id);
  const char   = chars.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  deleteCharacter(char.id);
  logModAction({ target_user_id: owner.id, moderator_id: interaction.user.id, action: 'character_delete', reason, character_id: char.id });
  await discordLogMod(client, {
    moderator: interaction.user, target: owner, action: 'Character Delete', reason,
    extra: `Character: **${char.name}**`,
  });
  await interaction.reply({ embeds: [successEmbed(`**${char.name}** has been deleted.`)], ephemeral: true });
}

async function handleCharTransfer(interaction, client) {
  const from   = interaction.options.getUser('from');
  const name   = interaction.options.getString('name');
  const to     = interaction.options.getUser('to');
  const reason = interaction.options.getString('reason');
  const chars  = getUserCharacters(from.id);
  const char   = chars.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  updateCharacter(char.id, { owner_id: to.id });
  logModAction({ target_user_id: from.id, moderator_id: interaction.user.id, action: 'character_transfer', reason, character_id: char.id, extra_data: { to_user_id: to.id } });
  await discordLogMod(client, {
    moderator: interaction.user, target: from, action: 'Character Transfer', reason,
    extra: `Character: **${char.name}** → <@${to.id}>`,
  });
  await interaction.reply({ embeds: [successEmbed(`**${char.name}** transferred to <@${to.id}>.`)], ephemeral: true });
}

// ── Config handlers ───────────────────────────────────────────────────────────

async function handleRoleAdd(interaction) {
  const tier = interaction.options.getString('tier');
  const role = interaction.options.getRole('role');
  addRoleToTier(tier, role.id, interaction.user.id);
  await interaction.reply({ embeds: [successEmbed(`${role} added to **${tier}** tier.`)], ephemeral: true });
}

async function handleRoleRemove(interaction) {
  const tier = interaction.options.getString('tier');
  const role = interaction.options.getRole('role');
  removeRoleFromTier(tier, role.id);
  await interaction.reply({ embeds: [successEmbed(`${role} removed from **${tier}** tier.`)], ephemeral: true });
}

async function handleRoleList(interaction) {
  const all = getAllRoles();
  const tiers = { roleplayer: [], staff: [], senior_staff: [] };
  for (const r of all) tiers[r.tier]?.push(`<@&${r.role_id}>`);

  const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle('Role Tiers').addFields(
    { name: 'Roleplayer',   value: tiers.roleplayer.join('\n').slice(0, 1024)   || '*None set*', inline: true },
    { name: 'Staff',        value: tiers.staff.join('\n').slice(0, 1024)        || '*None set*', inline: true },
    { name: 'Senior Staff', value: tiers.senior_staff.join('\n').slice(0, 1024) || '*None set*', inline: true },
  );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleChannelSet(interaction) {
  const type    = interaction.options.getString('type');
  const channel = interaction.options.getChannel('channel');
  setConfig(type, channel.id);
  const label = type === 'staff_channel_id' ? 'Staff channel' : 'Audit log channel';
  await interaction.reply({ embeds: [successEmbed(`${label} set to ${channel}.`)], ephemeral: true });
}

async function handleTriggerSet(interaction) {
  const type  = interaction.options.getString('type');
  const value = interaction.options.getString('value').trim();
  setConfig(type, value);
  const label = type === 'default_proxy_trigger' ? 'Default proxy trigger' : 'Edit prefix';
  await interaction.reply({ embeds: [successEmbed(`${label} set to \`${value}\`.`)], ephemeral: true });
}

async function handleLimitsSet(interaction) {
  const type     = interaction.options.getString('type');
  const rawValue = interaction.options.getString('timeout-duration') ?? interaction.options.getString('value');
  const value    = rawValue.trim();

  if (isNaN(Number(value))) {
    return interaction.reply({ embeds: [errorEmbed('Value must be a number.')], ephemeral: true });
  }

  setConfig(type, value);
  const labels = {
    max_characters_per_user: 'Max characters per user',
    max_timeout_duration:    'Max timeout duration',
    mood_auto_expire_hours:  'Mood auto-expire hours',
  };
  await interaction.reply({ embeds: [successEmbed(`**${labels[type]}** set to \`${value}\`.`)], ephemeral: true });
}

async function handleLoggingSet(interaction) {
  const type    = interaction.options.getString('type');
  const enabled = interaction.options.getBoolean('enabled');
  setConfig(type, String(enabled));
  const labels = {
    proxy_logging_enabled: 'Proxy logging',
    mod_logging_enabled:   'Mod action logging',
    log_edits:             'Edit logging',
    log_deletes:           'Delete logging',
  };
  await interaction.reply({ embeds: [successEmbed(`**${labels[type]}** ${enabled ? 'enabled' : 'disabled'}.`)], ephemeral: true });
}

async function handleListAdd(interaction) {
  const list  = interaction.options.getString('list');
  const value = interaction.options.getString('value').trim();
  addToList(list, value, interaction.user.id);
  await interaction.reply({ embeds: [successEmbed(`\`${value}\` added to the **${list}** list.`)], ephemeral: true });
}

async function handleListRemove(interaction) {
  const list  = interaction.options.getString('list');
  const value = interaction.options.getString('value').trim();
  removeFromList(list, value);
  await interaction.reply({ embeds: [successEmbed(`\`${value}\` removed from the **${list}** list.`)], ephemeral: true });
}

async function handleListView(interaction) {
  const list  = interaction.options.getString('list');
  const items = getList(list);
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`${list.charAt(0).toUpperCase() + list.slice(1)} List`)
    .setDescription(items.length === 0 ? '*Empty*' : items.map(v => `• ${v}`).join('\n'));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleConfigView(interaction) {
  const config = getAllConfig();
  const lines  = Object.entries(config).map(([k, v]) => `\`${k}\` → \`${v || '(not set)'}\``);
  const embed  = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Current Config')
    .setDescription(lines.join('\n').slice(0, 4000));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Template handlers ─────────────────────────────────────────────────────────

async function handleTemplateCreate(interaction) {
  const name        = interaction.options.getString('name').trim();
  const description = interaction.options.getString('description')?.trim() ?? null;
  const clan        = interaction.options.getString('clan') ?? null;
  const rank        = interaction.options.getString('rank') ?? null;
  createTemplate({ name, description, preset_clan: clan, preset_rank: rank, created_by: interaction.user.id });
  await interaction.reply({ embeds: [successEmbed(`Template **${name}** created.`)], ephemeral: true });
}

async function handleTemplateDelete(interaction) {
  const name = interaction.options.getString('name');
  deleteTemplate(name);
  await interaction.reply({ embeds: [successEmbed(`Template **${name}** deleted.`)], ephemeral: true });
}

async function handleTemplateList(interaction) {
  const templates = getTemplates();
  const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle('Character Templates')
    .setDescription(
      templates.length === 0
        ? '*No templates yet.*'
        : templates.map(t =>
            `**${t.name}**${t.description ? ` — ${t.description}` : ''}` +
            (t.preset_clan ? ` · Clan: ${t.preset_clan}` : '') +
            (t.preset_rank ? ` · Rank: ${t.preset_rank}` : '')
          ).join('\n')
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Shared / NPC handlers ─────────────────────────────────────────────────────

async function handleSharedCreate(interaction) {
  const attachment = interaction.options.getAttachment('file-avatar');
  let avatarUrl = null;

  if (attachment) {
    if (!attachment.contentType?.startsWith('image/')) {
      return interaction.reply({ embeds: [errorEmbed('file-avatar must be an image.')], ephemeral: true });
    }
    avatarUrl = attachment.url;
  }

  pendingCreations.set(interaction.id, { avatarUrl, shared: true, creatorId: interaction.user.id });
  setTimeout(() => pendingCreations.delete(interaction.id), 10 * 60 * 1000);

  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`shared_create:${interaction.id}`)
    .setTitle('Create Shared / NPC Character')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('pronouns').setLabel('Pronouns').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50).setPlaceholder('e.g. she/her')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('trigger').setLabel('Proxy Trigger').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50).setPlaceholder('e.g. NPC: or [NPC]')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('avatar').setLabel('Avatar URL').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(512).setPlaceholder('Leave blank if uploading a file above')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('bio').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
      ),
    );

  await interaction.showModal(modal);
}

export async function handleSharedCreateModal(interaction, commandInteractionId) {
  const pending = pendingCreations.get(commandInteractionId);
  pendingCreations.delete(commandInteractionId);

  const name      = interaction.fields.getTextInputValue('name').trim();
  const pronouns  = interaction.fields.getTextInputValue('pronouns').trim() || null;
  const trigger   = interaction.fields.getTextInputValue('trigger').trim();
  const avatarInput = interaction.fields.getTextInputValue('avatar').trim() || null;
  const bio       = interaction.fields.getTextInputValue('bio').trim() || null;
  const avatarUrl = pending?.avatarUrl ?? avatarInput;
  const creatorId = pending?.creatorId ?? interaction.user.id;

  createCharacter({
    owner_id:   creatorId,
    name, pronouns, trigger,
    avatar_url: avatarUrl,
    bio,
    is_shared:  true,
  });

  await interaction.reply({
    embeds: [successEmbed(
      `Shared character **${name}** created.\nUse \`/character-admin shared grant\` to assign access by user or role.`
    )],
    ephemeral: true,
  });
}

async function handleSharedDelete(interaction, client) {
  const name = interaction.options.getString('name');
  const char = getSharedCharacterByName(name);
  if (!char) return interaction.reply({ embeds: [errorEmbed('Shared character not found.')], ephemeral: true });

  deleteCharacter(char.id);
  await discordLogMod(client, {
    moderator: interaction.user,
    target: interaction.user,
    action: 'Shared Character Delete',
    reason: 'Deleted by senior staff',
    extra: `Character: **${char.name}**`,
  });
  await interaction.reply({ embeds: [successEmbed(`**${char.name}** deleted.`)], ephemeral: true });
}

async function handleSharedList(interaction) {
  const shared = getSharedCharacters();
  const embed  = new EmbedBuilder().setColor(0x2b2d31).setTitle('Shared / NPC Characters')
    .setDescription(
      shared.length === 0
        ? '*No shared characters yet.*'
        : shared.map(c =>
            `**${c.name}** · \`${c.trigger}\`` +
            (c.clan ? ` · ${c.clan}` : '') +
            (c.rank ? ` · ${c.rank}` : '') +
            ` · ${c.message_count} posts`
          ).join('\n')
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSharedGrant(interaction) {
  const name = interaction.options.getString('name');
  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');

  if (!user && !role) {
    return interaction.reply({ embeds: [errorEmbed('Provide at least one of: `user` or `role`.')], ephemeral: true });
  }

  const char = getSharedCharacterByName(name);
  if (!char) return interaction.reply({ embeds: [errorEmbed('Shared character not found.')], ephemeral: true });

  if (user) grantAccess(char.id, user.id, null, interaction.user.id);
  if (role) grantAccess(char.id, null, role.id, interaction.user.id);

  const targets = [user && `<@${user.id}>`, role && `<@&${role.id}>`].filter(Boolean).join(' and ');
  await interaction.reply({
    embeds: [successEmbed(`Access to **${char.name}** granted to ${targets}.`)],
    ephemeral: true,
  });
}

async function handleSharedRevoke(interaction) {
  const name = interaction.options.getString('name');
  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');

  if (!user && !role) {
    return interaction.reply({ embeds: [errorEmbed('Provide at least one of: `user` or `role`.')], ephemeral: true });
  }

  const char = getSharedCharacterByName(name);
  if (!char) return interaction.reply({ embeds: [errorEmbed('Shared character not found.')], ephemeral: true });

  if (user) revokeAccess(char.id, user.id, null);
  if (role) revokeAccess(char.id, null, role.id);

  const targets = [user && `<@${user.id}>`, role && `<@&${role.id}>`].filter(Boolean).join(' and ');
  await interaction.reply({
    embeds: [successEmbed(`Access to **${char.name}** revoked from ${targets}.`)],
    ephemeral: true,
  });
}

async function handleSharedAccess(interaction) {
  const name = interaction.options.getString('name');
  const char = getSharedCharacterByName(name);
  if (!char) return interaction.reply({ embeds: [errorEmbed('Shared character not found.')], ephemeral: true });

  const grants = getAccessList(char.id);
  const users  = grants.filter(g => g.grantee_user_id).map(g => `<@${g.grantee_user_id}>`);
  const roles  = grants.filter(g => g.grantee_role_id).map(g => `<@&${g.grantee_role_id}>`);

  const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle(`Access — ${char.name}`)
    .addFields(
      { name: 'Users',  value: users.join('\n').slice(0, 1024)  || '*None*', inline: true },
      { name: 'Roles',  value: roles.join('\n').slice(0, 1024)  || '*None*', inline: true },
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Relationship type handlers ────────────────────────────────────────────────

async function handleRelTypeAdd(interaction) {
  const value = interaction.options.getString('value').trim().toLowerCase();
  addRelationshipType(value, interaction.user.id);
  await interaction.reply({ embeds: [successEmbed(`Relationship type **${value}** added.`)], ephemeral: true });
}

async function handleRelTypeRemove(interaction) {
  const value = interaction.options.getString('value').trim();
  removeRelationshipType(value);
  await interaction.reply({ embeds: [successEmbed(`Relationship type **${value}** removed.`)], ephemeral: true });
}

async function handleRelTypeList(interaction) {
  const types = getRelationshipTypes();
  const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle('Relationship Types')
    .setDescription(types.length === 0 ? '*None configured.*' : types.map(t => `• ${t}`).join('\n'));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Staff relationship management handlers ────────────────────────────────────

async function handleStaffRelList(interaction) {
  const user      = interaction.options.getUser('user');
  const charName  = interaction.options.getString('character');
  const chars     = getUserCharacters(user.id);
  const char      = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const approved = getApprovedRelationships(char.id);
  const pending  = getPendingRelationshipsForUser(user.id).filter(r => r.requester_char_id === char.id || r.target_char_id === char.id);

  const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle(`Relationships — ${char.name}`);
  const lines = [];

  if (approved.length) {
    lines.push('**Approved:**');
    approved.forEach(r => lines.push(`ID \`${r.id}\` · *${r.relationship_type}* to **${r.target_name}**`));
  }
  if (pending.length) {
    lines.push('\n**Pending:**');
    pending.forEach(r => lines.push(`ID \`${r.id}\` · *${r.relationship_type}* · ${r.requester_name} → ${r.target_name}`));
  }
  if (!lines.length) lines.push('No relationships on record.');

  embed.setDescription(lines.join('\n'));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStaffRelRemove(interaction) {
  const relId = interaction.options.getInteger('relationship-id');
  const rel   = getRelationshipById(relId);
  if (!rel) return interaction.reply({ embeds: [errorEmbed('Relationship not found.')], ephemeral: true });

  deleteRelationship(relId);
  await interaction.reply({ embeds: [successEmbed(`Relationship \`${relId}\` removed.`)], ephemeral: true });
}
