# RP Proxy Bot

A multi-guild Discord bot for roleplay servers. It provides **character
proxying** (Tupperbox-style - post as your characters via webhooks), rich
character profiles, shared characters, IC relationships, moods, per-channel
auto-proxy, staff moderation tools, and fully per-server configuration.

-Example of what the bot does:


<img width="389" height="138" alt="image" src="https://github.com/user-attachments/assets/0d250a56-c612-40f3-afa8-4a2a5de3098e" />

Every server the bot joins is **isolated**: its own characters, roles, channels,
lists, moderation state, and settings. Add the bot to as many servers as you
like - nothing is shared between them.

---

## Features

- **Proxying** - trigger-based (`Mira: hello`), per-user default trigger,
  per-channel auto-proxy, and trigger aliases. Messages are reposted through a
  per-channel webhook and the original is deleted.
- **Editing & deleting** proxied messages - reply with `!e <new text>`, the ✏️
  reaction, or a button.
- **OOC notation** - `text ((ooc note))` renders the note as a footer embed.
- **Character profiles** - pronouns, bio, appearance, personality, backstory,
  clan, rank, age, birthday, doc link, color, avatar.
- **Moods** - appended to the proxy name (`Mira [Injured]`), auto-expiring.
- **Shared characters** - grant access to specific users or roles.
- **IC relationships** - request/approve relationships between characters.
- **Moderation** - block/timeout users from proxying, with full audit history.
- **Logging** - proxy activity and mod actions to configurable channels.
- **Per-server config** - role tiers, selectable lists (mood/rank/clan),
  templates, relationship types, and channels, all managed via slash commands.

---

## Requirements

- [Node.js](https://nodejs.org/) **18 or newer** (uses `node:async_hooks` and
  built-in `--watch`).
- A Discord application + bot ([Developer Portal](https://discord.com/developers/applications)).
- A build toolchain for `better-sqlite3` (native module). On Windows this is
  included with recent Node installers; on Linux you may need `build-essential`
  and `python3`.

---

## 1. Create the Discord application

1. Go to the [Developer Portal](https://discord.com/developers/applications) →
   **New Application**.
2. **Bot** tab → **Reset Token** → copy the token (this is your `BOT_TOKEN`).
3. On the **Bot** tab, enable these **Privileged Gateway Intents** (both are
   required):
   - **Message Content Intent** - needed to read messages for proxying.
   - **Server Members Intent** - needed for role/permission checks.
4. **General Information** tab → copy the **Application ID** (this is your
   `APPLICATION_ID`).

### Invite the bot

Use the **OAuth2 → URL Generator**:

- **Scopes:** `bot`, `applications.commands`
- **Bot Permissions:**
  - View Channels
  - Send Messages
  - Manage Messages *(to delete the original message after proxying)*
  - Manage Webhooks *(to create/send via per-channel webhooks)*
  - Read Message History
  - Add Reactions / Use External Emojis *(for the edit reaction UI)*

Open the generated URL and add the bot to your server.

---

## 2. Configure the environment

This repo does **not** include an `.env` file (secrets must never be committed).
Create one in the project root named `.env`:

```dotenv
# Required - from the Developer Portal
BOT_TOKEN=your-bot-token-here
APPLICATION_ID=your-application-id-here

# Optional - if set, slash commands deploy to ONLY this guild (instant updates,
# great for development). Leave it unset/blank to deploy commands GLOBALLY to
# every server the bot is in (recommended for multi-guild; first global deploy
# can take up to ~1 hour to appear).
GUILD_ID=

# Optional - where the SQLite database lives (created automatically)
DB_PATH=./data/bot.db

# Optional - the bot's "Playing ..." status text
BOT_ACTIVITY=roleplay

# Optional - the underlying webhook name (per-message names override this)
WEBHOOK_NAME=RP Proxy

# Optional - log verbosity: error | warn | info | debug
LOG_LEVEL=info
```

> **Security:** `.env` and the `data/` database are listed in `.gitignore`.
> Never commit them. If your bot token is ever exposed, **reset it immediately**
> in the Developer Portal.

---

## 3. Install and run

```bash
npm install            # install dependencies

npm run deploy         # register slash commands (global, or to GUILD_ID if set)

npm start              # start the bot
# or, with auto-restart on file changes during development:
npm run dev
```

Re-run `npm run deploy` whenever you add or change a command's definition.

---

## 4. First-time server setup

Slash commands are gated behind configurable **role tiers**. A user with the
Discord **Administrator** permission always passes every check, so an admin can
bootstrap a fresh server. Run these once per server:

1. **Assign role tiers** (who can do what):
   ```
   /character-admin config-roles add tier:roleplayer role:@Roleplayer
   /character-admin config-roles add tier:staff role:@Staff
   /character-admin config-roles add tier:senior_staff role:@Senior Staff
   ```
   - `roleplayer` - can create and use characters / proxy.
   - `staff` - moderation (timeout, history).
   - `senior_staff` - full config, blocks, templates, character transfers.

2. **Set logging channels** (optional but recommended):
   ```
   /character-admin config-channels set ...   # staff + audit log channels
   ```

3. **Populate selectable lists** (optional) - moods, ranks, clans:
   ```
   /character-admin config-lists ...
   ```

Sensible defaults (proxy trigger `!!`, edit prefix `!e`, character limits, etc.)
are seeded automatically the moment the bot joins a server.

### Command tiers at a glance

| Command            | Tier         | Purpose                                            |
| ------------------ | ------------ | -------------------------------------------------- |
| `/character`       | roleplayer   | create / edit / view / list characters, moods, etc.|
| `/character-mod`   | staff        | user timeout / history / status                    |
| `/character-admin` | senior staff | blocks, transfers, all server configuration        |

---

## How multi-guild isolation works

The bot uses a single SQLite database, but **every table is keyed by
`guild_id`**. The active guild is captured once at each event entry point
(`interactionCreate`, `messageCreate`, `messageReactionAdd`) and stored in an
[`AsyncLocalStorage`](https://nodejs.org/api/async_context.html) context
(`src/db/context.js`). The query layer reads that context and automatically
scopes every read and write to the current server - so command and event code
never has to pass a guild id around, and data can never leak between servers.

When the bot joins a new guild (`guildCreate`) or starts up, default config is
seeded for that guild idempotently (`seedGuild` in `src/db/index.js`).

---

## Project structure

```
src/
  commands/      character.js, character-mod.js, character-admin.js
  db/
    index.js     DB init + per-guild seeding
    context.js   AsyncLocalStorage guild scoping
    schema.js    table definitions (all guild-scoped)
    queries/     characters.js, config.js, moderation.js, proxy.js
  events/        ready, guildCreate, messageCreate, messageReactionAdd, interactionCreate
  handlers/      command + event auto-loaders
  proxy/         engine.js (proxy logic), webhookPool.js (per-channel webhooks)
  utils/         guards, logger, embeds, time, log
  index.js       entry point
  deploy-commands.js
```

---

## Running in production (PM2)

An [`ecosystem.config.cjs`](ecosystem.config.cjs) is included:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs rp-proxy-bot
pm2 save
```

---

## Notes

- The database directory is created automatically on first run.
- `better-sqlite3` is synchronous; the bot is single-process and relies on
  Discord's gateway for concurrency.
- Designed for Node 18+. Use the latest LTS for best results.
