import { handleProxyMessage, handleEditPrefix } from '../proxy/engine.js';
import { runWithGuild } from '../db/context.js';

export const name = 'messageCreate';

export async function execute(message, client) {
  if (message.author.bot) return;
  if (!message.guild) return;

  await runWithGuild(message.guild.id, async () => {
    // Try edit prefix first (faster check — starts with `!e `)
    const wasEdit = await handleEditPrefix(message, client);
    if (wasEdit) return;

    await handleProxyMessage(message, client);
  });
}
