import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { loadCommands } from './handlers/commands.js';
import { loadEvents } from './handlers/events.js';
import { initDb } from './db/index.js';
import { log } from './utils/log.js';

// Catch anything that would otherwise crash the process silently
process.on('unhandledRejection', (reason) => {
  log.error('Process', 'Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  log.error('Process', 'Uncaught exception:', err);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

client.commands = new Collection();

client.on('error',   (err)  => log.error('Client', 'Client error:', err));
client.on('warn',    (info) => log.warn('Client', info));
client.on('shardError', (err) => log.error('Client', 'WebSocket shard error:', err));

initDb();

await loadCommands(client);
await loadEvents(client);

log.info('Startup', 'Logging in…');
await client.login(process.env.BOT_TOKEN).catch((err) => {
  log.error('Startup', 'Login failed:', err);
  process.exit(1);
});
