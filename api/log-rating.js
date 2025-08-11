// /api/log-rating.js
export default async function handler(req, res) {
  // CORS preflight
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
  const repoName = 'referral-codes';
  const filePath = 'ratings-log.csv'; // keeping same file; see note about header below

  // Defensive extractor to keep CSV clean
  const safe = (v) => {
    if (v === undefined || v === null) return '';
    const s = String(v);
    // escape double quotes by doubling them
    return `"${s.replace(/"/g, '""')}"`;
  };

  // Body from client
  const {
    timestamp,
    session_id,
    ref = 'NEW',
    book,
    chapter,
    rating,
    url,
    userAgent,

    // new fields
    referrer,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    viewport_w,
    viewport_h,
    screen_w,
    screen_h,
    device_mem_gb,
    cpu_cores,
    timezone,
    locale,
    dnt,
    prefers_reduced_motion,
    prefers_color_scheme,
    platform,
    effective_connection_type,
    downlink_mbps
  } = req.body || {};

  // Compose one CSV row (order matches header below)
  const row = [
    safe(timestamp),
    safe(session_id),
    safe(ref),
    safe(book),
    safe(chapter),
    safe(rating),
    safe(url),
    safe(userAgent),
    safe(referrer),
    safe(utm_source),
    safe(utm_medium),
    safe(utm_campaign),
    safe(utm_content),
    safe(viewport_w),
    safe(viewport_h),
    safe(screen_w),
    safe(screen_h),
    safe(device_mem_gb),
    safe(cpu_cores),
    safe(timezone),
    safe(locale),
    safe(dnt),
    safe(prefers_reduced_motion),
    safe(prefers_color_scheme),
    safe(platform),
    safe(effective_connection_type),
    safe(downlink_mbps)
  ].join(',');

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

  try {
    // Fetch current file (to append)
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

      // Ensure header is present; if not, add it automatically
      const desiredHeader = [
        'timestamp',
        'session_id',
        'ref',
        'book',
        'chapter',
        'rating',
        'url',
        'userAgent',
        'referrer',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'viewport_w',
        'viewport_h',
        'screen_w',
        'screen_h',
        'device_mem_gb',
        'cpu_cores',
        'timezone',
        'locale',
        'dnt',
        'prefers_reduced_motion',
        'prefers_color_scheme',
        'platform',
        'effective_connection_type',
        'downlink_mbps'
      ].join(',');

      const hasHeader = existing.split('\n')[0].trim() === desiredHeader;
      updatedContent = hasHeader
        ? `${existing.trim()}\n${row}\n`
        : `${desiredHeader}\n${existing.trim().replace(/^\s*$/, '')}\n${row}\n`;

      sha = json.sha;
    } else if (current.status === 404) {
      // File doesn't exist yet: create with header
      const header = [
        'timestamp',
        'session_id',
        'ref',
        'book',
        'chapter',
        'rating',
        'url',
        'userAgent',
        'referrer',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'viewport_w',
        'viewport_h',
        'screen_w',
        'screen_h',
        'device_mem_gb',
        'cpu_cores',
        'timezone',
        'locale',
        'dnt',
        'prefers_reduced_motion',
        'prefers_color_scheme',
        'platform',
        'effective_connection_type',
        'downlink_mbps'
      ].join(',');
      updatedContent = `${header}\n${row}\n`;
    } else {
      const err = await current.text();
      return res.status(current.status).json({ error: 'Failed to fetch file', details: err });
    }

    // Commit updated file
    const put = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: `Add rating ${rating} (${book}/${chapter})`,
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
