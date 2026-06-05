import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from '../utils/log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadCommands(client) {
  const commandsPath = join(__dirname, '..', 'commands');
  const files = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const command = await import(`../commands/${file}`);
    if (!command.data || !command.execute) {
      log.warn('Commands', `Skipping ${file} - missing data or execute export`);
      continue;
    }
    client.commands.set(command.data.name, command);
    log.info('Commands', `Loaded /${command.data.name}`);
  }
}
