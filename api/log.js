export default async function handler(req, res) {
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
  const repoOwner = 'SMorris-DaVinci';
  const repoName = 'referral-codes';

  const {
    timestamp, ref, userAgent,
    chapter, book, tipIntent,
    localStorage, sourceURL,
    ipAddress, urlParamsRaw,
    rating, url
  } = req.body;

  let filePath = '';
  let newLine = '';
  let commitMessage = '';

  // --- TIP / REFERRAL logging ---
  const isReferral = ref && userAgent && chapter && book && tipIntent !== undefined;

  if (isReferral) {
    filePath = 'referral-log-trojan.csv';
    newLine = `"${ref || 'NEW'}","${timestamp}","${userAgent}","${chapter}","${book}","${tipIntent}","${localStorage}","${sourceURL}","${ipAddress}","${urlParamsRaw}"`;
    commitMessage = `Add referral: ${ref || 'NEW'}`;
  }

  // --- SIMPLIFIED RATING logging ---
  else if (rating !== undefined && url) {
    filePath = 'ratings-log.csv';
    const safeRef = ref || 'NONE';
    newLine = `"${timestamp}","${safeRef}","${rating}","${url}"`;
    commitMessage = `Add rating by ${safeRef}`;
  }

  else {
    return res.status(400).json({ error: 'Invalid payload structure' });
  }

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

  try {
    const currentFile = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!currentFile.ok) {
      const err = await currentFile.text();
      return res.status(currentFile.status).json({ error: 'Failed to fetch file', details: err });
    }

    const fileData = await currentFile.json();
    const contentDecoded = Buffer.from(fileData.content, 'base64').toString();
    const updatedContent = `${contentDecoded.trim()}\n${newLine}`;
    const encodedContent = Buffer.from(updatedContent).toString('base64');

    const update = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: commitMessage,
        content: encodedContent,
        sha: fileData.sha
      })
    });

    if (!update.ok) {
      const err = await update.text();
      return res.status(update.status).json({ error: 'Failed to update file', details: err });
    }

    return res.status(200).json({ message: 'Success' });

  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
