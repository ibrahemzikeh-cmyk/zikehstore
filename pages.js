/* جلب صفحات التوافق (المرحلة 2): كل جهاز/آيسي/بطارية/شريحة/مسطرة صفحة لحالها بـ Supabase
   (دالة get_page، ملف supabase/pages.sql). ما بيجيبها إلا المسجّل دخول، وعليها حد يومي.
   - الصفحات يلي انفتحت بتنحفظ على هالجهاز (آخر 150): بتفتح بسرعة وبلا نت، وما بتنحسب من الحد.
   - على اللابتوب (localhost) بيقرا من build/pages (python tools/build_site.py --pages build/pages)
     إلا إذا الرابط فيه ?remote.
   الأغلاط (err.code): login · limit · fast · blocked · missing · setup · offline */
(function () {
  const PREFIX = 'zk_pg_';
  const INDEX_KEY = 'zk_pg_index';
  const KEEP = 150;
  const version = () => (window.PHONE_DATA && (window.PHONE_DATA.rev || window.PHONE_DATA.updated)) || '';

  function fail(code, msg) { return Object.assign(new Error(msg || code), { code }); }

  // ---------- الحفظ على الجهاز ----------
  function readCache(id, anyVersion) {
    try {
      const c = JSON.parse(localStorage.getItem(PREFIX + id));
      if (c && c.p && (anyVersion || c.v === version())) return c.p;
    } catch (e) { /* ignore */ }
    return null;
  }
  function writeCache(id, page) {
    try {
      let idx = [];
      try { idx = JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch (e) { idx = []; }
      idx = idx.filter(x => x !== id);
      idx.push(id);
      while (idx.length > KEEP) localStorage.removeItem(PREFIX + idx.shift());
      localStorage.setItem(PREFIX + id, JSON.stringify({ v: version(), p: page }));
      localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch (e) {
      // المساحة خلصت: منفضّي النص القديم ومنكمّل بلا حفظ
      try {
        const idx = JSON.parse(localStorage.getItem(INDEX_KEY)) || [];
        idx.splice(0, Math.ceil(idx.length / 2)).forEach(x => localStorage.removeItem(PREFIX + x));
        localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
      } catch (e2) { /* ignore */ }
    }
  }

  // ---------- من Supabase ----------
  function mapError(err) {
    const m = String((err && (err.message || err.details)) || err || '');
    if (/login_required|jwt|not authenticated/i.test(m)) return fail('login', m);
    if (/daily_limit/.test(m)) return fail('limit', m);
    if (/too_fast/.test(m)) return fail('fast', m);
    if (/blocked/.test(m)) return fail('blocked', m);
    if (err && (err.code === 'PGRST202' || /could not find the function|get_page/i.test(m))) return fail('setup', m);
    return fail('offline', m);
  }

  async function fromSupabase(id) {
    const A = window.ZikehAuth;
    if (!A || !A.enabled) throw fail('setup', 'auth not configured');
    if (!A.hasStoredSession()) throw fail('login');
    let sb;
    try { sb = await A.client(); } catch (e) { throw fail('offline', String(e)); }
    const { data, error } = await sb.rpc('get_page', { p_id: id });
    if (error) throw mapError(error);
    return data || null;
  }

  async function fromLocalBuild(id) {
    const r = await fetch('build/pages/' + encodeURIComponent(id) + '.json', { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw fail('offline', 'HTTP ' + r.status);
    return r.json();
  }

  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]remote\b/.test(location.search);

  window.PhoneFitPageLoader = async function (id) {
    const cached = readCache(id);
    if (cached) return cached;
    try {
      const page = isLocal ? await fromLocalBuild(id) : await fromSupabase(id);
      if (page) writeCache(id, page);
      return page;
    } catch (e) {
      // بلا نت: نسخة قديمة أحسن من ولا شي
      const old = e.code === 'offline' ? readCache(id, true) : null;
      if (old) return old;
      throw e;
    }
  };
})();
