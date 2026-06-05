import { log } from '../utils/log.js';
import { seedGuild } from '../db/index.js';

export const name = 'guildCreate';

// Seed default config for any guild the bot is added to while running.
export function execute(guild) {
  try {
    seedGuild(guild.id);
    log.info('Guild', `Joined ${guild.name} (${guild.id}) - seeded default config`);
  } catch (err) {
    log.error('Guild', `Failed to seed new guild ${guild.id}:`, err);
  }
}
