// /api/log-rating.js
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
  const repoName = 'referral-codes';
  const filePath = 'ratings-log.csv';

  const { timestamp, session_id, ref, book, chapter, rating, url, userAgent = '' } = req.body || {};
  const rNum = Number(rating);

  // Simple validation + honeypot
  if (!timestamp || !book || typeof chapter === 'undefined' || !rNum || rNum < 1 || rNum > 5) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const cleanRef = (ref && String(ref).trim()) || 'NEW';
  const line = [
    timestamp,
    session_id || '',
    cleanRef,
    String(book).trim(),
    String(chapter).trim(),
    String(rNum),
    url || '',
    userAgent.replace(/\n|\r/g, ' ')
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');

  const githubApi = (p) => `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${p}`;

  try {
    // Read file (or create if missing)
    const current = await fetch(githubApi(filePath), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
    });

    let contentDecoded = '';
    let sha = undefined;

    if (current.ok) {
      const json = await current.json();
      contentDecoded = Buffer.from(json.content, 'base64').toString();
      sha = json.sha;
    } else if (current.status !== 404) {
      const err = await current.text();
      return res.status(current.status).json({ error: 'Fetch ratings file failed', details: err });
    }

    // Ensure header
    const header = `timestamp,session_id,ref,book,chapter,rating,url,userAgent`;
    const trimmed = contentDecoded.trim();
    const hasHeader = trimmed.startsWith(header);
    const base = hasHeader ? trimmed : (trimmed ? `${header}\n${trimmed}` : header);

    // Append line
    const updated = `${base}\n${line}`;
    const encoded = Buffer.from(updated).toString('base64');

    const put = await fetch(githubApi(filePath), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify({ message: `Add rating`, content: encoded, sha })
    });
    if (!put.ok) {
      const err = await put.text();
      return res.status(put.status).json({ error: 'Update ratings file failed', details: err });
    }

    // Compute summary for this book/chapter
    const rows = updated.split('\n').slice(1) // skip header
      .map(r => r.split(',').map(s => s.replace(/^"|"$/g, '').replace(/""/g, '"')))
      .filter(cols => cols.length >= 8);

    let count = 0;
    const breakdown = { '1':0, '2':0, '3':0, '4':0, '5':0 };
    for (const cols of rows) {
      const [ts, sid, rf, bk, ch, rt] = cols;
      if (bk === String(book).trim() && ch === String(chapter).trim()) {
        const rn = Number(rt);
        if (rn >= 1 && rn <= 5) {
          count++;
          breakdown[String(rn)]++;
        }
      }
    }
    const totalPoints = breakdown['1']*1 + breakdown['2']*2 + breakdown['3']*3 + breakdown['4']*4 + breakdown['5']*5;
    const avg = count ? +(totalPoints / count).toFixed(2) : 0;

    return res.status(200).json({ ok: true, count, avg, breakdown });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', details: e.message });
  }
}
