export function configuredServerUrls(env = process.env) {
  const raw = env.BV2_GAME_SERVERS ?? env.BV2_GAME_SERVER ?? 'http://127.0.0.1:8080';
  return raw.split(',').map((url) => url.trim()).filter(Boolean);
}

export async function probeServers(urls, fetchImpl = fetch) {
  const results = await Promise.all(urls.map(async (gameHost) => {
    const started = performance.now();
    try {
      const response = await fetchImpl(`${gameHost.replace(/\/$/, '')}/info`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return null;
      const info = await response.json();
      const url = new URL(gameHost);
      return {
        name: info.name ?? 'BV2 Web Server',
        ip: url.hostname,
        port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
        map: info.map ?? '',
        gameType: info.gameType ?? 0,
        players: info.players ?? 0,
        maxPlayers: info.maxPlayers ?? 16,
        ping: Math.max(0, Math.round(performance.now() - started)),
      };
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean).sort((a, b) => a.ping - b.ping || a.name.localeCompare(b.name));
}
