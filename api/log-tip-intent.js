// /api/log-tip-intent.js
export default async function handler(req, res) {
  // CORS / preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = process.env.GITHUB_TOKEN;
  const repoOwner = 'SMorris-DaVinci';
  const repoName  = 'referral-codes';
  const filePath  = 'tip-intent-log.csv';

  // Quote helper (same pattern as ratings)
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // Minimal, stable schema (feel free to extend later)
  const {
    timestamp,                 // ISO time
    session_id,                // same session id as ratings
    ref,                       // referral code or 'NEW'
    book,                      // e.g. 'trojan'
    chapter,                   // e.g. '0'
    url,                       // current page URL
    userAgent = '',            // UA
    sourceURL,                 // optional alias of url/referrer if you want
    urlParamsRaw = '',         // raw query string for debugging
  } = req.body || {};

  // Ensure basic fields; keep this lenient
  if (!timestamp || !book || typeof chapter === 'undefined') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const header = [
    'timestamp','session_id','ref','book','chapter','url','userAgent','sourceURL','urlParamsRaw'
  ].join(',');

  const row = [
    q(timestamp),
    q(session_id || ''),
    q((ref && String(ref).trim()) || 'NEW'),
    q(String(book).trim()),
    q(String(chapter).trim()),
    q(url || ''),
    q((userAgent || '').replace(/\n|\r/g, ' ')),
    q(sourceURL || ''),
    q(urlParamsRaw || '')
  ].join(',');

  const api = (p) => `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${p}`;

  try {
    const current = await fetch(api(filePath), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
    });

    let contentDecoded = '';
    let sha;
    if (current.ok) {
      const json = await current.json();
      contentDecoded = Buffer.from(json.content, 'base64').toString();
      sha = json.sha;
    } else if (current.status !== 404) {
      const err = await current.text();
      return res.status(current.status).json({ error: 'Fetch tip-intent file failed', details: err });
    }

    const trimmed = contentDecoded.trim();
    const hasHeader = trimmed.startsWith(header);
    const base = hasHeader ? trimmed : (trimmed ? `${header}\n${trimmed}` : header);

    const updated = `${base}\n${row}`;
    const encoded = Buffer.from(updated).toString('base64');

    const put = await fetch(api(filePath), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify({ message: 'Add tip intent', content: encoded, ...(sha ? { sha } : {}) })
    });

    if (!put.ok) {
      const err = await put.text();
      return res.status(put.status).json({ error: 'Update tip-intent file failed', details: err });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', details: e.message });
  }
}
