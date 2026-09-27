/* تصويتات العملاء: «ناسبت» أو «لم تناسب» على كل توافق.
   الأصوات بتنحفظ بـ Supabase (جدول votes، ملف supabase/votes.sql) إذا الزبون مسجّل دخول،
   فبتوصل أصوات كل الزباين لكل الزباين وللأدمن. إذا الحسابات مش مربوطة أو votes.sql لسا
   ما انشغّل، بترجع تنحفظ على هالمتصفح بس (متل قبل) حتى ما يوقف شي.

   المفتاح = PhoneFit.pairKey(type, a, b)   مثلاً "protector|galaxy-a02s|galaxy-a12"
   كل عميل إلو صوت واحد على كل توافق، وبيقدر يغيّره أو يلغيه. */
(function () {
  const VOTES_KEY = 'phonefit-votes-v1';   // { pairKey: { voterId: 'yes' | 'no' } }
  const VOTER_KEY = 'phonefit-voter-id';
  const CHUNK = 500;                       // حد المفاتيح بكل طلب

  function read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  function voterId() {
    let id = read(VOTER_KEY, null);
    if (!id) {
      id = 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      write(VOTER_KEY, id);
    }
    return id;
  }

  function tally(voters) {
    const t = { yes: 0, no: 0 };
    Object.values(voters || {}).forEach(v => { if (v === 'yes' || v === 'no') t[v]++; });
    return t;
  }

  // ---------- المحلي (على هالمتصفح بس) ----------
  const local = {
    async counts(keys) {
      const all = read(VOTES_KEY, {});
      const out = {};
      keys.forEach(k => { if (all[k]) out[k] = tally(all[k]); });
      return out;
    },
    async all() {
      const all = read(VOTES_KEY, {});
      return Object.keys(all).map(k => ({ key: k, ...tally(all[k]) })).filter(x => x.yes || x.no);
    },
    async mine(keys) {
      const all = read(VOTES_KEY, {});
      const me = voterId();
      const out = {};
      keys.forEach(k => { if (all[k] && all[k][me]) out[k] = all[k][me]; });
      return out;
    },
    async vote(key, value, asVoter) {
      const all = read(VOTES_KEY, {});
      const me = asVoter || voterId();
      all[key] = all[key] || {};
      if (value === 'yes' || value === 'no') all[key][me] = value;
      else delete all[key][me];
      if (!Object.keys(all[key]).length) delete all[key];
      if (!write(VOTES_KEY, all)) throw new Error('storage');
      return tally(all[key]);
    }
  };

  // ---------- Supabase ----------
  let missing = false;   // votes.sql لسا ما انشغّل ← منرجع للمحلي
  function auth() {
    const A = window.ZikehAuth;
    return !missing && A && A.enabled && A.hasStoredSession() ? A : null;
  }
  function isMissing(err) {
    const m = String((err && (err.message || err.details)) || '');
    return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist/i.test(m));
  }

  // counts و mine بيطلبوا نفس الشي: طلب واحد لنفس المفاتيح
  let lastSig = '', lastReq = null;
  function fetchRemote(A, keys) {
    const sig = keys.join('\n');
    if (sig === lastSig && lastReq) return lastReq;
    lastSig = sig;
    lastReq = (async () => {
      const sb = await A.client();
      const rows = [];
      for (let i = 0; i < keys.length; i += CHUNK) {
        const { data, error } = await sb.rpc('vote_counts', { keys: keys.slice(i, i + CHUNK) });
        if (error) throw error;
        rows.push(...(data || []));
      }
      return rows;
    })();
    lastReq.catch(() => { lastSig = ''; lastReq = null; });
    return lastReq;
  }
  async function remoteOr(fn, fallback) {
    const A = auth();
    if (!A) return fallback();
    try { return await fn(A); }
    catch (e) {
      if (isMissing(e)) { missing = true; return fallback(); }
      throw e;
    }
  }

  const store = {
    get mode() { return auth() ? 'supabase' : 'local'; },

    // عدد الأصوات لمجموعة مفاتيح: { key: {yes, no} }
    counts(keys) {
      if (!keys.length) return Promise.resolve({});
      return remoteOr(async A => {
        const out = {};
        (await fetchRemote(A, keys)).forEach(r => { if (r.yes || r.no) out[r.pair_key] = { yes: r.yes, no: r.no }; });
        return out;
      }, () => local.counts(keys));
    },

    // صوت هالعميل: { key: 'yes' | 'no' }
    mine(keys) {
      if (!keys.length) return Promise.resolve({});
      return remoteOr(async A => {
        const out = {};
        (await fetchRemote(A, keys)).forEach(r => { if (r.mine) out[r.pair_key] = r.mine; });
        return out;
      }, () => local.mine(keys));
    },

    // value = 'yes' | 'no' | null (null = إلغاء الصوت). بترجع العدد الجديد {yes, no}
    vote(key, value) {
      lastSig = ''; lastReq = null;
      return remoteOr(async A => {
        const sb = await A.client();
        const { data, error } = await sb.rpc('cast_vote', { key, val: value === 'yes' || value === 'no' ? value : null });
        if (error) throw error;
        return { yes: +(data && data.yes) || 0, no: +(data && data.no) || 0 };
      }, () => local.vote(key, value));
    },

    // كل التوافقات اللي عليها أصوات (لصفحات الإدارة): [{key, yes, no, last_at}]
    all() {
      return remoteOr(async A => {
        const sb = await A.client();
        const { data, error } = await sb.rpc('admin_votes', { max_rows: 500 });
        if (error) throw error;
        return (data && data.pairs) || [];
      }, () => local.all());
    },

    // للتجربة من صفحة الإدارة بالوضع المحلي بس: صوت من «عميل وهمي»
    async simulate(key, value) {
      return local.vote(key, value, 'test-' + Math.random().toString(36).slice(2));
    },

    async clearAll() {
      try { localStorage.removeItem(VOTES_KEY); } catch (e) { /* ignore */ }
    }
  };

  window.PhoneFitVotes = store;
})();
