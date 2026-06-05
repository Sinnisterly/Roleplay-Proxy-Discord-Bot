import { AsyncLocalStorage } from 'node:async_hooks';

// Per-request guild scoping.
//
// The active guild id is set once at each event entry point
// (interactionCreate / messageCreate / messageReactionAdd / guildCreate) via
// runWithGuild(), and read inside the query layer via currentGuildId(). This
// lets every query and command handler stay guild-agnostic — no guildId
// argument has to be threaded through their signatures — while the database is
// still fully isolated per server.
//
// AsyncLocalStorage propagates the value across `await` boundaries within the
// same logical call chain, so it is safe to use from the async proxy/webhook
// code paths.
const storage = new AsyncLocalStorage();

export function runWithGuild(guildId, fn) {
  return storage.run({ guildId }, fn);
}

// Returns the active guild id, or throws if a query ran outside a guild scope.
// Throwing (rather than returning null) is deliberate: it turns a missing scope
// into a loud, immediate error instead of a silent cross-guild data leak.
export function currentGuildId() {
  const store = storage.getStore();
  if (!store?.guildId) {
    throw new Error('No active guild context — a DB query ran outside runWithGuild()');
  }
  return store.guildId;
}
