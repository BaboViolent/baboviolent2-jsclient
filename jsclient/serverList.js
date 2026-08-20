export function configuredServerUrls(env = process.env) {
  const raw = env.BV2_GAME_SERVERS ?? env.BV2_GAME_SERVER ?? 'http://127.0.0.1:8080';
  return raw.split(',').map((url) => url.trim()).filter(Boolean);
}

export async function probeServers(urls, fetchImpl = fetch) {
  const results = await Promise.all(urls.map(async (gameHost) => {
    const endpoint = `${gameHost.replace(/\/$/, '')}/info`;
    const samples = [];
    let info = null;
    try {
      // The first request establishes DNS/TCP/TLS and can make every server look
      // artificially slow on a fresh process. A second sample reflects the
      // connection players will actually use.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const started = performance.now();
        const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(2000) });
        if (!response.ok) continue;
        info = await response.json();
        samples.push(Math.max(0, Math.round(performance.now() - started)));
      }
      if (!info || samples.length === 0) return null;
      const url = new URL(gameHost);
      const wsRoute = new URL('/ws', url);
      const wsCheck = await fetchImpl(wsRoute, { signal: AbortSignal.timeout(2000) });
      // A WebSocket endpoint rejects an ordinary HTTP request with 400/426.
      // A 404 (or an unreachable public port) means Join cannot reach it.
      if (wsCheck.status !== 400 && wsCheck.status !== 426) return null;
      const wsUrl = new URL(wsRoute);
      wsUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return {
        name: info.name ?? 'BV2 Web Server',
        ip: url.hostname,
        port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
        wsUrl: wsUrl.toString(),
        map: info.map ?? '',
        gameType: info.gameType ?? 0,
        players: info.players ?? 0,
        maxPlayers: info.maxPlayers ?? 16,
        ping: Math.min(...samples),
      };
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean).sort((a, b) =>
    b.players - a.players || a.ping - b.ping || a.name.localeCompare(b.name));
}
