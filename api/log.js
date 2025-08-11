export default async function handler(req, res) {
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
  const filePath  = 'ratings-log.csv';

  const { timestamp, ref, book, chapter, rating, url } = req.body;
  if (!timestamp || !book || chapter === undefined || !rating) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const cleanRef = (ref && String(ref).trim()) || 'NEW';
  const rNum = Number(rating);
  if (isNaN(rNum) || rNum < 1 || rNum > 5) {
    return res.status(400).json({ error: 'Invalid rating value' });
  }

  const newLine = `${timestamp},${cleanRef},${book},${chapter},${rNum},${url}`;

  try {
    const githubApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;
    const getRes = await fetch(githubApiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
    });

    let content = '';
    let sha;
    if (getRes.ok) {
      const json = await getRes.json();
      content = Buffer.from(json.content, 'base64').toString();
      sha = json.sha;
    } else if (getRes.status !== 404) {
      const errText = await getRes.text();
      return res.status(getRes.status).json({ error: errText });
    }

    if (!content.startsWith('timestamp,ref,book,chapter,rating,url')) {
      content = 'timestamp,ref,book,chapter,rating,url\n' + content.trim();
    }
    const updated = content.trim() + '\n' + newLine;
    const encoded = Buffer.from(updated).toString('base64');

    const putRes = await fetch(githubApiUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify({
        message: 'Add rating entry',
        content: encoded,
        sha
      })
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return res.status(putRes.status).json({ error: errText });
    }

    // Calculate summary for this book/chapter
    const rows = updated.split('\n').slice(1); // skip header
    let count = 0;
    let sum = 0;
    const breakdown = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

    rows.forEach(row => {
      const cols = row.split(',');
      if (cols.length >= 5) {
        const [ , , b, c, r ] = cols;
        if (b === book && c === String(chapter)) {
          const num = Number(r);
          if (!isNaN(num)) {
            count++;
            sum += num;
            breakdown[String(num)]++;
          }
        }
      }
    });

    const avg = count ? (sum / count).toFixed(2) : 0;
    return res.status(200).json({ ok: true, count, avg, breakdown });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
