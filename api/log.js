export default async function handler(req, res) {
  const fs = require('fs');
  const path = require('path');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const logPath = path.join(process.cwd(), 'referral-log-trojan.csv');

  try {
    const body = req.body;

    // Get ref from body first, fallback to URL params, else NEW
    let ref = body.ref || '';
    if (body.urlParamsRaw) {
      const params = new URLSearchParams(body.urlParamsRaw);
      const refFromUrl = params.get('ref');
      if (refFromUrl) ref = refFromUrl;
    }
    if (!ref) ref = 'NEW';

    const logEntry = {
      ref: ref,
      timestamp: new Date().toISOString(),
      sessionID: body.sessionID || '',
      chapter: body.chapter || '',
      book: body.book || '',
      userAgent: body.userAgent || '',
      localStorage: body.localStorage || '',
      sourceURL: body.sourceURL || '',
      ipAddress: body.ipAddress || '',
      urlParamsRaw: body.urlParamsRaw || ''
    };

    const headers = Object.keys(logEntry).join(',');
    const values = Object.values(logEntry)
      .map(v => `"${(v || '').toString().replace(/"/g, '""')}"`)
      .join(',');

    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, headers + '\n');
    }

    fs.appendFileSync(logPath, values + '\n');

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Log error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to log' });
  }
}
