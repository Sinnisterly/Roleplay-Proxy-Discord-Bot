import { log } from '../utils/log.js';
import { seedGuild } from '../db/index.js';

export const name = 'clientReady';
export const once = true;

export function execute(client) {
  // Ensure every guild the bot is already in has its default config seeded
  // (covers guilds joined while the bot was offline).
  for (const guild of client.guilds.cache.values()) {
    try {
      seedGuild(guild.id);
    } catch (err) {
      log.warn('Ready', `Failed seeding guild ${guild.id}: ${err.message}`);
    }
  }

  log.info('Ready', `Logged in as ${client.user.tag} - serving ${client.guilds.cache.size} guild(s)`);
  // Global presence shared across all guilds. Override via BOT_ACTIVITY in .env.
  const activity = process.env.BOT_ACTIVITY ?? 'roleplay';
  client.user.setActivity(activity, { type: 0 });
}
