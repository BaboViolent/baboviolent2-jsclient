function bracketHost(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

export function joinTargetToWsUrl(raw, defaultPort = 8080, pageProtocol = 'http:') {
  const target = String(raw ?? '').trim();
  const protocol = pageProtocol === 'https:' ? 'wss:' : 'ws:';
  let url;
  if (/^wss?:\/\//i.test(target)) {
    url = new URL(target);
  } else if (target.startsWith('[')) {
    url = new URL(`${protocol}//${target}`);
  } else if (target.includes(':')) {
    // Multiple colons without brackets are a raw IPv6 literal, not host:port.
    const colonCount = (target.match(/:/g) ?? []).length;
    url = new URL(`${protocol}//${colonCount > 1 ? bracketHost(target) : target}`);
  } else {
    url = new URL(`${protocol}//${target || '127.0.0.1'}`);
  }
  if (!url.port) url.port = String(defaultPort);
  if (!url.pathname || url.pathname === '/') url.pathname = '/ws';
  return url.toString();
}

export function hostedJoinTargetToWsUrl(raw) {
  const local = new URL(joinTargetToWsUrl(raw, 8080, 'http:'));
  if (local.hostname === 'localhost' || local.hostname === '127.0.0.1' || local.hostname === '[::1]') {
    local.protocol = 'ws:';
    local.pathname = '/ws';
    local.search = '';
    local.hash = '';
    return local.toString();
  }
  const url = new URL(joinTargetToWsUrl(raw, 443, 'https:'));
  url.protocol = 'wss:';
  url.port = '';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function hostedJoinHostname(raw) {
  return new URL(hostedJoinTargetToWsUrl(raw)).hostname;
}

export function formatHostPort(host, port) {
  return `${bracketHost(String(host))}:${Number(port)}`;
}
