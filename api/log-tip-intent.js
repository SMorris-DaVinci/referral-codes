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
  if (!token) return res.status(500).json({ error: 'Missing GITHUB_TOKEN' });

  const repoOwner = 'SMorris-DaVinci';
  const repoName  = 'referral-codes';
  const filePath  = 'tip-intent-log.csv';

  // expected POST body
  const {
    timestamp,
    session_id = '',
    ref = 'NEW',
    book = '',
    chapter = '',
    url = '',
    userAgent = '',
    sourceURL = '',
    urlParamsRaw = ''
  } = req.body || {};

  // header MUST match this order
  const HEADER = 'timestamp,session_id,ref,book,chapter,url,userAgent,sourceURL,urlParamsRaw';

  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`; // CSV escape
  const line = [
    q(timestamp || new Date().toISOString()),
    q(session_id),
    q(String(ref).trim() || 'NEW'),
    q(String(book).trim()),
    q(String(chapter).trim()),
    q(url),
    q(userAgent.replace(/\r|\n/g, ' ')),
    q(sourceURL),
    q(urlParamsRaw)
  ].join(',');

  const api = (p) => `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${p}`;

  try {
    // read current file (or 404)
    const current = await fetch(api(filePath), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
    });

    let content = '';
    let sha;

    if (current.ok) {
      const j = await current.json();
      content = Buffer.from(j.content, 'base64').toString();
      sha = j.sha;
    } else if (current.status !== 404) {
      const err = await current.text();
      return res.status(current.status).json({ error: 'Fetch tip-intent file failed', details: err });
    }

    // ensure header
    const trimmed = content.trim();
    const base = trimmed
      ? (trimmed.startsWith(HEADER) ? trimmed : `${HEADER}\n${trimmed}`)
      : HEADER;

    // append line
    const updated = `${base}\n${line}`;
    const encoded = Buffer.from(updated).toString('base64');

    const put = await fetch(api(filePath), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify({ message: 'Log tip-intent', content: encoded, ...(sha ? { sha } : {}) })
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
