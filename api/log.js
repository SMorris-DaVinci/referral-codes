// /api/log.js
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
    return res.status(500).json({ ok: false, error: 'Missing GITHUB_TOKEN env var' });
  }

  // Repo + file target
  const repoOwner = 'SMorris-DaVinci';
  const repoName  = 'referral-codes';
  const filePath  = 'referral-log-trojan.csv';

  // CSV helpers
  const safe = (v) => {
    if (v === undefined || v === null) return '""';
    const s = String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  // Expected CSV header (exact order)
  const HEADER = [
    'ref',
    'timestamp',
    'sessionID',
    'chapter',
    'book',
    'userAgent',
    'localStorage',
    'sourceURL',
    'ipAddress',
    'urlParamsRaw'
  ].join(',');

  // Extract payload
  const body = req.body || {};

  // Resolve ref: body.ref -> urlParamsRaw(ref) -> NEW
  let ref = (body.ref || '').trim();
  if (!ref && body.urlParamsRaw) {
    try {
      const p = new URLSearchParams(body.urlParamsRaw);
      const fromUrl = (p.get('ref') || '').trim();
      if (fromUrl) ref = fromUrl;
    } catch {
      /* ignore bad query strings */
    }
  }
  if (!ref) ref = 'NEW';

  // Build one CSV row (exact column order)
  const row = [
    safe(ref),
    safe(new Date().toISOString()),
    safe(body.sessionID || ''),           // <- sessionID (camelCase)
    safe(body.chapter || ''),
    safe(body.book || ''),
    safe(body.userAgent || ''),
    safe(body.localStorage || ''),
    safe(body.sourceURL || ''),
    safe(body.ipAddress || ''),
    safe(body.urlParamsRaw || '')
  ].join(',');

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

  try {
    // Read current file (to append)
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

      // Ensure correct header
      const lines = existing.trim().split('\n');
      const hasHeader = lines.length > 0 && lines[0].trim() === HEADER;

      if (hasHeader) {
        updatedContent = `${existing.trim()}\n${row}\n`;
      } else {
        // If a different/old header exists, keep it below our header so the file stays readable
        const cleaned = existing.trim().replace(/^\s*$/, '');
        updatedContent = cleaned
          ? `${HEADER}\n${cleaned}\n${row}\n`
          : `${HEADER}\n${row}\n`;
      }

      sha = json.sha;
    } else if (current.status === 404) {
      // Create new file with header
      updatedContent = `${HEADER}\n${row}\n`;
    } else {
      const err = await current.text();
      return res.status(current.status).json({ ok: false, error: 'Fetch file failed', details: err });
    }

    // PUT updated content
    const put = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: `Log referral ${ref}`,
        content: Buffer.from(updatedContent).toString('base64'),
        ...(sha ? { sha } : {})
      })
    });

    if (!put.ok) {
      const err = await put.text();
      return res.status(put.status).json({ ok: false, error: 'Update file failed', details: err });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Unexpected error', details: e.message });
  }
}
