const ytDlp = require('yt-dlp-exec');

const IG_URL_RE = /instagram\.com\/(p|reel|reels|tv)\/[a-z0-9_\-]+/i;

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function classifyEntry(entry) {
  const hasVideo = entry.vcodec && entry.vcodec !== 'none';
  return hasVideo ? 'video' : 'image';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { url } = req.body || {};
  if (!url || !IG_URL_RE.test(url)) {
    return res.status(200).json({ error: 'invalid' });
  }

  try {
    const info = await ytDlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      addHeader: [
        'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer:https://www.instagram.com/',
      ],
    });

    const account = {
      username: info.uploader_id || info.uploader || 'unknown',
      fullName: info.uploader || '',
    };

    let items = [];

    if (info._type === 'playlist' && Array.isArray(info.entries)) {
      items = info.entries.map((entry, i) => ({
        id: entry.id || `item-${i}`,
        kind: classifyEntry(entry),
        url: entry.url,
        thumbnail: entry.thumbnail,
        w: entry.width || 1080,
        h: entry.height || 1080,
        duration: entry.duration ? formatDuration(entry.duration) : null,
      }));
    } else {
      const kind = classifyEntry(info);
      items = [{
        id: info.id,
        kind,
        url: info.url,
        thumbnail: info.thumbnail,
        w: info.width || 1080,
        h: info.height || (kind === 'video' ? 1920 : 1080),
        duration: info.duration ? formatDuration(info.duration) : null,
      }];
    }

    if (!items.length) return res.status(200).json({ error: 'empty' });

    const type = items.length > 1 ? 'carousel' : items[0].kind;

    return res.status(200).json({
      error: null,
      post: { url, type, account, items },
    });
  } catch (err) {
    const msg = String(err.stderr || err.message || '').toLowerCase();
    if (msg.includes('private') || msg.includes('login required') || msg.includes('not available')) {
      return res.status(200).json({ error: 'private' });
    }
    console.error('[yt-dlp]', err.stderr || err.message);
    return res.status(200).json({ error: 'fetch_failed' });
  }
};
