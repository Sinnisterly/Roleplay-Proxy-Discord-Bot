import { AsyncLocalStorage } from 'node:async_hooks';

// Per-request guild scoping.
//
// Each event entry point (interactionCreate, messageCreate,
// messageReactionAdd, guildCreate) sets the active guild id once via
// runWithGuild(). The query layer reads it back with currentGuildId(). That way
// queries and command handlers don't have to pass a guildId around everywhere,
// but the database stays fully isolated per server.
//
// AsyncLocalStorage carries the value across `await` boundaries in the same call
// chain, so this works fine from the async proxy/webhook code too.
const storage = new AsyncLocalStorage();

export function runWithGuild(guildId, fn) {
  return storage.run({ guildId }, fn);
}

// Returns the active guild id, or throws if a query ran outside a guild scope.
// We throw instead of returning null on purpose: a missing scope should blow up
// loudly right away rather than quietly leak data between servers.
export function currentGuildId() {
  const store = storage.getStore();
  if (!store?.guildId) {
    throw new Error('No active guild context - a DB query ran outside runWithGuild()');
  }
  return store.guildId;
}
