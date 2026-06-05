import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { getProxyMessage } from '../db/queries/proxy.js';
import { hasRoleplayerAccess, canEditProxyMessage } from '../utils/guards.js';
import { runWithGuild } from '../db/context.js';

const EDIT_EMOJI = '✏️';
const BUTTON_TTL = 60_000;

export const name = 'messageReactionAdd';

export async function execute(reaction, user) {
  if (user.bot) return;
  if (reaction.emoji.name !== EDIT_EMOJI) return;

  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  const guild = reaction.message.guild;
  if (!guild) return;

  await runWithGuild(guild.id, async () => {
    const record = getProxyMessage(reaction.message.id);
    if (!record) return;

    await reaction.users.remove(user.id).catch(() => {});

    let member;
    try { member = await guild.members.fetch(user.id); } catch { return; }
    if (!hasRoleplayerAccess(member)) return;

    const memberRoleIds = [...member.roles.cache.keys()];
    if (!canEditProxyMessage(user.id, record, memberRoleIds)) return;

    const button = new ButtonBuilder()
      .setCustomId(`proxy_edit_open:${record.message_id}`)
      .setLabel('Edit Message')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✏️');

    const prompt = await reaction.message.channel.send({
      content: `<@${user.id}>`,
      components: [new ActionRowBuilder().addComponents(button)],
    }).catch(() => null);

    if (prompt) {
      setTimeout(() => prompt.delete().catch(() => {}), BUTTON_TTL);
    }
  });
}
