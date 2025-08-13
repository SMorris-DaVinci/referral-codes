// /api/log.js — append to referral-log-trojan.csv with server-captured IP
export default async function handler(req, res) {
  // CORS / preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Missing GITHUB_TOKEN' });
  }

  const repoOwner = 'SMorris-DaVinci';
  const repoName  = 'referral-codes';
  const filePath  = 'referral-log-trojan.csv';

  // helper to CSV-escape
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // Extract IP from proxy headers (Vercel sets x-forwarded-for)
  const ipFromHeaders = (() => {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
    const xr = req.headers['x-real-ip'];
    if (typeof xr === 'string' && xr.length) return xr.trim();
    return '';
  })();

  // body fields sent by gateway page
  const b = req.body || {};
  const rowObj = {
    ref: b.ref || 'NEW',
    timestamp: b.timestamp || new Date().toISOString(),
    sessionID: b.sessionID || '',
    // You mentioned this table is always chapter 0 for Opossum Trap; default accordingly
    chapter: (b.chapter ?? '0'),
    book: b.book || 'trojan',
    userAgent: b.userAgent || '',
    localStorage: b.localStorage || '',
    sourceURL: b.sourceURL || '',
    ipAddress: b.ipAddress || ipFromHeaders,         // <-- server fills if client didn’t
    urlParamsRaw: b.urlParamsRaw || ''
  };

  // Build CSV header & row in the exact column order you use now
  const header = 'ref,timestamp,sessionID,chapter,book,userAgent,localStorage,sourceURL,ipAddress,urlParamsRaw';
  const row = [
    q(rowObj.ref),
    q(rowObj.timestamp),
    q(rowObj.sessionID),
    q(rowObj.chapter),
    q(rowObj.book),
    q(rowObj.userAgent),
    q(rowObj.localStorage),
    q(rowObj.sourceURL),
    q(rowObj.ipAddress),
    q(rowObj.urlParamsRaw)
  ].join(',');

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

  try {
    // read existing CSV (or 404 if new)
    const current = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    let content = '';
    let sha;

    if (current.ok) {
      const json = await current.json();
      content = Buffer.from(json.content, 'base64').toString();
      sha = json.sha;
    } else if (current.status !== 404) {
      const err = await current.text();
      return res.status(current.status).json({ error: 'Fetch failed', details: err });
    }

    // ensure header
    const trimmed = content.trim();
    const hasHeader = trimmed.startsWith(header);
    const base = hasHeader ? trimmed : (trimmed ? `${header}\n${trimmed}` : header);

    // append row
    const updated = `${base}\n${row}\n`;
    const encoded = Buffer.from(updated).toString('base64');

    const put = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: 'Log referral (server IP)',
        content: encoded,
        ...(sha ? { sha } : {})
      })
    });

    if (!put.ok) {
      const err = await put.text();
      return res.status(put.status).json({ error: 'Update failed', details: err });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', details: e.message });
  }
}
