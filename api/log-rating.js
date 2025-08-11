// /api/log-rating.js
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
  if (!token) return res.status(500).json({ error: 'Missing GITHUB_TOKEN' });

  const repoOwner = 'SMorris-DaVinci';
  const repoName = 'referral-codes';
  const filePath  = 'ratings-log.csv';

  const apiUrl = (p) => `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${p}`;

  // ---------- helpers ----------
  const safe = (v) => {
    if (v === undefined || v === null) return '""';
    const s = String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const DESIRED_HEADER = [
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
  ];

  const HEADER_MIN = [
    'timestamp','session_id','ref','book','chapter','rating','url','userAgent'
  ];

  function parseCsv(content) {
    const lines = content.trim() ? content.trim().split('\n') : [];
    if (!lines.length) return { header: [], rows: [] };
    const header = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      // very simple CSV cell unquote + escaped quotes
      return line.split(',').map(cell =>
        cell.replace(/^"|"$/g, '').replace(/""/g, '"')
      );
    });
    return { header, rows };
  }

  function indicesByName(header) {
    // Build a map for whichever header we have (old or new).
    const idx = {};
    const want = new Set([...DESIRED_HEADER, ...HEADER_MIN]);
    header.forEach((name, i) => {
      if (want.has(name)) idx[name] = i;
    });
    return idx;
  }

  function computeSummary(header, rows, book, chapter) {
    const idx = indicesByName(header);
    const iBook    = idx['book'];
    const iChapter = idx['chapter'];
    const iRating  = idx['rating'];

    if (iBook == null || iChapter == null || iRating == null) {
      return { ok: true, count: 0, avg: 0, breakdown: {1:0,2:0,3:0,4:0,5:0} };
    }

    let count = 0;
    const breakdown = { '1':0, '2':0, '3':0, '4':0, '5':0 };

    for (const r of rows) {
      if (!r || r.length <= iRating) continue;
      if (String(r[iBook]) === String(book) && String(r[iChapter]) === String(chapter)) {
        const rn = Number(r[iRating]);
        if (rn >= 1 && rn <= 5) {
          count++;
          breakdown[String(rn)]++;
        }
      }
    }
    const total = breakdown['1']*1 + breakdown['2']*2 + breakdown['3']*3 + breakdown['4']*4 + breakdown['5']*5;
    const avg = count ? +(total / count).toFixed(2) : 0;
    return { ok: true, count, avg, breakdown };
  }

  async function readCsv() {
    const r = await fetch(apiUrl(filePath), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (r.status === 404) return { exists: false, content: '' };
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Fetch failed: ${err}`);
    }
    const j = await r.json();
    return { exists: true, sha: j.sha, content: Buffer.from(j.content, 'base64').toString() };
  }

  async function writeCsv(newContent, sha, message) {
    const put = await fetch(apiUrl(filePath), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify({
        message,
        content: Buffer.from(newContent).toString('base64'),
        ...(sha ? { sha } : {})
      })
    });
    if (!put.ok) {
      const err = await put.text();
      throw new Error(`Update failed: ${err}`);
    }
  }

  // ---------- request body ----------
  const body = req.body || {};
  const {
    summary,          // when present and truthy => summary only
    timestamp,
    session_id,
    ref = 'NEW',
    book,
    chapter,
    rating,
    url,
    userAgent,
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
  } = body;

  try {
    // 1) Read existing CSV (or treat as empty)
    const current = await readCsv();

    // Ensure header is present & correct
    let content = current.content || '';
    const hasAny = content.trim().length > 0;
    let { header, rows } = parseCsv(content);

    const headerIsDesired = header.length && header.join(',') === DESIRED_HEADER.join(',');
    if (!hasAny) {
      // empty file: start with desired header
      content = DESIRED_HEADER.join(',') + '\n';
      header = [...DESIRED_HEADER];
      rows = [];
    } else if (!headerIsDesired) {
      // if we had the older minimal header, keep it but *prepend* the desired header
      const wanted = DESIRED_HEADER.join(',');
      const minimal = HEADER_MIN.join(',');
      if (header.join(',') === minimal) {
        // turn the file into: desired-header + old-lines (so parsing by name still works)
        content = `${wanted}\n${content.trim()}\n`;
        ({ header, rows } = parseCsv(content));
      } else if (header.length) {
        // unknown header — put desired header on top for name-based parsing
        content = `${wanted}\n${content.trim()}\n`;
        ({ header, rows } = parseCsv(content));
      }
    }

    // 2) If summary requested, answer and stop (no write)
    if (summary) {
      const resp = computeSummary(header, rows, book, chapter);
      return res.status(200).json(resp);
    }

    // 3) Validate & append row if rating present
    const rNum = Number(rating);
    if (!timestamp || !book || typeof chapter === 'undefined' || !rNum || rNum < 1 || rNum > 5) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const row = [
      safe(timestamp),
      safe(session_id),
      safe(ref),
      safe(book),
      safe(chapter),
      safe(rNum),
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

    // append and write
    const updated = `${content.trim()}\n${row}\n`;
    await writeCsv(updated, current.sha, `Add rating ${rNum} (${book}/${chapter})`);

    // 4) Recompute summary (so the page can show fresh numbers immediately)
    const { header: h2, rows: r2 } = parseCsv(updated);
    const resp = computeSummary(h2, r2, book, chapter);

    return res.status(200).json(resp);
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', details: e.message });
  }
}
