import { getProxyMessage, updateProxyContent } from '../db/queries/proxy.js';
import { getCharacterById } from '../db/queries/characters.js';
import { editWebhookMessage, deleteWebhookMessage } from '../proxy/webhookPool.js';
import { logProxyEdit, logProxyDelete } from '../utils/logger.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { canEditProxyMessage } from '../utils/guards.js';
import { log } from '../utils/log.js';
import { runWithGuild } from '../db/context.js';
import {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} from 'discord.js';

export const name = 'interactionCreate';

function describeCommand(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub   = interaction.options.getSubcommand(false);
  return [interaction.commandName, group, sub].filter(Boolean).join(' ');
}

export async function execute(interaction, client) {
  // This bot is guild-only; every handler below reads guild-scoped data.
  if (!interaction.guildId) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: 'These commands can only be used in a server.',
        ephemeral: true,
      }).catch(() => {});
    }
    return;
  }

  return runWithGuild(interaction.guildId, () => dispatchInteraction(interaction, client));
}

async function dispatchInteraction(interaction, client) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      log.info('Command', `/${describeCommand(interaction)} by ${interaction.user.tag} (${interaction.user.id})`);
      await command.execute(interaction, client);

    } else if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);

    } else if (interaction.isModalSubmit()) {
      log.debug('Modal', `${interaction.customId} by ${interaction.user.tag}`);
      await handleModalSubmit(interaction, client);

    } else if (interaction.isButton()) {
      log.debug('Button', `${interaction.customId} by ${interaction.user.tag}`);
      await handleButton(interaction, client);

    } else if (interaction.isStringSelectMenu()) {
      log.debug('Select', `${interaction.customId} by ${interaction.user.tag}`);
      await handleSelectMenu(interaction);
    }
  } catch (err) {
    const ref = interaction.isChatInputCommand() ? `/${describeCommand(interaction)}` : interaction.customId;
    log.error('Interaction', `Failed handling ${ref} for ${interaction.user?.tag}:`, err);
    const msg = { embeds: [errorEmbed('Something went wrong. Please try again.')], ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
}

// --- Modal handlers ---

async function handleModalSubmit(interaction, client) {
  const [prefix, ...parts] = interaction.customId.split(':');

  if (prefix === 'char_create') {
    const { handleCharacterCreateModal } = await import('../commands/character.js');
    await handleCharacterCreateModal(interaction, parts[0]);

  } else if (prefix === 'shared_create') {
    const { handleSharedCreateModal } = await import('../commands/character-admin.js');
    await handleSharedCreateModal(interaction, parts[0]);

  } else if (prefix === 'tupper_create') {
    const { handleTupperCreateModal } = await import('../commands/character.js');
    await handleTupperCreateModal(interaction, parts[0]);

  } else if (prefix === 'char_edit') {
    const { handleCharacterEditModal } = await import('../commands/character.js');
    await handleCharacterEditModal(interaction, parseInt(parts[0]));

  } else if (prefix === 'proxy_edit') {
    const messageId = parts[0];
    const newContent = interaction.fields.getTextInputValue('content');
    const record = getProxyMessage(messageId);
    const memberRoleIds = [...interaction.member.roles.cache.keys()];

    if (!record || !canEditProxyMessage(interaction.user.id, record, memberRoleIds)) {
      return interaction.reply({ embeds: [errorEmbed('You cannot edit that proxy message.')], ephemeral: true });
    }

    await editWebhookMessage(client, messageId, record.webhook_id, record.webhook_token, newContent);
    updateProxyContent(messageId, newContent);

    const char = getCharacterById(record.character_id);
    await logProxyEdit(client, {
      user: interaction.user, character: char,
      oldContent: record.content, newContent,
      channelId: record.channel_id, messageId,
    });

    await interaction.reply({ embeds: [successEmbed('Message edited.')], ephemeral: true });

  } else if (prefix === 'char_profile') {
    const { handleProfileModal } = await import('../commands/character.js');
    await handleProfileModal(interaction, parseInt(parts[0]));

  } else if (prefix === 'char_color_custom') {
    const { handleColorCustomModal } = await import('../commands/character.js');
    await handleColorCustomModal(interaction, parseInt(parts[0]));
  }
}

// --- Button handlers ---

async function handleButton(interaction, client) {
  const [action, ...parts] = interaction.customId.split(':');

  if (action === 'char_list_page') {
    const { handleListPage } = await import('../commands/character.js');
    await handleListPage(interaction, parts);

  } else if (action === 'char_delete_confirm') {
    const { handleDeleteConfirm } = await import('../commands/character.js');
    await handleDeleteConfirm(interaction, parseInt(parts[0]));

  } else if (action === 'char_delete_cancel') {
    await interaction.update({ content: 'Deletion cancelled.', embeds: [], components: [] });

  } else if (action === 'proxy_edit_open') {
    const messageId = parts[0];
    const record = getProxyMessage(messageId);
    const memberRoleIds = [...interaction.member.roles.cache.keys()];
    if (!record || !canEditProxyMessage(interaction.user.id, record, memberRoleIds)) {
      return interaction.reply({ embeds: [errorEmbed('You cannot edit that proxy message.')], ephemeral: true });
    }
    const modal = new ModalBuilder()
      .setCustomId(`proxy_edit:${messageId}`)
      .setTitle('Edit Proxy Message')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('New message content')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(record.content)
          .setMaxLength(2000)
          .setRequired(true)
      ));
    await interaction.showModal(modal);
    // Delete the reaction-triggered button message now that the modal is open
    await interaction.message?.delete().catch(() => {});

  } else if (action === 'proxy_delete_confirm') {
    const messageId = parts[0];
    const record = getProxyMessage(messageId);
    const memberRoleIds = [...interaction.member.roles.cache.keys()];
    if (!record || !canEditProxyMessage(interaction.user.id, record, memberRoleIds)) {
      return interaction.reply({ embeds: [errorEmbed('You cannot delete that proxy message.')], ephemeral: true });
    }
    await deleteWebhookMessage(client, messageId, record.webhook_id, record.webhook_token);
    const { deleteProxyRecord } = await import('../db/queries/proxy.js');
    deleteProxyRecord(messageId);

    const char = getCharacterById(record.character_id);
    await logProxyDelete(client, {
      user: interaction.user, character: char,
      content: record.content, channelId: record.channel_id, messageId,
    });

    await interaction.update({ content: 'Message deleted.', embeds: [], components: [] });

  } else if (action === 'char_search_back') {
    const { handleSearchBack } = await import('../commands/character.js');
    await handleSearchBack(interaction, parts);

  } else if (action === 'channel_proxy_page') {
    const { handleChannelProxyListPage } = await import('../commands/character.js');
    await handleChannelProxyListPage(interaction, parts);

  } else if (action === 'rel_approve') {
    const { handleRelationshipApprove } = await import('../commands/character.js');
    await handleRelationshipApprove(interaction, parseInt(parts[0]));

  } else if (action === 'rel_deny') {
    const { handleRelationshipDeny } = await import('../commands/character.js');
    await handleRelationshipDeny(interaction, parseInt(parts[0]));
  }
}

// --- Select menu handlers ---

async function handleSelectMenu(interaction) {
  const [action, ...parts] = interaction.customId.split(':');

  if (action === 'char_mood_select') {
    const { handleMoodSelect } = await import('../commands/character.js');
    await handleMoodSelect(interaction, parseInt(parts[0]));

  } else if (action === 'char_list_select') {
    const { handleListCharSelect } = await import('../commands/character.js');
    await handleListCharSelect(interaction, parts);

  } else if (action === 'tupper_import_select') {
    const { handleTupperSelectMenu } = await import('../commands/character.js');
    await handleTupperSelectMenu(interaction);

  } else if (action === 'char_color_select') {
    const { handleColorSelect } = await import('../commands/character.js');
    await handleColorSelect(interaction, parseInt(parts[0]));

  } else if (action === 'char_search_select') {
    const { handleSearchSelect } = await import('../commands/character.js');
    await handleSearchSelect(interaction, parts);
  }
}
