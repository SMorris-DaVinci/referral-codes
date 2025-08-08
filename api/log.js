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
    timestamp, ref, rating, url
    timestamp, ref, userAgent,
    chapter, book, tipIntent,
    localStorage, sourceURL,
    ipAddress, urlParamsRaw,
    rating, url
} = req.body;

  if (rating === undefined) {
    return res.status(400).json({ error: 'Missing rating field in payload' });
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

  // Parse book and chapter from the filename in the URL
  let book = 'UNKNOWN';
  let chapter = 'UNKNOWN';
  try {
    const fileName = new URL(url).pathname.split('/').pop(); // e.g. rating-trojan-0.html
    const match = fileName.match(/^rating-(.+)-(\d+)\.html$/);
    if (match) {
      book = match[1];
      chapter = match[2];
  // --- RATING logging ---
  else if (rating !== undefined && url) {
    filePath = 'ratings-log.csv';

    // Attempt to parse book and chapter from the filename
    let parsedBook = 'UNKNOWN';
    let parsedChapter = 'UNKNOWN';
    try {
      const fileName = new URL(url).pathname.split('/').pop(); // e.g. rating-trojan-0.html
      const match = fileName.match(/^rating-(.+)-(\d+)\.html$/);
      if (match) {
        parsedBook = match[1];
        parsedChapter = match[2];
      }
    } catch (e) {
      console.error('Failed to parse book/chapter from URL:', e.message);
}
  } catch (e) {
    console.error('Failed to parse book/chapter from URL:', e.message);

    newLine = `"${timestamp}","${parsedBook}","${parsedChapter}","${ref || 'NONE'}","${rating}"`;
    commitMessage = `Add rating: ${parsedBook}-${parsedChapter} by ${ref || 'NONE'}`;
  }

  else {
    return res.status(400).json({ error: 'Invalid payload structure' });
}

  const filePath = 'ratings-log.csv';
  const newLine = `"${timestamp}","${book}","${chapter}","${ref || 'NONE'}","${rating}"`;
  const commitMessage = `Add rating: ${book}-${chapter} by ${ref || 'NONE'}`;
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
