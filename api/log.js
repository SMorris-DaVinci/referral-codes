// /api/log.js  — referral click logger (Trojan)
// Writes to: referral-log-trojan.csv with header:
// ref,timestamp,sessionID,chapter,book,userAgent,localStorage,sourceURL,ipAddress,urlParamsRaw

export default async function handler(req, res) {
  // CORS / preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'Missing GITHUB_TOKEN' });
  }

  const owner = 'SMorris-DaVinci';
  const repo  = 'referral-codes';
  const path  = 'referral-log-trojan.csv';

  // CSV header must match exactly:
  const HEADER = 'ref,timestamp,sessionID,chapter,book,userAgent,localStorage,sourceURL,ipAddress,urlParamsRaw';

  // Helper to CSV-escape one value
  const q = (v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`;

  try {
    const body = req.body || {};

    // Normalize fields to match your header
    const ref         = (body.ref ?? '').toString();
    const timestamp   = body.timestamp || new Date().toISOString();

    // Accept either sessionID or session_id from clients
    const sessionID   = body.sessionID || body.session_id || '';

    const chapter     = (body.chapter ?? '').toString();
    const book        = (body.book ?? '').toString();
    const userAgent   = body.userAgent || '';
    const localStorage= body.localStorage || '';
    const sourceURL   = body.sourceURL || '';
    // Accept either ipAddress or ip
    const ipAddress   = body.ipAddress || body.ip || '';
    const urlParamsRaw= body.urlParamsRaw || '';

    // Build one CSV row (order exactly matches HEADER)
    const row = [
      q(ref),
      q(timestamp),
      q(sessionID),
      q(chapter),
      q(book),
      q(userAgent),
      q(localStorage),
      q(sourceURL),
      q(ipAddress),
      q(urlParamsRaw)
    ].join(',');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    // Fetch current file
    const current = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    let updatedContent;
    let sha;

    if (current.ok) {
      const json = await current.json();
      const existing = Buffer.from(json.content, 'base64').toString();

      const hasHeader = existing.split('\n')[0].trim() === HEADER;
      // Ensure header at top, then append new row
      updatedContent = hasHeader
        ? `${existing.trim()}\n${row}\n`
        : `${HEADER}\n${existing.trim().replace(/^\s*$/, '')}\n${row}\n`;

      sha = json.sha;
    } else if (current.status === 404) {
      // Create new file with header
      updatedContent = `${HEADER}\n${row}\n`;
    } else {
      const err = await current.text();
      return res.status(current.status).json({ ok: false, error: 'Fetch referral log failed', details: err });
    }

    // Commit update
    const put = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: `Log referral ${ref || '(no-ref)'}`,
        content: Buffer.from(updatedContent).toString('base64'),
        ...(sha ? { sha } : {})
      })
    });

    if (!put.ok) {
      const err = await put.text();
      return res.status(put.status).json({ ok: false, error: 'Update referral log failed', details: err });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Unexpected error', details: e.message });
  }
}
