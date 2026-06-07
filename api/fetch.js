const IG_URL_RE = /instagram\.com\/(p|reel|reels|tv)\/([a-z0-9_\-]+)/i;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'no-cache',
};

function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Extract all JSON-like objects matching a key from an HTML string
function extractJsonField(html, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'g');
  const results = [];
  let m;
  while ((m = re.exec(html)) !== null) results.push(decodeEntities(m[1]));
  return results;
}

function parseEmbedHtml(html, shortcode) {
  // Private / login wall
  if (html.includes('login_required') || html.includes('"is_private":true') || html.includes('LoginAndSignupPage')) {
    throw Object.assign(new Error('private'), { kind: 'private' });
  }

  const items = [];

  // ── Try to find the structured media JSON block ─────────────────────────────
  // Instagram embeds media data inside a <script> as a JSON string with display_url / video_url
  const displayUrls = extractJsonField(html, 'display_url');
  const videoUrls   = extractJsonField(html, 'video_url');
  const thumbnails  = extractJsonField(html, 'thumbnail_src');

  // Carousel: each sidecar child has its own display_url
  // The first display_url is usually the post cover; subsequent ones are carousel slides
  if (displayUrls.length > 0 || videoUrls.length > 0) {
    // Interleave: if there's a video_url at index i use it, else use display_url
    const count = Math.max(displayUrls.length, videoUrls.length);
    for (let i = 0; i < count; i++) {
      const vUrl = videoUrls[i];
      const iUrl = displayUrls[i];
      if (vUrl) {
        items.push({ kind: 'video', url: vUrl, thumbnail: thumbnails[i] || iUrl || null });
      } else if (iUrl) {
        items.push({ kind: 'image', url: iUrl, thumbnail: iUrl });
      }
    }
  }

  // ── Fallback: raw regex on src attributes ────────────────────────────────────
  if (!items.length) {
    // Videos
    for (const m of html.matchAll(/src="(https:\/\/[^"]*\.mp4[^"]*)"/g)) {
      items.push({ kind: 'video', url: decodeEntities(m[1]), thumbnail: null });
    }
    // Images (Instagram CDN domains)
    if (!items.length) {
      for (const m of html.matchAll(/src="(https:\/\/[^"]*(?:cdninstagram|fbcdn)[^"]*\.jpg[^"]*)"/g)) {
        const u = decodeEntities(m[1]);
        if (!items.some(x => x.url === u)) items.push({ kind: 'image', url: u, thumbnail: u });
      }
    }
  }

  if (!items.length) throw Object.assign(new Error('no media'), { kind: 'empty' });

  // ── Account info ─────────────────────────────────────────────────────────────
  const usernameMatch = html.match(/"username"\s*:\s*"([a-z0-9_.]+)"/i);
  const fullNameMatch = html.match(/"full_name"\s*:\s*"([^"]+)"/);
  const username = usernameMatch ? usernameMatch[1] : shortcode;
  const fullName = fullNameMatch ? decodeEntities(fullNameMatch[1]) : username;

  // Duration
  const durMatch = html.match(/"video_duration"\s*:\s*([\d.]+)/);
  const duration = durMatch ? formatDuration(parseFloat(durMatch[1])) : null;

  return {
    account: { username, fullName },
    items: items.map((it, i) => ({
      id: `${shortcode}-${i}`,
      kind: it.kind,
      url: it.url,
      thumbnail: it.thumbnail,
      w: 1080,
      h: it.kind === 'video' ? 1920 : 1080,
      duration: it.kind === 'video' ? duration : null,
    })),
  };
}

async function scrapePost(shortcode) {
  // Try embed page — publicly accessible, no auth required for public posts
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const res = await fetch(embedUrl, { headers: HEADERS });

  if (res.status === 404) throw Object.assign(new Error('not found'), { kind: 'invalid' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  return parseEmbedHtml(html, shortcode);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { url } = req.body || {};
  const match = url && url.match(IG_URL_RE);
  if (!match) return res.status(200).json({ error: 'invalid' });

  const shortcode = match[2];

  try {
    const { account, items } = await scrapePost(shortcode);
    const type = items.length > 1 ? 'carousel' : items[0].kind;
    return res.status(200).json({
      error: null,
      post: { url: url.trim(), type, account, items },
    });
  } catch (err) {
    const kind = err.kind || 'fetch_failed';
    console.error('[fetch]', shortcode, err.message);
    return res.status(200).json({ error: kind });
  }
};
