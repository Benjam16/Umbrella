/**
 * Lightweight “browser” context: DuckDuckGo instant answer (no API key).
 * Feeds the Chaos Specialist real-world hints when available.
 */
export async function fetchBrowserHint(query: string): Promise<string | null> {
  if (
    process.env.UMBRELLA_BROWSER_HINT_DISABLED === '1' ||
    process.env.UMBRELLA_BROWSER_HINT_DISABLED === 'true'
  ) {
    return null;
  }
  const trimmed = query.trim().slice(0, 280);
  if (!trimmed) return null;
  try {
    const q = encodeURIComponent(trimmed);
    const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      AbstractText?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };
    const abstract = j.AbstractText?.trim();
    if (abstract) return abstract.slice(0, 1500);
    const first = j.RelatedTopics?.find((t) => t.Text);
    if (first?.Text) return first.Text.slice(0, 1500);
    return null;
  } catch {
    return null;
  }
}

function hostAllowed(hostname: string, allowlist: string | undefined): boolean {
  if (!allowlist?.trim()) return true;
  const hosts = allowlist.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  const h = hostname.toLowerCase();
  return hosts.some((a) => h === a || h.endsWith(`.${a}`));
}

function stripHtmlToText(html: string, maxLen: number): string {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = noStyle
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLen);
}

/**
 * Optional direct URL fetch for Chaos Specialist (bounded text).
 * Enable: `UMBRELLA_WEB_FETCH=1`. Optional `UMBRELLA_WEB_FETCH_ALLOWLIST=host1,host2`
 * (if unset, only https URLs are attempted; still use with care).
 */
export async function fetchUrlTextPreview(rawUrl: string): Promise<string | null> {
  if (
    process.env.UMBRELLA_WEB_FETCH !== '1' &&
    process.env.UMBRELLA_WEB_FETCH !== 'true'
  ) {
    return null;
  }
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.protocol === 'http:' && process.env.UMBRELLA_WEB_FETCH_HTTP !== '1') {
    return null;
  }
  const allow = process.env.UMBRELLA_WEB_FETCH_ALLOWLIST?.trim();
  if (!hostAllowed(u.hostname, allow)) return null;

  const maxBytes = Math.min(
    Math.max(4096, parseInt(process.env.UMBRELLA_WEB_FETCH_MAX_BYTES || '65536', 10) || 65536),
    512_000,
  );
  const textMax = Math.min(
    parseInt(process.env.UMBRELLA_WEB_FETCH_TEXT_MAX || '4000', 10) || 4000,
    16_000,
  );

  try {
    const r = await fetch(u.toString(), {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        'User-Agent': 'UmbrellaChaosHint/1.0',
      },
      signal: AbortSignal.timeout(
        Math.min(
          parseInt(process.env.UMBRELLA_WEB_FETCH_TIMEOUT_MS || '15000', 10) || 15000,
          60_000,
        ),
      ),
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const raw = decoder.decode(buf);
    if (ct.includes('text/html')) {
      return stripHtmlToText(raw, textMax) || null;
    }
    if (ct.includes('text/plain') || ct.includes('json')) {
      return raw.replace(/\s+/g, ' ').trim().slice(0, textMax) || null;
    }
    return stripHtmlToText(raw, textMax) || raw.slice(0, textMax);
  } catch {
    return null;
  }
}
