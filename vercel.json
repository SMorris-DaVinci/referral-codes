export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  const repoOwner = 'SMorris-DaVinci';
  const repoName = 'referral-codes';
  const filePath = 'pending-log-trojan.csv';

  const { ref, timestamp, userAgent, chapter, book, tipIntent, localStorage, sourceURL, ipAddress, urlParamsRaw } = req.body;
  const newLine = `"${ref}","${timestamp}","${userAgent}","${chapter}","${book}",${tipIntent},"${localStorage}","${sourceURL}","${ipAddress}","${urlParamsRaw}"`;

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

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
  const updatedContent = `${newLine}\n${contentDecoded}`;
  const encodedContent = Buffer.from(updatedContent).toString('base64');

  const update = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      message: `Add referral: ${ref}`,
      content: encodedContent,
      sha: fileData.sha
    })
  });

  if (!update.ok) {
    const err = await update.text();
    return res.status(update.status).json({ error: 'Failed to update file', details: err });
  }

  return res.status(200).json({ message: 'Success' });
}
