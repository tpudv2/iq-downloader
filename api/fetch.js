const IG_URL_RE = /instagram\.com\/(p|reel|reels|tv)\/([a-z0-9_\-]+)/i;

// Build the cookie string: user's sessionId takes priority, falls back to server env var
function buildCookies(sessionId) {
  const serverCookies = process.env.INSTAGRAM_COOKIES || '';
  if (sessionId) {
    // Inject/replace sessionid in the server cookie string if present, otherwise prepend
    const base = serverCookies.replace(/\bsessionid=[^;]*(;\s*)?/g, '').trim().replace(/;$/, '');
    return `sessionid=${sessionId}${base ? '; ' + base : ''}`;
  }
  return serverCookies;
}

// Browser-like headers to avoid bot detection
function getBrowserHeaders(sessionId) {
  const cookies = buildCookies(sessionId);
  const h = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
  };
  if (cookies) h['Cookie'] = cookies;
  return h;
}

// Curry headers with the sessionId for each scraping method
function makeHeaders(sessionId, extra) {
  return { ...getBrowserHeaders(sessionId), ...extra };
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\\u0026/g, '&').replace(/\\u002F/g, '/');
}

// ── Method 1: Instagram internal JSON API ────────────────────────────────────
async function fetchViaJsonApi(shortcode, sessionId) {
  const url = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
  const res = await fetch(url, {
    headers: makeHeaders(sessionId, { 'X-Requested-With': 'XMLHttpRequest' }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`json_api ${res.status}`);
  const json = await res.json();

  const media = json?.items?.[0] ?? json?.graphql?.shortcode_media ?? json?.data?.shortcode_media;
  if (!media) throw new Error('no_media_in_json');

  return buildFromGraphQL(media);
}

// ── Method 2: GraphQL endpoint ───────────────────────────────────────────────
async function fetchViaGraphQL(shortcode, sessionId) {
  const url = `https://www.instagram.com/graphql/query/?query_hash=2b0673e0dc4580674a88d426fe00ea90&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`;
  const res = await fetch(url, { headers: makeHeaders(sessionId), redirect: 'follow' });
  if (!res.ok) throw new Error(`graphql ${res.status}`);
  const json = await res.json();
  const media = json?.data?.shortcode_media;
  if (!media) throw new Error('no_media_in_graphql');
  return buildFromGraphQL(media);
}

// ── Method 3: Embed page HTML scraping ──────────────────────────────────────
async function fetchViaEmbed(shortcode, sessionId) {
  const url = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const res = await fetch(url, { headers: makeHeaders(sessionId), redirect: 'follow' });
  if (res.status === 404) throw Object.assign(new Error('not found'), { kind: 'invalid' });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const html = await res.text();

  if (html.includes('login_required') || html.includes('"is_private":true')) {
    throw Object.assign(new Error('private'), { kind: 'private' });
  }

  return parseEmbedHtml(html, shortcode);
}

// ── GraphQL media node → our format ─────────────────────────────────────────
function buildFromGraphQL(media) {
  const username = media.owner?.username || 'unknown';
  const fullName = media.owner?.full_name || username;
  const isVideo = media.__typename === 'GraphVideo' || media.is_video;
  const isCarousel = media.__typename === 'GraphSidecar';

  let items = [];
  if (isCarousel && media.edge_sidecar_to_children?.edges) {
    items = media.edge_sidecar_to_children.edges.map((e, i) => {
      const n = e.node;
      return {
        id: n.id || `item-${i}`,
        kind: n.is_video ? 'video' : 'image',
        url: n.video_url || n.display_url,
        thumbnail: n.display_url,
        w: n.dimensions?.width || 1080,
        h: n.dimensions?.height || 1080,
        duration: n.video_duration ? formatDuration(n.video_duration) : null,
      };
    });
  } else {
    items = [{
      id: media.id || 'item-0',
      kind: isVideo ? 'video' : 'image',
      url: media.video_url || media.display_url,
      thumbnail: media.display_url,
      w: media.dimensions?.width || 1080,
      h: media.dimensions?.height || (isVideo ? 1920 : 1080),
      duration: media.video_duration ? formatDuration(media.video_duration) : null,
    }];
  }

  return { account: { username, fullName }, items };
}

// ── Embed HTML parser ────────────────────────────────────────────────────────
function parseEmbedHtml(html, shortcode) {
  // Extract all quoted string values for known keys
  const field = (key) => {
    const m = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 's'));
    return m ? decodeEntities(m[1].replace(/\\n/g, '').replace(/\\/g, '')) : null;
  };
  const fieldAll = (key) => {
    const re = new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 'gs');
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) out.push(decodeEntities(m[1].replace(/\\/g, '')));
    return out;
  };

  const username = field('username') || shortcode;
  const fullName = field('full_name') || username;
  const durRaw = html.match(/"video_duration"\s*:\s*([\d.]+)/);
  const duration = durRaw ? formatDuration(parseFloat(durRaw[1])) : null;

  // Collect display_url (images) and video_url
  const displayUrls = fieldAll('display_url').filter(u => u.startsWith('http'));
  const videoUrls   = fieldAll('video_url').filter(u => u.startsWith('http'));

  const items = [];

  if (displayUrls.length || videoUrls.length) {
    const count = Math.max(displayUrls.length, videoUrls.length, 1);
    for (let i = 0; i < count; i++) {
      const vUrl = videoUrls[i];
      const iUrl = displayUrls[i];
      if (vUrl) {
        items.push({ id: `${shortcode}-${i}`, kind: 'video', url: vUrl, thumbnail: iUrl || null, w: 1080, h: 1920, duration });
      } else if (iUrl) {
        items.push({ id: `${shortcode}-${i}`, kind: 'image', url: iUrl, thumbnail: iUrl, w: 1080, h: 1080, duration: null });
      }
    }
  }

  // Raw fallback
  if (!items.length) {
    for (const m of html.matchAll(/src="(https:\/\/[^"]*\.mp4[^"]*)"/g)) {
      items.push({ id: `${shortcode}-v`, kind: 'video', url: decodeEntities(m[1]), thumbnail: null, w: 1080, h: 1920, duration });
    }
    if (!items.length) {
      for (const m of html.matchAll(/src="(https:\/\/[^"]*(?:cdninstagram|fbcdn)[^"]*\.jpg[^"]*)"/g)) {
        const u = decodeEntities(m[1]);
        if (!items.some(x => x.url === u)) {
          items.push({ id: `${shortcode}-${items.length}`, kind: 'image', url: u, thumbnail: u, w: 1080, h: 1080, duration: null });
        }
      }
    }
  }

  if (!items.length) throw Object.assign(new Error('no media'), { kind: 'empty' });

  return { account: { username, fullName }, items };
}

// ── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { url, sessionId } = req.body || {};
  const match = url && String(url).match(IG_URL_RE);
  if (!match) return res.status(200).json({ error: 'invalid' });

  // Sanitize: only keep the sessionid value (alphanumeric + %)
  const cleanSession = sessionId ? String(sessionId).replace(/[^a-zA-Z0-9%]/g, '').slice(0, 512) : '';

  const shortcode = match[2];
  const methods = [fetchViaJsonApi, fetchViaGraphQL, fetchViaEmbed];

  for (const method of methods) {
    try {
      const { account, items } = await method(shortcode, cleanSession);
      const type = items.length > 1 ? 'carousel' : items[0].kind;
      return res.status(200).json({
        error: null,
        post: { url: String(url).trim(), type, account, items },
      });
    } catch (err) {
      if (err.kind === 'private') return res.status(200).json({ error: 'private' });
      if (err.kind === 'invalid')  return res.status(200).json({ error: 'invalid' });
      // try next method
      console.error(`[${method.name}]`, shortcode, err.message);
    }
  }

  return res.status(200).json({ error: 'fetch_failed' });
};
