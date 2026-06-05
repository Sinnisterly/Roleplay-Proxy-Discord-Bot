import {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  AttachmentBuilder, EmbedBuilder,
} from 'discord.js';
import {
  createCharacter, getUserCharacters, updateCharacter,
  deleteCharacter, setDefaultCharacter, clearDefaultCharacter,
  setMood, setCharacterStatus, setCharacterColor,
  addAlias, removeAlias, getAliasesForCharacter,
  setChannelAutopilot, clearChannelAutopilot, getChannelAutopilotList,
  createRelationshipRequest, getPendingRelationshipsForUser,
  approveRelationship, deleteRelationship, getApprovedRelationships,
  hasPendingRelationships, searchCharacters,
} from '../db/queries/characters.js';
import { getList, getConfig, getRelationshipTypes } from '../db/queries/config.js';
import { getUserProxyHistory } from '../db/queries/proxy.js';
import { requireRoleplayer } from '../utils/guards.js';
import { characterEmbed, characterListEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { pendingCreations } from '../utils/pendingState.js';

const CHARS_PER_PAGE = 5;

// --- Command definition ---

export const data = new SlashCommandBuilder()
  .setName('character')
  .setDescription('Manage your characters')
  .addSubcommand(s => s
    .setName('create')
    .setDescription('Create a new character')
    .addAttachmentOption(o => o.setName('file-avatar').setDescription('Upload an image as avatar').setRequired(false))
  )
  .addSubcommand(s => s
    .setName('edit')
    .setDescription('Edit a character\'s basic info')
    .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(s => s
    .setName('profile')
    .setDescription('Set extended profile fields (clan, rank, info, etc.)')
    .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('clan').setDescription('Clan or group').setRequired(false).setAutocomplete(true))
    .addStringOption(o => o.setName('rank').setDescription('Rank').setRequired(false).setAutocomplete(true))
    .addIntegerOption(o => o.setName('age-moons').setDescription('Age in moons').setRequired(false).setMinValue(0))
    .addStringOption(o => o.setName('birthday').setDescription('IC birthday (e.g. "Newleaf, first moon")').setRequired(false))
    .addStringOption(o => o.setName('oc-doc-url').setDescription('Link to OC document').setRequired(false))
  )
  .addSubcommand(s => s
    .setName('lore')
    .setDescription('Set appearance, personality, and backstory (opens a form)')
    .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(s => s
    .setName('delete')
    .setDescription('Delete a character')
    .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(s => s
    .setName('list')
    .setDescription('View your characters (or another user\'s)')
    .addUserOption(o => o.setName('user').setDescription('User to view characters for').setRequired(false))
  )
  .addSubcommand(s => s
    .setName('view')
    .setDescription('View a character\'s full profile')
    .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
    .addUserOption(o => o.setName('user').setDescription('Character owner (if not you)').setRequired(false))
  )
  .addSubcommand(s => s
    .setName('preview')
    .setDescription('Preview how a character\'s proxy message will look')
    .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
  )
  .addSubcommandGroup(g => g
    .setName('default')
    .setDescription('Manage your default proxy character')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set your default character for !!p trigger')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(s => s.setName('clear').setDescription('Clear your default character'))
  )
  .addSubcommandGroup(g => g
    .setName('mood')
    .setDescription('Manage a character\'s current mood/state')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set a mood for a character')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(s => s
      .setName('clear')
      .setDescription('Clear a character\'s current mood')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
    )
  )
  .addSubcommand(s => s
    .setName('export')
    .setDescription('Export your proxy history as a text file')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to export from (optional)').setRequired(false))
  )
  .addSubcommand(s => s
    .setName('tupper-import')
    .setDescription('Import a character from a Tupperbox JSON export file')
    .addAttachmentOption(o => o.setName('file').setDescription('Your Tupperbox .json export file').setRequired(true))
  )
  .addSubcommandGroup(g => g
    .setName('alias')
    .setDescription('Manage extra proxy triggers for a character')
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add an alias trigger')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('trigger').setDescription('New trigger').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove an alias trigger')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('trigger').setDescription('Trigger to remove').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all alias triggers for a character')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
    )
  )
  .addSubcommandGroup(g => g
    .setName('channel-proxy')
    .setDescription('Set a per-channel default character for the proxy trigger')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set a character as your default for a specific channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(s => s
      .setName('clear')
      .setDescription('Clear the per-channel default for a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
    )
    .addSubcommand(s => s.setName('list').setDescription('List all your per-channel defaults'))
  )
  .addSubcommand(s => s
    .setName('status')
    .setDescription('Set a character\'s status (active, deceased, retired)')
    .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o
      .setName('status')
      .setDescription('New status')
      .setRequired(true)
      .addChoices(
        { name: 'Active',   value: 'active' },
        { name: 'Deceased', value: 'deceased' },
        { name: 'Retired',  value: 'retired' },
      )
    )
  )
  .addSubcommand(s => s
    .setName('color')
    .setDescription('Set a character\'s profile color')
    .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true))
  )
  .addSubcommandGroup(g => g
    .setName('relationship')
    .setDescription('Manage IC relationships between characters')
    .addSubcommand(s => s
      .setName('request')
      .setDescription('Request an IC relationship with another character')
      .addStringOption(o => o.setName('my-character').setDescription('Your character').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('type').setDescription('Relationship type').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('their-character').setDescription('Their character (name, will search all)').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(s => s.setName('pending').setDescription('View and approve/deny pending relationship requests'))
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove a relationship from your character')
      .addStringOption(o => o.setName('my-character').setDescription('Your character').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('relationship').setDescription('Relationship to remove').setRequired(true).setAutocomplete(true))
    )
  )
  .addSubcommand(s => s
    .setName('search')
    .setDescription('Search for characters across the server')
    .addStringOption(o => o.setName('name').setDescription('Character name (partial match)').setRequired(false))
    .addStringOption(o => o.setName('clan').setDescription('Filter by clan').setRequired(false).setAutocomplete(true))
    .addStringOption(o => o.setName('rank').setDescription('Filter by rank').setRequired(false).setAutocomplete(true))
  )
  .addSubcommand(s => s.setName('leaderboard').setDescription('See the most active characters on the server'));

// --- Execute ---

export async function execute(interaction, client) {
  if (!await requireRoleplayer(interaction)) return;

  const sub = interaction.options.getSubcommandGroup(false)
    ? `${interaction.options.getSubcommandGroup()}/${interaction.options.getSubcommand()}`
    : interaction.options.getSubcommand();

  switch (sub) {
    case 'create':      return handleCreate(interaction);
    case 'edit':        return handleEdit(interaction);
    case 'profile':     return handleProfile(interaction);
    case 'lore':        return handleLore(interaction);
    case 'delete':      return handleDelete(interaction);
    case 'list':        return handleList(interaction);
    case 'view':        return handleView(interaction);
    case 'preview':     return handlePreview(interaction);
    case 'default/set': return handleDefaultSet(interaction);
    case 'default/clear': return handleDefaultClear(interaction);
    case 'mood/set':    return handleMoodSet(interaction);
    case 'mood/clear':  return handleMoodClear(interaction);
    case 'export':        return handleExport(interaction);
    case 'tupper-import': return handleTupperImport(interaction);
    case 'alias/add':     return handleAliasAdd(interaction);
    case 'alias/remove':  return handleAliasRemove(interaction);
    case 'alias/list':    return handleAliasList(interaction);
    case 'channel-proxy/set':   return handleChannelProxySet(interaction);
    case 'channel-proxy/clear': return handleChannelProxyClear(interaction);
    case 'channel-proxy/list':  return handleChannelProxyList(interaction);
    case 'status':              return handleStatus(interaction);
    case 'color':               return handleColor(interaction);
    case 'relationship/request': return handleRelationshipRequest(interaction);
    case 'relationship/pending': return handleRelationshipPending(interaction);
    case 'relationship/remove':  return handleRelationshipRemove(interaction);
    case 'search':      return handleSearch(interaction);
    case 'leaderboard': return handleLeaderboard(interaction);
  }
}

// --- Autocomplete ---

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const userId  = interaction.user.id;
  const sub     = interaction.options.getSubcommand(false);
  const group   = interaction.options.getSubcommandGroup(false);

  // My own characters (most subcommands)
  if (focused.name === 'name' || focused.name === 'my-character') {
    const chars = getUserCharacters(userId);
    return interaction.respond(
      chars.filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25).map(c => ({ name: c.name, value: c.name }))
    );
  }

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

  // Relationship type autocomplete
  if (focused.name === 'type') {
    const types = getRelationshipTypes();
    return interaction.respond(
      types.filter(v => v.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25).map(v => ({ name: v, value: v }))
    );
  }

  // Their character: search every character except the user's own
  if (focused.name === 'their-character') {
    const results = searchCharacters({ name: focused.value || undefined });
    return interaction.respond(
      results.filter(c => c.owner_id !== userId)
        .slice(0, 25)
        .map(c => ({ name: `${c.name}`, value: String(c.id) }))
    );
  }

  // Relationship remove: suggest the character's existing approved relationships
  if (focused.name === 'relationship' && group === 'relationship' && sub === 'remove') {
    const charName = interaction.options.getString('my-character');
    if (!charName) return interaction.respond([]);
    const chars = getUserCharacters(userId);
    const char  = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
    if (!char)  return interaction.respond([]);
    const rels  = getApprovedRelationships(char.id);
    return interaction.respond(
      rels.filter(r => r.relationship_type.toLowerCase().includes(focused.value.toLowerCase()) ||
                       r.target_name.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25)
        .map(r => ({ name: `${r.relationship_type} to ${r.target_name}`, value: String(r.id) }))
    );
  }
}

// --- Subcommand handlers ---

async function handleCreate(interaction) {
  const attachment = interaction.options.getAttachment('file-avatar');
  let avatarUrl = null;

  if (attachment) {
    if (!attachment.contentType?.startsWith('image/')) {
      return interaction.reply({ embeds: [errorEmbed('The file-avatar must be an image.')], ephemeral: true });
    }
    avatarUrl = attachment.url;
  }

  // Store pending avatar keyed to interaction ID
  pendingCreations.set(interaction.id, { avatarUrl });
  setTimeout(() => pendingCreations.delete(interaction.id), 10 * 60 * 1000);

  const modal = new ModalBuilder()
    .setCustomId(`char_create:${interaction.id}`)
    .setTitle('Create Character')
    .addComponents(
      row(text('name',    'Name',         TextInputStyle.Short,     true,  null, 1, 80)),
      row(text('pronouns','Pronouns',     TextInputStyle.Short,     false, 'e.g. she/her', 1, 50)),
      row(text('trigger', 'Proxy Trigger',TextInputStyle.Short,     true,  'e.g. Mira: or [Mira]', 1, 50)),
      row(text('avatar',  'Avatar URL',   TextInputStyle.Short,     false, 'Leave blank if uploading a file above', 1, 512)),
      row(text('bio',     'Bio',          TextInputStyle.Paragraph, false, null, 1, 1000)),
    );

  await interaction.showModal(modal);
}

export async function handleCharacterCreateModal(interaction, commandInteractionId) {
  const pending = pendingCreations.get(commandInteractionId);
  pendingCreations.delete(commandInteractionId);

  const name    = interaction.fields.getTextInputValue('name').trim();
  const pronouns= interaction.fields.getTextInputValue('pronouns').trim() || null;
  const trigger = interaction.fields.getTextInputValue('trigger').trim();
  const avatarInput = interaction.fields.getTextInputValue('avatar').trim() || null;
  const bio     = interaction.fields.getTextInputValue('bio').trim() || null;
  const userId  = interaction.user.id;

  const avatarUrl = pending?.avatarUrl ?? avatarInput;

  const maxChars = parseInt(getConfig('max_characters_per_user') ?? '20');
  const existing = getUserCharacters(userId);
  if (countActive(existing) >= maxChars) {
    return interaction.reply({ embeds: [errorEmbed(`You have reached the character limit (${maxChars}). Deceased or retired characters do not count.`)], ephemeral: true });
  }

  // Check trigger uniqueness for this user
  if (existing.some(c => c.trigger.toLowerCase() === trigger.toLowerCase())) {
    return interaction.reply({ embeds: [errorEmbed(`You already have a character with the trigger \`${trigger}\`.`)], ephemeral: true });
  }

  createCharacter({ owner_id: userId, name, pronouns, trigger, avatar_url: avatarUrl, bio });

  await interaction.reply({ embeds: [
    successEmbed(`**${name}** created!`).addFields(
      { name: 'Trigger', value: `\`${trigger}\``, inline: true },
      { name: 'Next steps', value: 'Use `/character profile` to set clan, rank, and other details.\nUse `/character lore` to add appearance and backstory.' }
    )
  ], ephemeral: true });
}

async function handleEdit(interaction) {
  const charName = interaction.options.getString('name');
  const chars = getUserCharacters(interaction.user.id);
  const char = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId(`char_edit:${char.id}`)
    .setTitle(`Edit - ${char.name}`)
    .addComponents(
      row(text('name',    'Name',         TextInputStyle.Short,     true,  null,                                    1, 80,  char.name)),
      row(text('pronouns','Pronouns',     TextInputStyle.Short,     false, 'e.g. she/her',                          1, 50,  char.pronouns ?? '')),
      row(text('trigger', 'Proxy Trigger',TextInputStyle.Short,     true,  'e.g. Mira: or [Mira]',                  1, 50,  char.trigger)),
      row(text('avatar',  'Avatar URL',   TextInputStyle.Short,     false, 'Leave blank to keep current',           1, 512, char.avatar_url ?? '')),
      row(text('bio',     'Bio',          TextInputStyle.Paragraph, false, null,                                    1, 1000, char.bio ?? '')),
    );

  await interaction.showModal(modal);
}

export async function handleCharacterEditModal(interaction, charId) {
  const chars = getUserCharacters(interaction.user.id);
  const owned = chars.find(c => c.id === charId);
  if (!owned) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const name     = interaction.fields.getTextInputValue('name').trim();
  const pronouns = interaction.fields.getTextInputValue('pronouns').trim() || null;
  const trigger  = interaction.fields.getTextInputValue('trigger').trim();
  const avatar   = interaction.fields.getTextInputValue('avatar').trim() || owned.avatar_url;
  const bio      = interaction.fields.getTextInputValue('bio').trim() || null;

  // Check trigger uniqueness (excluding self)
  if (chars.some(c => c.id !== charId && c.trigger.toLowerCase() === trigger.toLowerCase())) {
    return interaction.reply({ embeds: [errorEmbed(`Another character already uses the trigger \`${trigger}\`.`)], ephemeral: true });
  }

  updateCharacter(charId, { name, pronouns, trigger, avatar_url: avatar, bio });
  await interaction.reply({ embeds: [successEmbed(`**${name}** updated.`)], ephemeral: true });
}

async function handleProfile(interaction) {
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const updates = {};
  const clan      = interaction.options.getString('clan');
  const rank      = interaction.options.getString('rank');
  const ageMoons  = interaction.options.getInteger('age-moons');
  const birthday  = interaction.options.getString('birthday');
  const ocDocUrl  = interaction.options.getString('oc-doc-url');

  if (clan     !== null) updates.clan         = clan;
  if (rank     !== null) updates.rank         = rank;
  if (ageMoons !== null) updates.age_moons    = ageMoons;
  if (birthday !== null) updates.ic_birthday  = birthday;
  if (ocDocUrl !== null) updates.oc_doc_url   = ocDocUrl;

  if (Object.keys(updates).length === 0) {
    return interaction.reply({ embeds: [errorEmbed('No fields provided to update.')], ephemeral: true });
  }

  updateCharacter(char.id, updates);
  await interaction.reply({ embeds: [successEmbed(`Profile updated for **${char.name}**.`)], ephemeral: true });
}

async function handleLore(interaction) {
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId(`char_profile:${char.id}`)
    .setTitle(`Lore - ${char.name}`)
    .addComponents(
      row(text('appearance',  'Appearance',  TextInputStyle.Paragraph, false, null, 0, 1000, char.appearance)),
      row(text('personality', 'Personality', TextInputStyle.Paragraph, false, null, 0, 1000, char.personality)),
      row(text('backstory',   'Backstory',   TextInputStyle.Paragraph, false, null, 0, 1000, char.backstory)),
    );

  await interaction.showModal(modal);
}

export async function handleProfileModal(interaction, charId) {
  const chars = getUserCharacters(interaction.user.id);
  const owned = chars.find(c => c.id === charId);
  if (!owned) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const appearance  = interaction.fields.getTextInputValue('appearance').trim()  || null;
  const personality = interaction.fields.getTextInputValue('personality').trim() || null;
  const backstory   = interaction.fields.getTextInputValue('backstory').trim()   || null;

  updateCharacter(charId, { appearance, personality, backstory });
  await interaction.reply({ embeds: [successEmbed(`Lore updated for **${owned.name}**.`)], ephemeral: true });
}

async function handleDelete(interaction) {
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const confirm = new ButtonBuilder()
    .setCustomId(`char_delete_confirm:${char.id}`)
    .setLabel('Yes, delete')
    .setStyle(ButtonStyle.Danger);

  const cancel = new ButtonBuilder()
    .setCustomId('char_delete_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`Delete **${char.name}**? This cannot be undone.`)],
    components: [new ActionRowBuilder().addComponents(confirm, cancel)],
    ephemeral: true,
  });
}

export async function handleDeleteConfirm(interaction, charId) {
  const chars = getUserCharacters(interaction.user.id);
  const owned = chars.find(c => c.id === charId);
  if (!owned) return interaction.update({ content: 'Character not found.', embeds: [], components: [] });

  deleteCharacter(charId);
  await interaction.update({ embeds: [successEmbed(`**${owned.name}** has been deleted.`)], components: [] });
}

async function handleList(interaction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const member     = interaction.guild.members.cache.get(targetUser.id)
    ?? await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  const chars      = getUserCharacters(targetUser.id);
  const page       = 0;
  const total      = Math.max(1, Math.ceil(chars.length / CHARS_PER_PAGE));
  const slice      = chars.slice(0, CHARS_PER_PAGE);
  const isOwnList  = targetUser.id === interaction.user.id;
  const pendingNote = isOwnList && hasPendingRelationships(interaction.user.id);

  const invokerId  = interaction.user.id;
  const embed      = characterListEmbed(slice, member ?? targetUser, 1, total, pendingNote);
  const components = buildListComponents(slice, page, total, targetUser.id, invokerId);

  await interaction.reply({ embeds: [embed], components, ephemeral: false });
}

export async function handleListPage(interaction, [pageStr, userId, invokerId]) {
  if (interaction.user.id !== invokerId) {
    return interaction.reply({ embeds: [errorEmbed('This menu belongs to someone else.')], ephemeral: true });
  }

  const page       = parseInt(pageStr);
  const targetUser = await interaction.client.users.fetch(userId).catch(() => null);
  if (!targetUser) return interaction.update({ content: 'User not found.', components: [] });

  const member = interaction.guild.members.cache.get(userId)
    ?? await interaction.guild.members.fetch(userId).catch(() => null);

  const chars       = getUserCharacters(userId);
  const total       = Math.max(1, Math.ceil(chars.length / CHARS_PER_PAGE));
  const clampedPage = Math.min(Math.max(0, page), total - 1);
  const slice       = chars.slice(clampedPage * CHARS_PER_PAGE, (clampedPage + 1) * CHARS_PER_PAGE);

  const embed      = characterListEmbed(slice, member ?? targetUser, clampedPage + 1, total);
  const components = buildListComponents(slice, clampedPage, total, userId, invokerId);

  await interaction.update({ embeds: [embed], components });
}

export async function handleListCharSelect(interaction, [userId, pageStr, invokerId]) {
  if (interaction.user.id !== invokerId) {
    return interaction.reply({ embeds: [errorEmbed('This menu belongs to someone else.')], ephemeral: true });
  }

  const charId     = parseInt(interaction.values[0]);
  const targetUser = await interaction.client.users.fetch(userId).catch(() => null);
  const chars      = getUserCharacters(userId);
  const char       = chars.find(c => c.id === charId);
  if (!char) return interaction.update({ content: 'Character not found.', embeds: [], components: [] });

  const back = new ButtonBuilder()
    .setCustomId(`char_list_page:${pageStr}:${userId}:${invokerId}`)
    .setLabel('← Back to list')
    .setStyle(ButtonStyle.Secondary);

  await interaction.update({
    embeds: [characterEmbed(char, targetUser)],
    components: [new ActionRowBuilder().addComponents(back)],
  });
}

function buildListComponents(chars, page, total, userId, invokerId) {
  const rows = [];

  if (chars.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`char_list_select:${userId}:${page}:${invokerId}`)
      .setPlaceholder('View a character\'s profile...')
      .addOptions(chars.map(c => ({
        label: c.name.slice(0, 100),
        description: [c.clan, c.rank].filter(Boolean).join(' · ').slice(0, 100) || 'No clan/rank set',
        value: String(c.id),
      })));
    rows.push(new ActionRowBuilder().addComponents(select));
  }

  if (total > 1) {
    const prev = new ButtonBuilder()
      .setCustomId(`char_list_page:${page - 1}:${userId}:${invokerId}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0);
    const next = new ButtonBuilder()
      .setCustomId(`char_list_page:${page + 1}:${userId}:${invokerId}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= total - 1);
    rows.push(new ActionRowBuilder().addComponents(prev, next));
  }

  return rows;
}

async function handleView(interaction) {
  const charName   = interaction.options.getString('name');
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const chars      = getUserCharacters(targetUser.id);
  const char       = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  await interaction.reply({ embeds: [characterEmbed(char, targetUser)], ephemeral: false });
}

async function handlePreview(interaction) {
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  let username = char.name;
  if (char.pronouns) username += ` (${char.pronouns})`;
  if (char.current_mood) username += ` [${char.current_mood}]`;

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: username.slice(0, 80), iconURL: char.avatar_url ?? undefined })
    .setDescription('This is a preview of how your proxy messages will appear.')
    .setFooter({ text: `Trigger: ${char.trigger}` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleDefaultSet(interaction) {
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  setDefaultCharacter(interaction.user.id, char.id);
  const trigger = getConfig('default_proxy_trigger') ?? '!!';
  await interaction.reply({ embeds: [successEmbed(`**${char.name}** is now your default character. Type \`${trigger} message\` to proxy as them without a trigger.`)], ephemeral: true });
}

async function handleDefaultClear(interaction) {
  clearDefaultCharacter(interaction.user.id);
  await interaction.reply({ embeds: [successEmbed('Default character cleared.')], ephemeral: true });
}

async function handleMoodSet(interaction) {
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const moods = getList('mood');
  if (moods.length === 0) {
    return interaction.reply({ embeds: [errorEmbed('No moods have been configured yet. Ask a staff member to add some.')], ephemeral: true });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`char_mood_select:${char.id}`)
    .setPlaceholder('Select a mood...')
    .addOptions(moods.slice(0, 25).map(m => ({ label: m, value: m })));

  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`Select a mood for **${char.name}**:`)],
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}

export async function handleMoodSelect(interaction, charId) {
  const chars = getUserCharacters(interaction.user.id);
  const owned = chars.find(c => c.id === charId);
  if (!owned) return interaction.update({ content: 'Character not found.', embeds: [], components: [] });

  const mood = interaction.values[0];
  const expireHours = parseInt(getConfig('mood_auto_expire_hours') ?? '24');
  const expiresAt   = Date.now() + expireHours * 60 * 60 * 1000;

  setMood(charId, mood, expiresAt);
  await interaction.update({
    embeds: [successEmbed(`**${owned.name}**'s mood set to **${mood}**. Auto-clears in ${expireHours}h.`)],
    components: [],
  });
}

async function handleMoodClear(interaction) {
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  setMood(char.id, null, null);
  await interaction.reply({ embeds: [successEmbed(`Mood cleared for **${char.name}**.`)], ephemeral: true });
}

async function handleExport(interaction) {
  const channel = interaction.options.getChannel('channel');
  const records = getUserProxyHistory(interaction.user.id, channel?.id ?? null);

  if (records.length === 0) {
    return interaction.reply({ embeds: [errorEmbed('No proxy history found.')], ephemeral: true });
  }

  const lines = records.map(r => {
    const date = new Date(r.sent_at).toISOString();
    return `[${date}] ${r.character_name}: ${r.content}`;
  });

  const buffer = Buffer.from(lines.join('\n'), 'utf-8');
  const file   = new AttachmentBuilder(buffer, { name: 'proxy-export.txt' });

  await interaction.reply({ files: [file], ephemeral: true });
}

// --- Alias handlers ---

async function handleAliasAdd(interaction) {
  const charName = interaction.options.getString('name');
  const trigger  = interaction.options.getString('trigger').trim();
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  if (chars.some(c => c.trigger.toLowerCase() === trigger.toLowerCase())) {
    return interaction.reply({ embeds: [errorEmbed(`\`${trigger}\` is already a main trigger.`)], ephemeral: true });
  }

  addAlias(char.id, trigger);
  await interaction.reply({ embeds: [successEmbed(`Alias \`${trigger}\` added to **${char.name}**. Both triggers now work.`)], ephemeral: true });
}

async function handleAliasRemove(interaction) {
  const charName = interaction.options.getString('name');
  const trigger  = interaction.options.getString('trigger').trim();
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  removeAlias(char.id, trigger);
  await interaction.reply({ embeds: [successEmbed(`Alias \`${trigger}\` removed from **${char.name}**.`)], ephemeral: true });
}

async function handleAliasList(interaction) {
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const aliases = getAliasesForCharacter(char.id);
  const embed   = new EmbedBuilder().setColor(char.color ?? 0x2b2d31).setTitle(`Aliases - ${char.name}`)
    .setDescription(
      aliases.length === 0
        ? `No aliases set. Main trigger: \`${char.trigger}\``
        : `Main trigger: \`${char.trigger}\`\nAliases:\n${aliases.map(a => `• \`${a.trigger}\``).join('\n')}`
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// --- Channel autopilot handlers ---

async function handleChannelProxySet(interaction) {
  const channel  = interaction.options.getChannel('channel');
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  setChannelAutopilot(interaction.user.id, channel.id, char.id);
  const trigger = getConfig('default_proxy_trigger') ?? '!!';
  await interaction.reply({
    embeds: [successEmbed(`In ${channel}, \`${trigger}\` will now proxy as **${char.name}**.`)],
    ephemeral: true,
  });
}

async function handleChannelProxyClear(interaction) {
  const channel = interaction.options.getChannel('channel');
  clearChannelAutopilot(interaction.user.id, channel.id);
  await interaction.reply({ embeds: [successEmbed(`Channel default cleared for ${channel}.`)], ephemeral: true });
}

const CHANNEL_PROXY_PER_PAGE = 20;

function buildChannelProxyView(list, page, invokerId) {
  const total = Math.max(1, Math.ceil(list.length / CHANNEL_PROXY_PER_PAGE));
  const clamped = Math.min(Math.max(0, page), total - 1);
  const slice = list.slice(clamped * CHANNEL_PROXY_PER_PAGE, (clamped + 1) * CHANNEL_PROXY_PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Your Channel Defaults')
    .setDescription(
      list.length === 0
        ? 'No per-channel defaults set.'
        : slice.map(r => `<#${r.channel_id}> → **${r.character_name}**`).join('\n')
    )
    .setFooter({ text: `Page ${clamped + 1}/${total} · ${list.length} total` });

  const components = [];
  if (total > 1) {
    const prev = new ButtonBuilder()
      .setCustomId(`channel_proxy_page:${clamped - 1}:${invokerId}`)
      .setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(clamped === 0);
    const next = new ButtonBuilder()
      .setCustomId(`channel_proxy_page:${clamped + 1}:${invokerId}`)
      .setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(clamped >= total - 1);
    components.push(new ActionRowBuilder().addComponents(prev, next));
  }

  return { embed, components };
}

async function handleChannelProxyList(interaction) {
  const list = getChannelAutopilotList(interaction.user.id);
  const { embed, components } = buildChannelProxyView(list, 0, interaction.user.id);
  await interaction.reply({ embeds: [embed], components, ephemeral: true });
}

export async function handleChannelProxyListPage(interaction, [pageStr, invokerId]) {
  if (interaction.user.id !== invokerId) {
    return interaction.reply({ embeds: [errorEmbed('This menu belongs to someone else.')], ephemeral: true });
  }
  const list = getChannelAutopilotList(interaction.user.id);
  const { embed, components } = buildChannelProxyView(list, parseInt(pageStr), invokerId);
  await interaction.update({ embeds: [embed], components });
}

// --- Status handler ---

async function handleStatus(interaction) {
  const charName = interaction.options.getString('name');
  const status   = interaction.options.getString('status');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  setCharacterStatus(char.id, status);
  const label = { active: 'Active', deceased: '✦ Deceased', retired: 'Retired' }[status];
  await interaction.reply({ embeds: [successEmbed(`**${char.name}** marked as **${label}**.`)], ephemeral: true });
}

// --- Color handler ---

const COLOR_PRESETS = [
  { label: 'Forest Green',  value: String(0x2D5A27), description: '#2D5A27' },
  { label: 'Storm Grey',    value: String(0x6B7280), description: '#6B7280' },
  { label: 'Amber',         value: String(0xD97706), description: '#D97706' },
  { label: 'Blood Red',     value: String(0xDC2626), description: '#DC2626' },
  { label: 'Midnight Blue', value: String(0x1E3A5F), description: '#1E3A5F' },
  { label: 'Dusk Orange',   value: String(0xEA580C), description: '#EA580C' },
  { label: 'Bone White',    value: String(0xF5F0E8), description: '#F5F0E8' },
  { label: 'Shadow Black',  value: String(0x1A1A1A), description: '#1A1A1A' },
  { label: 'Rose',          value: String(0xE11D48), description: '#E11D48' },
  { label: 'Lavender',      value: String(0x7C3AED), description: '#7C3AED' },
  { label: 'Custom hex…',   value: 'custom',          description: 'Enter your own hex color code' },
];

async function handleColor(interaction) {
  const charName = interaction.options.getString('name');
  const chars    = getUserCharacters(interaction.user.id);
  const char     = chars.find(c => c.name.toLowerCase() === charName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`char_color_select:${char.id}`)
    .setPlaceholder('Choose a color…')
    .addOptions(COLOR_PRESETS);

  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(char.color ?? 0x2b2d31).setDescription(`Pick a color for **${char.name}**:`)],
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}

export async function handleColorSelect(interaction, charId) {
  const chars = getUserCharacters(interaction.user.id);
  const char  = chars.find(c => c.id === charId);
  if (!char) return interaction.update({ content: 'Character not found.', embeds: [], components: [] });

  const value = interaction.values[0];

  if (value === 'custom') {
    const modal = new ModalBuilder()
      .setCustomId(`char_color_custom:${charId}`)
      .setTitle('Custom Color')
      .addComponents(row(
        text('hex', 'Hex color code', TextInputStyle.Short, true, 'e.g. #A3C4F5 or A3C4F5', 1, 7)
      ));
    await interaction.showModal(modal);
    return;
  }

  setCharacterColor(charId, parseInt(value));
  await interaction.update({
    embeds: [successEmbed(`Color updated for **${char.name}**.`)],
    components: [],
  });
}

export async function handleColorCustomModal(interaction, charId) {
  const chars = getUserCharacters(interaction.user.id);
  const char  = chars.find(c => c.id === charId);
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const raw = interaction.fields.getTextInputValue('hex').trim().replace(/^#/, '');
  const int = parseInt(raw, 16);

  if (isNaN(int) || raw.length > 6) {
    return interaction.reply({ embeds: [errorEmbed('Invalid hex color. Use a format like `#A3C4F5` or `A3C4F5`.')], ephemeral: true });
  }

  setCharacterColor(charId, int);
  await interaction.reply({ embeds: [successEmbed(`Color updated for **${char.name}**.`)], ephemeral: true });
}

// --- Relationship handlers ---

async function handleRelationshipRequest(interaction) {
  const myCharName    = interaction.options.getString('my-character');
  const theirCharId   = parseInt(interaction.options.getString('their-character'));
  const type          = interaction.options.getString('type');
  const userId        = interaction.user.id;

  const myChars = getUserCharacters(userId);
  const myChar  = myChars.find(c => c.name.toLowerCase() === myCharName.toLowerCase());
  if (!myChar) return interaction.reply({ embeds: [errorEmbed('Your character not found.')], ephemeral: true });

  const { getCharacterById } = await import('../db/queries/characters.js');
  const theirChar = getCharacterById(theirCharId);
  if (!theirChar) return interaction.reply({ embeds: [errorEmbed('Their character not found.')], ephemeral: true });
  if (theirChar.owner_id === userId) return interaction.reply({ embeds: [errorEmbed('You cannot request a relationship with your own character.')], ephemeral: true });

  createRelationshipRequest(myChar.id, theirChar.id, type);

  // Ping the target's owner in the channel. The ping deletes itself after 5 minutes.
  const ping = await interaction.channel.send(
    `<@${theirChar.owner_id}> **${myChar.name}** wants to define a relationship with **${theirChar.name}** *(${type})*.\nRun \`/character relationship pending\` to approve or deny.`
  ).catch(() => null);
  if (ping) setTimeout(() => ping.delete().catch(() => {}), 5 * 60 * 1000);

  await interaction.reply({
    embeds: [successEmbed(`Relationship request sent! **${theirChar.owner_id === userId ? '' : `<@${theirChar.owner_id}>`}** needs to approve it.`)],
    ephemeral: true,
  });
}

async function handleRelationshipPending(interaction) {
  const pending = getPendingRelationshipsForUser(interaction.user.id);

  if (pending.length === 0) {
    return interaction.reply({ embeds: [successEmbed('No pending relationship requests.')], ephemeral: true });
  }

  const components = [];
  const lines = [];

  for (const r of pending.slice(0, 5)) {
    lines.push(`**${r.requester_name}** wants to be *${r.relationship_type}* to **${r.target_name}**`);
    const approve = new ButtonBuilder()
      .setCustomId(`rel_approve:${r.id}`)
      .setLabel(`✓ Approve`)
      .setStyle(ButtonStyle.Success);
    const deny = new ButtonBuilder()
      .setCustomId(`rel_deny:${r.id}`)
      .setLabel(`✗ Deny`)
      .setStyle(ButtonStyle.Danger);
    components.push(new ActionRowBuilder().addComponents(approve, deny));
  }

  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('Pending Relationship Requests').setDescription(lines.join('\n'))],
    components: components.slice(0, 5),
    ephemeral: true,
  });
}

async function handleRelationshipRemove(interaction) {
  const myCharName = interaction.options.getString('my-character');
  const relId      = parseInt(interaction.options.getString('relationship'));
  const chars      = getUserCharacters(interaction.user.id);
  const char       = chars.find(c => c.name.toLowerCase() === myCharName.toLowerCase());
  if (!char) return interaction.reply({ embeds: [errorEmbed('Character not found.')], ephemeral: true });

  const rel = getApprovedRelationships(char.id).find(r => r.id === relId);
  if (!rel) return interaction.reply({ embeds: [errorEmbed('Relationship not found.')], ephemeral: true });

  deleteRelationship(relId);
  await interaction.reply({ embeds: [successEmbed(`Relationship removed from **${char.name}**.`)], ephemeral: true });
}

export async function handleRelationshipApprove(interaction, relId) {
  const { getRelationshipById } = await import('../db/queries/characters.js');
  const rel = getRelationshipById(relId);
  if (!rel) return interaction.update({ embeds: [errorEmbed('Request not found.')], components: [] });

  const { getCharacterById } = await import('../db/queries/characters.js');
  const targetChar = getCharacterById(rel.target_char_id);
  if (!targetChar || targetChar.owner_id !== interaction.user.id) {
    return interaction.reply({ embeds: [errorEmbed('You cannot approve this request.')], ephemeral: true });
  }

  approveRelationship(relId);
  const requesterChar = getCharacterById(rel.requester_char_id);
  await interaction.update({
    embeds: [successEmbed(`Approved! **${requesterChar?.name}** is now *${rel.relationship_type}* to **${targetChar.name}** on their profile.`)],
    components: [],
  });
}

export async function handleRelationshipDeny(interaction, relId) {
  const { getRelationshipById } = await import('../db/queries/characters.js');
  const rel = getRelationshipById(relId);
  if (!rel) return interaction.update({ embeds: [errorEmbed('Request not found.')], components: [] });

  const { getCharacterById } = await import('../db/queries/characters.js');
  const targetChar = getCharacterById(rel.target_char_id);
  if (!targetChar || targetChar.owner_id !== interaction.user.id) {
    return interaction.reply({ embeds: [errorEmbed('You cannot deny this request.')], ephemeral: true });
  }

  deleteRelationship(relId);
  await interaction.update({ embeds: [successEmbed('Request denied.')], components: [] });
}

// --- Search handler ---

const SEARCH_PER_PAGE = 10;

async function buildSearchEmbed(filters, client) {
  const { name, clan, rank } = filters;
  const results = searchCharacters({ name, clan, rank });

  if (results.length === 0) return { notFound: true };

  const page  = results.slice(0, SEARCH_PER_PAGE);
  const total = Math.ceil(results.length / SEARCH_PER_PAGE);

  const lines = await Promise.all(page.map(async c => {
    const user  = await client.users.fetch(c.owner_id).catch(() => null);
    const owner = user ? `<@${user.id}>` : '*unknown*';
    const note  = c.status !== 'active' ? ` *(${c.status})*` : '';
    return `**${c.name}**${note} · ${[c.clan, c.rank].filter(Boolean).join(' · ') || 'No clan/rank'} · ${owner}`;
  }));

  return {
    embed: new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle('Character Search')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${results.length} result(s)${total > 1 ? ` · showing first ${SEARCH_PER_PAGE}` : ''}` }),
    select: new StringSelectMenuBuilder()
      .setCustomId(`char_search_select`)
      .setPlaceholder('View a character\'s profile…')
      .addOptions(page.map(c => ({
        label:       c.name.slice(0, 100),
        description: [c.clan, c.rank].filter(Boolean).join(' · ').slice(0, 100) || 'No clan/rank',
        value:       String(c.id),
      }))),
  };
}

async function handleSearch(interaction) {
  const name = interaction.options.getString('name') || undefined;
  const clan = interaction.options.getString('clan') || undefined;
  const rank = interaction.options.getString('rank') || undefined;

  if (!name && !clan && !rank) {
    return interaction.reply({ embeds: [errorEmbed('Provide at least one filter: name, clan, or rank.')], ephemeral: true });
  }

  const { pendingSearches } = await import('../utils/pendingState.js');
  pendingSearches.set(interaction.id, { name, clan, rank });
  setTimeout(() => pendingSearches.delete(interaction.id), 10 * 60 * 1000);

  const built = await buildSearchEmbed({ name, clan, rank }, interaction.client);
  if (built.notFound) {
    return interaction.reply({ embeds: [errorEmbed('No characters found matching those filters.')], ephemeral: false });
  }

  // Embed the search key + invoker id so navigation is locked to the invoker
  built.select.setCustomId(`char_search_select:${interaction.id}:${interaction.user.id}`);

  await interaction.reply({
    embeds: [built.embed],
    components: [new ActionRowBuilder().addComponents(built.select)],
    ephemeral: false,
  });
}

export async function handleSearchSelect(interaction, [searchKey, invokerId]) {
  if (interaction.user.id !== invokerId) {
    return interaction.reply({ embeds: [errorEmbed('This menu belongs to someone else. Run `/character search` to start your own.')], ephemeral: true });
  }

  const charId = parseInt(interaction.values[0]);
  const { getCharacterById } = await import('../db/queries/characters.js');
  const char = getCharacterById(charId);
  if (!char) return interaction.update({ embeds: [errorEmbed('Character not found.')], components: [] });

  const owner = await interaction.client.users.fetch(char.owner_id).catch(() => null);

  const back = new ButtonBuilder()
    .setCustomId(`char_search_back:${searchKey}:${invokerId}`)
    .setLabel('← Back to results')
    .setStyle(ButtonStyle.Secondary);

  await interaction.update({
    embeds: [characterEmbed(char, owner)],
    components: [new ActionRowBuilder().addComponents(back)],
  });
}

export async function handleSearchBack(interaction, [searchKey, invokerId]) {
  if (interaction.user.id !== invokerId) {
    return interaction.reply({ embeds: [errorEmbed('This menu belongs to someone else. Run `/character search` to start your own.')], ephemeral: true });
  }

  const { pendingSearches } = await import('../utils/pendingState.js');
  const filters = pendingSearches.get(searchKey);

  if (!filters) {
    return interaction.update({
      embeds: [errorEmbed('Search session expired. Run `/character search` again.')],
      components: [],
    });
  }

  const built = await buildSearchEmbed(filters, interaction.client);
  if (built.notFound) {
    return interaction.update({ embeds: [errorEmbed('No results found.')], components: [] });
  }

  built.select.setCustomId(`char_search_select:${searchKey}:${invokerId}`);

  await interaction.update({
    embeds: [built.embed],
    components: [new ActionRowBuilder().addComponents(built.select)],
  });
}

// --- Leaderboard handler ---

const MEDALS = ['🥇', '🥈', '🥉'];
const TITLES = [
  'spoke with the wind at their back',
  'whose voice echoed through the pines',
  'known in every den and hollow',
  'a familiar presence on the path',
  'whose pawsteps left a lasting mark',
  'counted among the voices of the forest',
  'remembered by those who listened',
  'whose stories traveled far',
  'a name whispered by the trees',
  'not yet forgotten by the stars',
];

async function handleLeaderboard(interaction) {
  const { getLeaderboard } = await import('../db/queries/characters.js');
  const top = getLeaderboard(10);

  if (top.length === 0) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('*The forest is quiet… no voices yet.*')], ephemeral: false });
  }

  const lines = await Promise.all(top.map(async (c, i) => {
    const user   = await interaction.client.users.fetch(c.owner_id).catch(() => null);
    const medal  = MEDALS[i] ?? `**${i + 1}.**`;
    const title  = TITLES[i] ?? TITLES[TITLES.length - 1];
    const owner  = user ? `<@${user.id}>` : '*unknown*';
    return `${medal} **${c.name}** - ${title}\n↳ ${c.message_count} posts · ${owner}`;
  }));

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Under the light of Starclan, these cats have spoken the loudest…')
    .setDescription(lines.join('\n\n'));

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

// --- Helpers ---

function text(customId, label, style, required, placeholder, minLength, maxLength, value) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMinLength(minLength)
    .setMaxLength(maxLength);
  if (placeholder) input.setPlaceholder(placeholder);
  // Don't pre-fill with an empty string - Discord rejects values shorter than minLength
  if (value !== undefined && value !== null && value !== '') input.setValue(value);
  return input;
}

function row(component) {
  return new ActionRowBuilder().addComponents(component);
}

// Deceased/retired characters stay on the roster but don't count toward the limit
function countActive(chars) {
  return chars.filter(c => (c.status ?? 'active') === 'active').length;
}

// --- Tupperbox import ---

function mapTupper(tupper) {
  return {
    name:      tupper.name ?? '',
    trigger:   tupper.brackets?.[0] ?? `${tupper.name}:`,
    avatar_url: tupper.avatar_url ?? '',
    bio:       tupper.description ?? '',
    posts:     tupper.posts ?? 0,
  };
}

async function handleTupperImport(interaction) {
  const attachment = interaction.options.getAttachment('file');

  if (!attachment.name.endsWith('.json')) {
    return interaction.reply({ embeds: [errorEmbed('Please upload a Tupperbox `.json` export file.')], ephemeral: true });
  }

  let data;
  try {
    const res = await fetch(attachment.url);
    data = await res.json();
  } catch {
    return interaction.reply({ embeds: [errorEmbed('Could not read the file. Make sure it is a valid JSON export.')], ephemeral: true });
  }

  const tuppers = (Array.isArray(data) ? data : data.tuppers)?.filter(Boolean);
  if (!tuppers?.length) {
    return interaction.reply({ embeds: [errorEmbed('No characters found in this file.')], ephemeral: true });
  }

  const userId   = interaction.user.id;
  const existing = getUserCharacters(userId);
  const maxChars = parseInt(getConfig('max_characters_per_user') ?? '20');
  const slots    = maxChars - countActive(existing);

  if (slots <= 0) {
    return interaction.reply({ embeds: [errorEmbed(`You have reached the character limit (${maxChars}). Deceased or retired characters do not count.`)], ephemeral: true });
  }

  const available = tuppers.slice(0, slots);

  if (available.length === 1) {
    const mapped = mapTupper(available[0]);
    pendingCreations.set(interaction.id, { mapped });
    setTimeout(() => pendingCreations.delete(interaction.id), 10 * 60 * 1000);
    await showTupperModal(interaction, mapped, interaction.id);
  } else {
    pendingCreations.set(interaction.id, { tuppers: available.map(mapTupper) });
    setTimeout(() => pendingCreations.delete(interaction.id), 10 * 60 * 1000);

    const select = new StringSelectMenuBuilder()
      .setCustomId(`tupper_import_select:${interaction.id}`)
      .setPlaceholder(`${available.length} character(s) found - select one to import`)
      .addOptions(available.map((t, i) => ({
        label:       t.name.slice(0, 100),
        description: `Trigger: ${t.brackets?.[0] ?? t.name + ':'}`,
        value:       String(i),
      })));

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('Tupperbox Import')
        .setDescription(
          `Found **${available.length}** character(s). Select one to review and import.\n` +
          `Run the command again to import another.\n\n` +
          (tuppers.length > slots ? `⚠️ You only have **${slots}** slot(s) remaining.` : '')
        )],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  }
}

export async function showTupperModal(interaction, mapped, pendingKey) {
  const modal = new ModalBuilder()
    .setCustomId(`tupper_create:${pendingKey}`)
    .setTitle(`Import - ${mapped.name.slice(0, 40)}`)
    .addComponents(
      row(text('name',     'Name',         TextInputStyle.Short,     true,  null,             1, 80,   mapped.name)),
      row(text('pronouns', 'Pronouns',     TextInputStyle.Short,     false, 'e.g. she/her',   0, 50,   '')),
      row(text('trigger',  'Proxy Trigger',TextInputStyle.Short,     true,  null,             1, 50,   mapped.trigger)),
      row(text('avatar',   'Avatar URL',   TextInputStyle.Short,     false, null,             0, 512,  mapped.avatar_url)),
      row(text('bio',      'Bio',          TextInputStyle.Paragraph, false, null,             0, 1000, mapped.bio.slice(0, 1000))),
    );
  await interaction.showModal(modal);
}

export async function handleTupperSelectMenu(interaction) {
  const commandId = interaction.customId.split(':')[1];
  const pending   = pendingCreations.get(commandId);

  if (!pending?.tuppers) {
    return interaction.reply({ embeds: [errorEmbed('Import session expired. Run `/character tupper-import` again.')], ephemeral: true });
  }

  const index  = parseInt(interaction.values[0]);
  const mapped = pending.tuppers[index];

  pendingCreations.set(interaction.id, { mapped });
  setTimeout(() => pendingCreations.delete(interaction.id), 10 * 60 * 1000);

  await showTupperModal(interaction, mapped, interaction.id);
}

export async function handleTupperCreateModal(interaction, pendingKey) {
  const pending = pendingCreations.get(pendingKey);
  pendingCreations.delete(pendingKey);

  const name     = interaction.fields.getTextInputValue('name').trim();
  const pronouns = interaction.fields.getTextInputValue('pronouns').trim() || null;
  const trigger  = interaction.fields.getTextInputValue('trigger').trim();
  const avatar   = interaction.fields.getTextInputValue('avatar').trim() || null;
  const bio      = interaction.fields.getTextInputValue('bio').trim() || null;
  const userId   = interaction.user.id;

  const maxChars = parseInt(getConfig('max_characters_per_user') ?? '20');
  const existing = getUserCharacters(userId);

  if (countActive(existing) >= maxChars) {
    return interaction.reply({ embeds: [errorEmbed(`You have reached the character limit (${maxChars}). Deceased or retired characters do not count.`)], ephemeral: true });
  }
  if (existing.some(c => c.trigger.toLowerCase() === trigger.toLowerCase())) {
    return interaction.reply({ embeds: [errorEmbed(`You already have a character with the trigger \`${trigger}\`.`)], ephemeral: true });
  }

  const result    = createCharacter({ owner_id: userId, name, pronouns, trigger, avatar_url: avatar, bio });
  const postCount = pending?.mapped?.posts ?? 0;

  if (postCount > 0) {
    updateCharacter(result.lastInsertRowid, { message_count: postCount });
  }

  await interaction.reply({
    embeds: [successEmbed(`**${name}** imported from Tupperbox!`).addFields(
      { name: 'Trigger',         value: `\`${trigger}\``,    inline: true },
      { name: 'Historical posts',value: String(postCount),   inline: true },
      { name: 'Next steps',      value: 'Use `/character profile` to set clan, rank, age, and OC doc.\nUse `/character lore` for appearance and backstory.' },
    )],
    ephemeral: true,
  });
}
