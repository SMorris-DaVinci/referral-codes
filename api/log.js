// /api/log.js — Referral logger → referral-log-trojan.csv (matches provided header)
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
  const filePath  = 'referral-log-trojan.csv';

  // Body fields we accept
  const {
    ref: refBody = '',
    timestamp,
    sessionID = '',            // note: using sessionID (not session_id) to match your header
    chapter = '0',
    book = 'trojan',
    userAgent = '',
    localStorage: ls = '',     // stringified localStorage if you send it
    sourceURL = '',
    ipAddress = '',
    urlParamsRaw = ''
  } = req.body || {};

  if (!timestamp) return res.status(400).json({ error: 'Missing timestamp' });

  // Recover ref from urlParamsRaw if missing
  let ref = (refBody || '').trim();
  if (!ref && urlParamsRaw) {
    try {
      const p = new URLSearchParams(urlParamsRaw);
      const r = (p.get('ref') || '').trim();
      if (r) ref = r;
    } catch (_) {}
  }
  if (!ref) ref = 'NEW';

  // CSV helpers
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // Exact header you provided
  const HEADER = 'ref,timestamp,sessionID,chapter,book,userAgent,localStorage,sourceURL,ipAddress,urlParamsRaw';

  // Row in that exact order
  const row = [
    q(ref),
    q(timestamp),
    q(sessionID),
    q(String(chapter).trim()),
    q(String(book).trim()),
    q(userAgent.replace(/\r|\n/g, ' ')),
    q(String(ls)),
    q(sourceURL),
    q(ipAddress),
    q(urlParamsRaw)
  ].join(',');

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

  try {
    // Read current file (or 404)
    const cur = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
    });

    let updatedContent, sha;

    if (cur.ok) {
      const json = await cur.json();
      const existing = Buffer.from(json.content, 'base64').toString();
      const first = (existing.split('\n')[0] || '').trim();
      const hasHeader = first === HEADER;

      updatedContent = hasHeader
        ? `${existing.trim()}\n${row}\n`
        : `${HEADER}\n${existing.trim().replace(/^\s*$/, '')}\n${row}\n`;

      sha = json.sha;
    } else if (cur.status === 404) {
      updatedContent = `${HEADER}\n${row}\n`;
    } else {
      const err = await cur.text();
      return res.status(cur.status).json({ error: 'Failed to fetch file', details: err });
    }

    // Write back
    const put = await fetch(apiUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify({
        message: `Add referral (${ref} ${book}/${chapter})`,
        content: Buffer.from(updatedContent).toString('base64'),
        ...(sha ? { sha } : {})
      })
    });

    if (!put.ok) {
      const err = await put.text();
      return res.status(put.status).json({ error: 'Failed to update file', details: err });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', details: e.message });
  }
}
