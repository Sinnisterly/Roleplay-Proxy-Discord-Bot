import { EmbedBuilder } from 'discord.js';
import { tsToDiscord, tsToFull } from './time.js';
import { getApprovedRelationships } from '../db/queries/characters.js';

const STATUS_LABEL = {
  deceased: '✦ Deceased',
  retired:  'Retired',
};

const DEFAULT_COLOR = 0x2b2d31;

function statusNote(char) {
  return STATUS_LABEL[char.status] ?? null;
}

export function characterEmbed(char, owner = null) {
  const color = char.color ?? DEFAULT_COLOR;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(char.name)
    .setThumbnail(char.avatar_url ?? null);

  const fields = [];

  if (owner)         fields.push({ name: 'Player',      value: `<@${owner.id}>`,   inline: true });
  if (char.pronouns) fields.push({ name: 'Pronouns',    value: char.pronouns,       inline: true });
  if (char.clan)     fields.push({ name: 'Clan / Group',value: char.clan,           inline: true });
  if (char.rank)     fields.push({ name: 'Rank',        value: char.rank,           inline: true });
  if (char.age_moons != null) fields.push({ name: 'Age', value: `${char.age_moons} moons`, inline: true });
  if (char.ic_birthday) fields.push({ name: 'Birthday', value: char.ic_birthday,    inline: true });

  if (char.bio)         fields.push({ name: 'Bio',         value: char.bio.slice(0, 1024) });
  if (char.appearance)  fields.push({ name: 'Appearance',  value: char.appearance.slice(0, 1024) });
  if (char.personality) fields.push({ name: 'Personality', value: char.personality.slice(0, 1024) });
  if (char.backstory)   fields.push({ name: 'Backstory',   value: char.backstory.slice(0, 1024) });

  // Relationships
  const relationships = getApprovedRelationships(char.id);
  if (relationships.length) {
    const lines = relationships.map(r => {
      const reqLabel = r.requester_status && r.requester_status !== 'active'
        ? `${r.requester_name} *(${STATUS_LABEL[r.requester_status] ?? r.requester_status})*`
        : r.requester_name;
      const tgtLabel = r.target_status && r.target_status !== 'active'
        ? `${r.target_name} *(${STATUS_LABEL[r.target_status] ?? r.target_status})*`
        : r.target_name;
      return `• ${reqLabel} is **${r.relationship_type}** to ${tgtLabel}`;
    });
    fields.push({ name: 'Relationships', value: lines.join('\n').slice(0, 1024) });
  }

  // Stats
  const stats = [`Posts: **${char.message_count}**`];
  if (char.first_used_at) stats.push(`First seen: ${tsToFull(char.first_used_at)}`);
  if (char.last_used_at)  stats.push(`Last active: ${tsToDiscord(char.last_used_at)}`);
  fields.push({ name: 'Stats', value: stats.join('\n') });

  if (fields.length) embed.addFields(fields);

  // Description: status, mood, OC doc
  const descParts = [];
  const note = statusNote(char);
  if (note)              descParts.push(`**${note}**`);
  if (char.is_shared)    descParts.push('*(Shared / NPC character)*');
  if (char.current_mood) descParts.push(`**Mood:** ${char.current_mood}`);
  if (char.oc_doc_url)   descParts.push(`[View OC Document](${char.oc_doc_url})`);
  if (descParts.length)  embed.setDescription(descParts.join('\n'));

  return embed;
}

export function characterListEmbed(chars, targetUser, page, totalPages, showPendingNote = false) {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle(`${targetUser.displayName ?? targetUser.username}'s Characters`)
    .setFooter({ text: `Page ${page}/${totalPages} · ${chars.length} shown` });

  if (chars.length === 0) {
    embed.setDescription('No characters found.');
    return embed;
  }

  const lines = chars.map(c => {
    const note = statusNote(c);
    const parts = [`**${c.name}**${note ? ` *(${note})*` : ''}`];
    if (c.pronouns)     parts.push(`*(${c.pronouns})*`);
    if (c.clan)         parts.push(`· ${c.clan}`);
    if (c.rank)         parts.push(`· ${c.rank}`);
    if (c.current_mood) parts.push(`· [${c.current_mood}]`);
    if (c.oc_doc_url)   parts.push(`· [OC Doc](${c.oc_doc_url})`);
    parts.push(`· \`${c.trigger}\` · ${c.message_count} posts`);
    return parts.join(' ');
  });

  let description = lines.join('\n');
  if (showPendingNote) {
    description += '\n\n⚠️ You have pending relationship requests - `/character relationship pending`';
  }
  embed.setDescription(description);
  return embed;
}

export function errorEmbed(message) {
  return new EmbedBuilder().setColor(0xed4245).setDescription(`**Error:** ${message}`);
}

export function successEmbed(message) {
  return new EmbedBuilder().setColor(0x57f287).setDescription(message);
}
