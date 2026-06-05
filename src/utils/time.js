export const TIMEOUT_DURATIONS = [
  { label: '15 minutes', value: '900000' },
  { label: '30 minutes', value: '1800000' },
  { label: '1 hour',     value: '3600000' },
  { label: '6 hours',    value: '21600000' },
  { label: '12 hours',   value: '43200000' },
  { label: '1 day',      value: '86400000' },
  { label: '3 days',     value: '259200000' },
  { label: '7 days',     value: '604800000' },
  { label: '30 days',    value: '2592000000' },
];

export function msToHuman(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function tsToDiscord(ts) {
  return `<t:${Math.floor(ts / 1000)}:R>`;
}

export function tsToFull(ts) {
  return `<t:${Math.floor(ts / 1000)}:f>`;
}
