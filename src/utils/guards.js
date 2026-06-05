import { getRolesForTier } from '../db/queries/config.js';
import { isUserBlocked, isUserTimedOut } from '../db/queries/moderation.js';
import { getCharacterById, getAccessList } from '../db/queries/characters.js';

function memberHasAnyRole(member, roleIds) {
  return roleIds.some(id => member.roles.cache.has(id));
}

export function hasRoleplayerAccess(member) {
  const roles = getRolesForTier('roleplayer');
  if (roles.length === 0) return false;
  return memberHasAnyRole(member, roles);
}

export function hasStaffAccess(member) {
  if (member.permissions.has('Administrator')) return true;
  const roles = [
    ...getRolesForTier('staff'),
    ...getRolesForTier('senior_staff'),
  ];
  return memberHasAnyRole(member, roles);
}

export function hasSeniorStaffAccess(member) {
  if (member.permissions.has('Administrator')) return true;
  const roles = getRolesForTier('senior_staff');
  return memberHasAnyRole(member, roles);
}

export function isAdmin(member) {
  return member.permissions.has('Administrator');
}

// Returns true if userId can edit a proxy message:
// - they sent it, OR
// - the character is shared and they have an access grant for it
export function canEditProxyMessage(userId, record, memberRoleIds = []) {
  if (record.user_id === userId) return true;
  const char = getCharacterById(record.character_id);
  if (!char?.is_shared) return false;
  const grants = getAccessList(char.id);
  return grants.some(g =>
    g.grantee_user_id === userId ||
    (g.grantee_role_id && memberRoleIds.includes(g.grantee_role_id))
  );
}

// Returns null if allowed, or an error string if blocked
export function checkProxyAllowed(userId) {
  if (isUserBlocked(userId)) return 'You have been blocked from the proxy system.';
  if (isUserTimedOut(userId)) return 'You are currently timed out from the proxy system.';
  return null;
}

// Ephemeral guard reply helpers
export async function requireRoleplayer(interaction) {
  if (!hasRoleplayerAccess(interaction.member)) {
    await interaction.reply({ content: 'You need the **Roleplayer** role to use this command.', ephemeral: true });
    return false;
  }
  const block = checkProxyAllowed(interaction.user.id);
  if (block) {
    await interaction.reply({ content: block, ephemeral: true });
    return false;
  }
  return true;
}

export async function requireStaff(interaction) {
  if (!hasStaffAccess(interaction.member)) {
    await interaction.reply({ content: 'You need the **Staff** role to use this command.', ephemeral: true });
    return false;
  }
  return true;
}

export async function requireSeniorStaff(interaction) {
  if (!hasSeniorStaffAccess(interaction.member)) {
    await interaction.reply({ content: 'You need the **Senior Staff** role to use this command.', ephemeral: true });
    return false;
  }
  return true;
}
