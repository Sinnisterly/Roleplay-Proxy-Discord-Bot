import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = [];
const files = readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'));

for (const file of files) {
  const cmd = await import(`./commands/${file}`);
  if (cmd.data) {
    commands.push(cmd.data.toJSON());
    console.log(`Queued /${cmd.data.name}`);
  }
}

const rest = new REST().setToken(process.env.BOT_TOKEN);

// If GUILD_ID is set, deploy to that single guild — updates are instant, which
// is convenient during development. Otherwise deploy globally so the bot's
// commands are available in every server it joins (global commands can take up
// to ~1 hour to propagate the first time).
const guildId = process.env.GUILD_ID;

if (guildId) {
  console.log(`Deploying ${commands.length} command(s) to dev guild ${guildId}...`);
  await rest.put(
    Routes.applicationGuildCommands(process.env.APPLICATION_ID, guildId),
    { body: commands },
  );
} else {
  console.log(`Deploying ${commands.length} command(s) globally...`);
  await rest.put(
    Routes.applicationCommands(process.env.APPLICATION_ID),
    { body: commands },
  );
}

console.log('Done.');
