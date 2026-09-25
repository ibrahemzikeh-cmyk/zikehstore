/* تصويتات العملاء: «ركب» أو «ما ركب» على كل توافق.
   هلأ الأصوات بتنحفظ على هالمتصفح بس (وضع تجريبي). لما نربط قاعدة بيانات أونلاين (متل Firebase)
   منبدّل هالملف بس، وباقي التطبيق بيضل متل ما هو لأن كل الدوال async.

   المفتاح = PhoneFit.pairKey(type, a, b)   مثلاً "protector|galaxy-a02s|galaxy-a12"
   كل عميل إلو صوت واحد على كل توافق، وبيقدر يغيّره أو يلغيه. */
(function () {
  const VOTES_KEY = 'phonefit-votes-v1';   // { pairKey: { voterId: 'yes' | 'no' } }
  const VOTER_KEY = 'phonefit-voter-id';

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

  const store = {
    mode: 'local',

    // عدد الأصوات لمجموعة مفاتيح: { key: {yes, no} }
    async counts(keys) {
      const all = read(VOTES_KEY, {});
      const out = {};
      keys.forEach(k => { if (all[k]) out[k] = tally(all[k]); });
      return out;
    },

    // كل التوافقات اللي عليها أصوات (لصفحة الإدارة)
    async all() {
      const all = read(VOTES_KEY, {});
      return Object.keys(all).map(k => ({ key: k, ...tally(all[k]) })).filter(x => x.yes || x.no);
    },

    // صوت هالعميل: 'yes' | 'no' | null
    async mine(keys) {
      const all = read(VOTES_KEY, {});
      const me = voterId();
      const out = {};
      keys.forEach(k => { if (all[k] && all[k][me]) out[k] = all[k][me]; });
      return out;
    },

    // value = 'yes' | 'no' | null (null = إلغاء الصوت)
    async vote(key, value, asVoter) {
      const all = read(VOTES_KEY, {});
      const me = asVoter || voterId();
      all[key] = all[key] || {};
      if (value === 'yes' || value === 'no') all[key][me] = value;
      else delete all[key][me];
      if (!Object.keys(all[key]).length) delete all[key];
      if (!write(VOTES_KEY, all)) throw new Error('storage');
      return tally(all[key]);
    },

    // للتجربة من صفحة الإدارة بالوضع المحلي بس: صوت من «عميل وهمي»
    async simulate(key, value) {
      return store.vote(key, value, 'test-' + Math.random().toString(36).slice(2));
    },

    async clearAll() {
      try { localStorage.removeItem(VOTES_KEY); } catch (e) { /* ignore */ }
    }
  };

  window.PhoneFitVotes = store;
})();
