// /api/log-tip-intent.js
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
  const filePath  = 'tip-intent-log.csv';

  // expected body fields
  const {
    timestamp,
    session_id,
    ref,
    book,
    chapter,
    url,
    userAgent = '',
    sourceURL = '',
    urlParamsRaw = ''
  } = req.body || {};

  if (!timestamp) {
    return res.status(400).json({ error: 'Missing timestamp' });
  }

  // CSV safe-quote
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // header + row (order matters)
  const header = 'timestamp,session_id,ref,book,chapter,url,userAgent,sourceURL,urlParamsRaw';
  const line = [
    q(timestamp),
    q(session_id || ''),
    q((ref && String(ref).trim()) || 'NEW'),
    q(String(book ?? '').trim()),
    q(String(chapter ?? '').trim()),
    q(url || ''),
    q(userAgent),
    q(sourceURL),
    q(urlParamsRaw)
  ].join(',');

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

  try {
    // read current file (if any)
    const cur = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    let updatedContent;
    let sha;

    if (cur.ok) {
      const json = await cur.json();
      const existing = Buffer.from(json.content, 'base64').toString();
      const hasHeader = existing.split('\n')[0].trim() === header;

      updatedContent = hasHeader
        ? `${existing.trim()}\n${line}\n`
        : `${header}\n${existing.trim().replace(/^\s*$/, '')}\n${line}\n`;

      sha = json.sha;
    } else if (cur.status === 404) {
      // new file
      updatedContent = `${header}\n${line}\n`;
    } else {
      const err = await cur.text();
      return res.status(cur.status).json({ error: 'Failed to fetch file', details: err });
    }

    // write back
    const put = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: `Add tip intent (${book}/${chapter})`,
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
