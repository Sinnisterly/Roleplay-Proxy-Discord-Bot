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

// If GUILD_ID is set, deploy to just that one guild. Updates show up instantly,
// which is handy while developing. Otherwise deploy globally so the commands
// work in every server the bot is in (the first global deploy can take up to an
// hour to show up).
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
