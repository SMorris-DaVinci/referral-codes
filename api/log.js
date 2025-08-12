<!-- gateway-trojan.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Trojan referral gateway…</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color:#222; }
    .muted { color:#666; }
    .ok { color:#0b7; }
    .bad { color:#c00; }
  </style>
</head>
<body>
  <div id="msg" class="muted">Checking referral code…</div>

  <script>
  (async () => {
    const API_BASE = 'https://referral-codes-ten.vercel.app'; // your Vercel project
    const BOOK = 'trojan';
    const CHAPTER = '0'; // prologue
    const KOFI_URL = 'https://ko-fi.com/post/Prologue--Cold-War-Open--By-Bailey-Ryder-A0A51I0KH0';

    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const ref = (params.get('ref') || '').trim();

    // helper: get or create a persistent session id
    function getSessionId() {
      let sid = localStorage.getItem('session_id');
      if (!sid) {
        sid = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
        localStorage.setItem('session_id', sid);
      }
      return sid;
    }

    function show(text, cls) {
      const el = $('msg');
      el.textContent = text;
      el.className = cls || 'muted';
    }

    if (!ref) {
      show('Page-link blocked. Referral code invalid, or not found.', 'bad');
      return;
    }

    // fetch valid codes (single-column CSV, no header)
    let valid = false;
    try {
      const csv = await fetch('https://raw.githubusercontent.com/SMorris-DaVinci/referral-codes/main/codes-trojan.csv')
        .then(r => r.ok ? r.text() : Promise.reject(r.status));
      const codes = csv.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      valid = codes.includes(ref);
    } catch (e) {
      // if we can't load the list, fail closed
      valid = false;
    }

    if (!valid) {
      show('Page-link blocked. Referral code invalid, or not found.', 'bad');
      return;
    }

    // store referral + book/chapter + session id
    localStorage.setItem('ref', ref);
    localStorage.setItem('trojan_ref', ref); // legacy key you used before
    localStorage.setItem('book', BOOK);
    localStorage.setItem('chapter', CHAPTER);
    const sessionID = getSessionId();

    // fire-and-forget referral log to Vercel
    try {
      await fetch(API_BASE + '/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref,
          timestamp: new Date().toISOString(),
          sessionID,
          chapter: CHAPTER,
          book: BOOK,
          userAgent: navigator.userAgent,
          localStorage: JSON.stringify({ ref, book: BOOK, chapter: CHAPTER }),
          sourceURL: document.referrer || '',
          ipAddress: '',                 // left blank by design
          urlParamsRaw: location.search.slice(1)
        })
      });
    } catch (_) {
      // non-blocking
    }

    show('Referral accepted — taking you to the prologue…', 'ok');
    // short delay so a human can see the message
    setTimeout(() => { window.location.href = KOFI_URL; }, 500);
  })();
  </script>
</body>
</html>
