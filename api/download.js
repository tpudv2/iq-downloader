const https = require('https');
const http = require('http');
const { URL } = require('url');

const ALLOWED_HOSTS = /\.(cdninstagram\.com|fbcdn\.net|instagram\.com)$/i;

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, filename } = req.query;
  if (!url) return res.status(400).json({ error: 'missing url' });

  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'bad url' }); }

  if (!ALLOWED_HOSTS.test(parsed.hostname)) {
    return res.status(403).json({ error: 'forbidden host' });
  }

  const ext = url.includes('.mp4') ? 'mp4' : 'jpg';
  const name = filename || `snaggr_media.${ext}`;

  const mod = parsed.protocol === 'https:' ? https : http;
  const proxyReq = mod.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.instagram.com/',
    },
  }, (proxyRes) => {
    if (proxyRes.statusCode >= 400) {
      return res.status(proxyRes.statusCode).json({ error: 'upstream error' });
    }
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    if (proxyRes.headers['content-length']) {
      res.setHeader('Content-Length', proxyRes.headers['content-length']);
    }
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[download proxy]', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'proxy error' });
  });
};
