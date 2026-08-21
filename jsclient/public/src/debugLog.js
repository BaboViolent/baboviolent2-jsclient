const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
export const debugLoggingEnabled = params.get('debug') === '1';

const session = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
let sequence = 0;
let queue = [];
let flushTimer = null;

function flush() {
  flushTimer = null;
  if (!queue.length) return;
  const entries = queue;
  queue = [];
  fetch('/api/debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
    keepalive: true,
  }).catch(() => {});
}

export function debugLog(event, data = {}) {
  if (!debugLoggingEnabled) return;
  queue.push({
    session,
    sequence: sequence++,
    clientTime: new Date().toISOString(),
    performanceMs: Math.round(performance.now() * 1000) / 1000,
    event,
    data,
  });
  if (queue.length >= 32) flush();
  else if (flushTimer == null) flushTimer = setTimeout(flush, 100);
}

if (debugLoggingEnabled) {
  debugLog('debug-session-start', {
    url: typeof location === 'undefined' ? '' : location.href,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  });
  if (typeof addEventListener !== 'undefined') addEventListener('pagehide', flush);
}
