// Centralized console logger with timestamps, levels, and color.
// PM2 captures stdout/stderr to its log files, so everything here shows in `pm2 logs`.

const COLORS = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

const LEVELS = {
  debug: { label: 'DEBUG', color: COLORS.gray },
  info:  { label: 'INFO ', color: COLORS.cyan },
  warn:  { label: 'WARN ', color: COLORS.yellow },
  error: { label: 'ERROR', color: COLORS.red },
};

// Set LOG_LEVEL=debug in .env to see debug output. Defaults to info.
const ACTIVE_LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const ORDER = ['debug', 'info', 'warn', 'error'];

function shouldLog(level) {
  return ORDER.indexOf(level) >= ORDER.indexOf(ACTIVE_LEVEL);
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function emit(level, tag, message, extra) {
  if (!shouldLog(level)) return;
  const { label, color } = LEVELS[level];
  const tagStr = tag ? `${COLORS.blue}[${tag}]${COLORS.reset} ` : '';
  const line = `${COLORS.dim}${timestamp()}${COLORS.reset} ${color}${label}${COLORS.reset} ${tagStr}${message}`;
  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (extra !== undefined) {
    stream(line, extra);
  } else {
    stream(line);
  }
}

export const log = {
  debug: (tag, message, extra) => emit('debug', tag, message, extra),
  info:  (tag, message, extra) => emit('info',  tag, message, extra),
  warn:  (tag, message, extra) => emit('warn',  tag, message, extra),
  error: (tag, message, extra) => emit('error', tag, message, extra),
};
