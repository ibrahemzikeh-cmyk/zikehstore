/* منطق مشترك بين صفحة الزبون وصفحة الإدارة: قراءة البيانات، البحث، وإيجاد التوافقات */
(function () {
  const DRAFT_KEY = 'phonefit-draft-v1';

  const TYPES = {
    protector: { label: 'لصاقة الشاشة', plural: 'لصاقات الشاشة' },
    case: { label: 'الكفر', plural: 'الكفرات' },
    screen: { label: 'الشاشة', plural: 'الشاشات' },
    battery: { label: 'البطارية', plural: 'البطاريات' },
    frame: { label: 'إطار الشاشة', plural: 'إطارات الشاشة' }
  };

  // كلمات عربية شائعة يكتبها الزبون ← مقابلها الإنكليزي
  const AR_WORDS = [
    // أسماء الحروف بالموديلات ("جالكسي اس 2"، "ايه 12"، "ام 31") ككلمة لحالها بس
    [/(^|\s)[اإ]س(?=\s|\d|$)/g, ' s'], [/(^|\s)[اإأ]يه(?=\s|\d|$)/g, ' a'], [/(^|\s)[اإ]م(?=\s|\d|$)/g, ' m'],
    [/[آأإا]ي ?فون/g, 'iphone'], [/زي?ن ?فون/g, 'zenfone'],
    [/سامسون[جغك]|سامسن[جغ]/g, 'samsung'],
    [/[جغقك]الكسي|[جغ]لاكسي/g, 'galaxy'],
    [/ش[يا]?[اأ]?ومي|ش[يا]?[اأ]?ومى/g, 'xiaomi'],
    [/ر[ي]?دمي|ريدمى/g, 'redmi'],
    [/بوكو/g, 'poco'],
    [/هوا?وي|هواوى/g, 'huawei'],
    [/[هأا]ونو?ر/g, 'honor'],
    [/[اأ]وبو/g, 'oppo'],
    [/ريلمي|ريلمى/g, 'realme'],
    [/فيفو/g, 'vivo'],
    [/[اإ]نفينكس/g, 'infinix'],
    [/ت[ي]?كنو/g, 'tecno'],
    [/و[ا]?ن ?بلس/g, 'oneplus'],
    [/موتورولا|موتو/g, 'moto'],
    [/رينو/g, 'reno'], [/نوفا/g, 'nova'], [/ميت/g, 'mate'], [/فايند/g, 'find'], [/سبارك/g, 'spark'],
    [/كامون/g, 'camon'], [/هوت/g, 'hot'], [/بوفا/g, 'pova'], [/فولد/g, 'fold'], [/فليب/g, 'flip'],
    [/سمارت/g, 'smart'], [/تيربو|توربو/g, 'turbo'],
    [/[جغق]و[جغ]ل/g, 'google'],
    [/بي?كسل/g, 'pixel'],
    [/نوكيا/g, 'nokia'],
    [/[اإ]ي?تل/g, 'itel'],
    [/[اأ]سوس/g, 'asus'],
    [/نوت/g, 'note'],
    [/برو/g, 'pro'],
    [/ماكس/g, 'max'],
    [/بلس/g, 'plus'],
    [/ميني/g, 'mini'],
    [/لايت/g, 'lite'],
    [/[اأ]لترا/g, 'ultra'],
    [/[اإ]ير/g, 'air']
  ];

  // كلمات الماركة تُحذف عند المقارنة حتى "سامسونج a12" = "a12"
  const BRAND_WORDS = /samsung|galaxy|apple|xiaomi|huawei|oppo|vivo|infinix|tecno/g;

  function normalize(text) {
    let s = String(text || '').toLowerCase();
    s = s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
    s = s.replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
    for (const [re, en] of AR_WORDS) s = s.replace(re, ' ' + en + ' ');
    // "+" جزء من الاسم: Galaxy S20+ غير Galaxy S20
    s = s.replace(/\+/g, 'plus');
    return s.replace(/[^a-z0-9]+/g, '');
  }

  function stripBrand(key) {
    return key.replace(BRAND_WORDS, '');
  }

  function loadData(opts) {
    const base = window.PHONE_DATA || { devices: [], groups: [] };
    if (opts && opts.useDraft) {
      const draft = readDraft();
      if (draft) return { data: draft, fromDraft: true };
    }
    return { data: JSON.parse(JSON.stringify(base)), fromDraft: false };
  }

  function readDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && Array.isArray(d.devices) && Array.isArray(d.groups) ? d : null;
    } catch (e) { return null; }
  }

  function writeDraft(data) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  // أنواع الآيسيات
  // الترتيب هون هو ترتيب العرض بصفحة الجهاز
  const IC_KINDS = {
    power: 'باور (Power / PMIC)', smallpower: 'باور صغير (Small power)', charging: 'شحن (Charging)',
    wifi: 'واي فاي وبلوتوث (WiFi/BT)', gps: 'جي بي اس (GPS)', rf: 'شبكة (PA / RF)', audio: 'صوت (Audio)',
    memory: 'ذاكرة (eMMC / UFS)', cpu: 'معالج (CPU)', backlight: 'إضاءة (Backlight)', display: 'شاشة (Display)',
    baseband: 'بيسباند (Baseband)', touch: 'تاتش (Touch)', usb: 'USB وحماية', nfc: 'NFC', other: 'آيسيات تانية (Other)'
  };
  // أنواع الكونكترات (بنفس ترتيب العرض بتبويب «كونكترات»)
  const CONN_KINDS = {
    socket: 'سوكيت شحن', board: 'بورد شحن', mainflex: 'فلات رئيسي', sim: 'كونكتر سيم',
    battery: 'كونكتر بطارية', lcdflex: 'فلات شاشة', lcdconn: 'كونكتر شاشة'
  };

  // كلمات بيكتبها الزبون ← نوع الآيسي
  const IC_KIND_HINTS = [
    [/شحن|charg/i, 'charging'], [/باور صغير|small ?power/i, 'smallpower'], [/باور|pmic|power/i, 'power'],
    [/جي ?بي ?[اإ]س|\bgps\b/i, 'gps'], [/صوت|audio|codec/i, 'audio'],
    [/واي ?فاي|wifi|wi-fi|بلوتوث|bluetooth/i, 'wifi'], [/[إا]ضاءة|backlight/i, 'backlight'],
    [/هارد|ذاكرة|emmc|ufs/i, 'memory'], [/معالج|\bcpu\b/i, 'cpu'], [/بيسباند|baseband|مودم/i, 'baseband'],
    [/شبكة|ارسال|إرسال/i, 'rf'], [/تاتش|لمس|touch/i, 'touch'], [/\busb\b|حماية|ovp/i, 'usb'], [/\bnfc\b/i, 'nfc']
  ];

  function buildIndex(data) {
    const byId = new Map();
    const entries = data.devices.map(d => {
      byId.set(d.id, d);
      const keys = new Set();
      const add = k => { if (k) { keys.add(k); keys.add(stripBrand(k)); } };
      add(normalize(d.name));
      add(normalize(d.brand + ' ' + d.name));
      // "Samsung I9100 Galaxy S II" (نسخة برقم موديل) ← كمان "Galaxy S II"
      const names = [d.name];
      const noCode = d.name.match(/^(?:Samsung\s+)?[A-Z]{1,3}\d{3,5}[A-Z]{0,3}\s+(Galaxy\b.*)$/);
      if (noCode) { names.push(noCode[1]); add(normalize(noCode[1])); }
      // "Galaxy S II" ← الزبون بيكتب "S2" (بس بعد كلمة، مش "Xperia 1 II")
      names.forEach(n => {
        const arabicNum = n.replace(/(^|[A-Za-z]\s)(IV|III|II)\b/g, (m, pre, r) => pre + { II: '2', III: '3', IV: '4' }[r]);
        if (arabicNum !== n) { add(normalize(arabicNum)); add(normalize(d.brand + ' ' + arabicNum)); }
      });
      (d.codes || []).forEach(c => {
        add(normalize(c));
        // سامسونج: الفني بيكتب "SM-A165F" والرقم محفوظ "A165"
        if (/^[A-Z]\d{3}/i.test(c)) add(normalize('SM-' + c));
      });
      keys.delete('');
      return { device: d, keys: [...keys] };
    });
    // الآيسيات: رقم الآيسي وأسماؤه التانية، ومين راكب فيه
    const icById = new Map();
    const icsByDevice = new Map();
    // label_only = اسم شركة مش رقم آيسي: بيبين بصفحة الجهاز كمعلومة بس، ومش بالبحث ولا كتوافق
    const icEntries = (data.ics || []).map(ic => {
      if (!ic.label_only) icById.set(ic.id, ic);
      (ic.devices || []).forEach(did => {
        if (!icsByDevice.has(did)) icsByDevice.set(did, []);
        icsByDevice.get(did).push(ic);
      });
      const keys = new Set([ic.code].concat(ic.aliases || []).map(normalize));
      keys.delete('');
      return { ic, keys: [...keys] };
    }).filter(e => !e.ic.label_only);
    // الأجهزة حسب المعالج (chipset)
    const byChipset = new Map();
    data.devices.forEach(d => {
      if (!d.chipset) return;
      const k = normalize(d.chipset);
      if (!byChipset.has(k)) byChipset.set(k, []);
      byChipset.get(k).push(d);
    });
    // البطاريات: الكود وأكواده التانية، ومين بياخدها
    const batById = new Map();
    const batsByDevice = new Map();
    const batEntries = (data.batteries || []).map(b => {
      batById.set(b.id, b);
      (b.devices || []).forEach(did => {
        if (!batsByDevice.has(did)) batsByDevice.set(did, []);
        batsByDevice.get(did).push(b);
      });
      const keys = new Set([b.code].concat(b.aliases || []).map(normalize));
      keys.delete('');
      return { bat: b, keys: [...keys] };
    }).filter(e => e.keys.length);
    // المعالجات والآيسيات مع المساطر: برقم الشريحة، اسمها (Helio P35)، ومين فيها
    const chipById = new Map();
    const chipsByDevice = new Map();
    const chipsByIc = new Map();
    const stencilById = new Map();
    const chipEntries = (data.chips || []).map(c => {
      chipById.set(c.id, c);
      (c.devices || []).forEach(did => {
        if (!chipsByDevice.has(did)) chipsByDevice.set(did, []);
        chipsByDevice.get(did).push(c);
      });
      (c.ics || []).forEach(icId => {
        if (!chipsByIc.has(icId)) chipsByIc.set(icId, []);
        chipsByIc.get(icId).push(c);
      });
      // المسطرة بكودها (MQ2): كل الشرايح يلي بتركب عليها
      (c.stencils || []).forEach(s => {
        if (!s.code) return;
        const id = 'stn-' + slugify(s.code);
        if (!stencilById.has(id)) stencilById.set(id, { id, code: s.code, items: [] });
        stencilById.get(id).items.push({ chip: c, stencil: s });
      });
      const keys = new Set([c.code].concat(c.aliases || [], c.short || [], c.name || [], c.alt || []).map(normalize));
      keys.delete('');
      return { chip: c, keys: [...keys] };
    });
    const stencilEntries = [...stencilById.values()].map(s => ({ stencil: s, keys: [normalize(s.code)] }));
    return { entries, byId, icEntries, icById, icsByDevice, byChipset, batById, batsByDevice, batEntries,
      chipById, chipsByDevice, chipsByIc, chipEntries, stencilById, stencilEntries };
  }

  // أنواع الشرايح بجدول المعالجات والمساطر
  const CHIP_TYPES = {
    cpu: 'معالج (CPU)', pmic: 'باور (Power / PMIC)', rf: 'شبكة (RF)', wifi: 'واي فاي وبلوتوث', ram: 'رام (RAM)', other: 'شريحة'
  };

  function scoreKeys(keys, q) {
    let best = 0;
    for (const k of keys) {
      let s = 0;
      if (k === q) s = 1000;
      else if (k.startsWith(q)) s = 600 - (k.length - q.length);
      else if (q.length >= 3 && k.includes(q)) s = 300 - (k.length - q.length);
      if (s > best) best = s;
    }
    return best;
  }

  // بحث بالمعالج/الشريحة (MT6765، Helio P35) وبالمسطرة (MQ2، "مسطرة MQ:2")
  function searchChips(index, query, limit) {
    if (!index.chipEntries || !index.chipEntries.length) return [];
    const text = String(query || '');
    const stencilHint = /مسطر[ةه]|ستان?سل|stencil|شبكة تقصير/i.test(text);
    const q = normalize(text.replace(/مسطر[ةه]|ستان?سل|stencil|شبكة تقصير|معالج|\bcpu\b|\bic\b/gi, ' '));
    if (!q) return [];
    const results = [];
    for (const e of index.chipEntries) {
      const s = scoreKeys(e.keys, q);
      if (s > 0) results.push({ chip: e.chip, score: s - (stencilHint ? 60 : 0) });
    }
    for (const e of index.stencilEntries) {
      const s = scoreKeys(e.keys, q);
      if (s > 0) results.push({ stencil: e.stencil, score: s + (stencilHint ? 60 : 0) });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit || 8);
  }

  // بحث بكود البطارية (BN46، EB-BA505ABU). كلمة «بطارية» أو battery بتنشال
  function searchBatteries(index, query, limit) {
    if (!index.batEntries || !index.batEntries.length) return [];
    const text = String(query || '');
    const hinted = /بطاري[ةه]|battery|\bbat\b/i.test(text);
    const q = normalize(text.replace(/بطاري[ةه]|battery|\bbat\b/gi, ' '));
    if (!q) return [];
    const results = [];
    for (const e of index.batEntries) {
      let best = 0;
      for (const k of e.keys) {
        let s = 0;
        if (k === q) s = 1000;
        else if (k.startsWith(q)) s = 600 - (k.length - q.length);
        else if (q.length >= 3 && k.includes(q)) s = 300 - (k.length - q.length);
        if (s > best) best = s;
      }
      if (best > 0 && hinted) best += 50;
      if (best > 0) results.push({ bat: e.bat, score: best });
    }
    results.sort((a, b) => b.score - a.score || a.bat.code.localeCompare(b.bat.code, 'en', { numeric: true }));
    return results.slice(0, limit || 8);
  }

  // أجهزة إلها نفس معالج الجهاز (بدون الجهاز نفسه)
  function sameChipset(index, deviceId) {
    const d = index.byId.get(deviceId);
    if (!d || !d.chipset) return [];
    return (index.byChipset.get(normalize(d.chipset)) || []).filter(x => x.id !== deviceId);
  }

  // بحث عن آيسي برقمه، أو بنوعه ("آيسي شحن" بيجيب كل آيسيات الشحن)
  function searchICs(index, query, limit) {
    if (!index.icEntries || !index.icEntries.length) return [];
    const text = String(query || '');
    const hint = IC_KIND_HINTS.find(([re]) => re.test(text));
    const kindHint = hint && hint[1];
    // كلمة النوع ("شحن"، "power") مش جزء من رقم الآيسي
    const codeText = hint ? text.replace(new RegExp(hint[0].source, 'gi'), ' ') : text;
    const q = normalize(codeText.replace(/\bic\b|[آأا]ي ?سي/gi, ' '));
    const results = [];
    for (const e of index.icEntries) {
      let best = 0;
      if (q) {
        for (const k of e.keys) {
          let s = 0;
          if (k === q) s = 1000;
          else if (k.startsWith(q)) s = 600 - (k.length - q.length);
          else if (q.length >= 3 && k.includes(q)) s = 300 - (k.length - q.length);
          if (s > best) best = s;
        }
        if (best > 0 && kindHint === e.ic.kind) best += 50;
      } else if (kindHint && e.ic.kind === kindHint) {
        best = 100;
      }
      if (best > 0) results.push({ ic: e.ic, score: best });
    }
    results.sort((a, b) => b.score - a.score || a.ic.code.localeCompare(b.ic.code, 'en', { numeric: true }));
    return results.slice(0, limit || 8);
  }

  // إذا الزبون كتب الماركة، منقدّم أجهزتها على غيرها
  const BRAND_HINTS = [
    [/samsung|galaxy/, 'samsung'], [/iphone|apple/, 'apple'], [/xiaomi|redmi|poco/, 'xiaomi'],
    [/huawei/, 'huawei'], [/honor/, 'honor'], [/oppo/, 'oppo'], [/realme/, 'realme'],
    [/vivo/, 'vivo'], [/infinix/, 'infinix'], [/tecno/, 'tecno'],
    [/oneplus/, 'oneplus'], [/moto/, 'motorola'], [/google|pixel/, 'google'], [/nokia/, 'nokia'],
    [/^itel/, 'itel'], [/iqoo/, 'iqoo'], [/asus|zenfone/, 'asus'], [/zte/, 'zte'], [/^nothing/, 'nothing']
  ];

  function search(index, query, limit) {
    const raw = normalize(query);
    if (!raw) return [];
    const q = stripBrand(raw) || raw;
    const hint = (BRAND_HINTS.find(([re]) => re.test(raw)) || [])[1];
    const results = [];
    for (const e of index.entries) {
      let best = 0;
      for (const k of e.keys) {
        let s = 0;
        if (k === q || k === raw) s = 1000;
        else if (k.startsWith(q)) s = 600 - (k.length - q.length);
        else if (q.length >= 2 && k.includes(q)) s = 300 - (k.length - q.length);
        // رقم موديل مع حرف زيادة بالآخر: "sma165f" بيلاقي "sma165" (بس إذا الزيادة حرف أو حرفين)
        else if (k.length >= 4 && /\d/.test(k) && q.startsWith(k) && q.length - k.length <= 3 && !/\d/.test(q.slice(k.length))) s = 450;
        if (s > best) best = s;
      }
      if (best > 0 && hint) best += normalize(e.device.brand) === hint ? 200 : -200;
      if (best > 0) results.push({ device: e.device, score: best });
    }
    results.sort((a, b) => b.score - a.score || a.device.name.localeCompare(b.device.name, 'en', { numeric: true }));
    let out = results;
    if (hint) {
      const sameBrand = results.filter(r => normalize(r.device.brand) === hint);
      if (sameBrand.length) out = sameBrand;
    }
    return out.slice(0, limit || 8);
  }

  // مصدر التوافق ودرجة الثقة
  const SOURCES = {
    manual: 'مؤكد يدوياً',
    customers: 'مؤكد من العملاء',
    web: 'متأكد عبر الإنترنت',
    supplier: 'قائمة مورّد',
    combo: 'حسب قوائم الكومبو',
    imported: 'قائمة توافق مستوردة',
    seed: 'بيانات أولية',
    computed: 'محسوب من المواصفات'
  };
  const CONFIDENCE = {
    high: 'مؤكد',
    medium: 'محتمل',
    low: 'ضعيف – بحاجة تأكيد'
  };
  const CONF_RANK = { high: 3, medium: 2, low: 1 };
  const SRC_RANK = { manual: 8, customers: 7, web: 6, supplier: 5, combo: 4, imported: 3, seed: 2, computed: 1 };

  // عدد أصوات العملاء اللازم (فيك تغيّره بـ data.js ← settings)
  function voteRules(data) {
    const s = (data && data.settings) || {};
    return { confirm: s.votes_to_confirm || 5, reject: s.votes_to_reject || 5 };
  }

  // أثر أصوات العملاء على توافق واحد:
  // 5 «ركب» (وأكتر من «ما ركب») ← ثقة عالية «مؤكد من العملاء»
  // 5 «ما ركب» (وأكتر من «ركب») ← بينزل لبرتقالي مع تحذير. المؤكد يدوياً ما بيتأثر
  function applyVotes(it, v, rules) {
    it.votes = v || { yes: 0, no: 0 };
    it.rejected = false;
    if (!v) return;
    if (v.no >= rules.reject && v.no > v.yes && it.source !== 'manual') {
      it.confidence = 'low';
      it.rejected = true;
    } else if (v.yes >= rules.confirm && v.yes > v.no && it.confidence !== 'high') {
      it.confidence = 'high';
      it.source = 'customers';
    }
  }

  // المجموعات القديمة بلا حقول مصدر/ثقة بتنعامل كبيانات أولية
  function groupMeta(g) {
    const source = SOURCES[g.source] ? g.source : 'seed';
    const confidence = source === 'manual' ? 'high' : (CONF_RANK[g.confidence] ? g.confidence : 'medium');
    return { source, confidence };
  }

  function pairKey(type, a, b) {
    return type + '|' + (a < b ? a + '|' + b : b + '|' + a);
  }

  function isDenied(data, type, a, b) {
    const k = pairKey(type, a, b);
    return (data.denials || []).some(d => pairKey(d.type, d.a, d.b) === k);
  }

  // كل الأجهزة اللي بتشارك الجهاز بنفس نوع القطعة (بدون الجهاز نفسه)
  // المؤكد يدوياً بيطغى على كل شي، والنفي اليدوي بيشيل أي توافق غير مؤكد يدوياً
  function compatible(data, index, deviceId, type, opts) {
    const includeDenied = !!(opts && opts.includeDenied);
    const found = new Map();
    const notes = [];
    // اليدوي بيربح دايماً، وبعدين الثقة الأعلى، وعند التساوي المصدر الأقوى
    const strength = (source, confidence) => source === 'manual' ? 100 : CONF_RANK[confidence] * 10 + SRC_RANK[source];
    const offer = (id, source, confidence, note, why, warn) => {
      if (id === deviceId || !index.byId.has(id)) return;
      const prev = found.get(id);
      if (!prev || strength(source, confidence) > strength(prev.source, prev.confidence)) {
        found.set(id, { device: index.byId.get(id), source, confidence, why: why || '', groupNote: note || '', note: warn || '' });
      }
    };
    for (const g of data.groups) {
      if (g.type !== type || !g.devices.includes(deviceId)) continue;
      const m = groupMeta(g);
      g.devices.forEach(id => offer(id, m.source, m.confidence, g.note));
      if (g.note) notes.push(g.note);
    }
    for (const l of data.links || []) {
      if (l.type !== type) continue;
      const other = l.a === deviceId ? l.b : l.b === deviceId ? l.a : null;
      if (!other) continue;
      const source = SOURCES[l.source] ? l.source : 'computed';
      const confidence = source === 'manual' ? 'high' : (CONF_RANK[l.confidence] ? l.confidence : 'low');
      offer(other, source, confidence, '', l.why, l.note);
    }
    const votes = opts && opts.votes;
    const rules = voteRules(data);
    const items = [];
    for (const it of found.values()) {
      applyVotes(it, votes && votes[pairKey(type, deviceId, it.device.id)], rules);
      it.denied = it.source !== 'manual' && isDenied(data, type, deviceId, it.device.id);
      if (!it.denied || includeDenied) items.push(it);
    }
    items.sort((a, b) => (a.denied - b.denied) ||
      CONF_RANK[b.confidence] - CONF_RANK[a.confidence] ||
      a.device.brand.localeCompare(b.device.brand) ||
      a.device.name.localeCompare(b.device.name, 'en', { numeric: true }));
    const devices = items.filter(i => !i.denied).map(i => i.device);
    return { devices, items, notes: [...new Set(notes)] };
  }

  // ---------- ملفات الماركات (data/brands/*.js) ----------
  // صفحة الزبون بتحمّل data/index.js (الأجهزة للبحث)، ولما يفتح جهاز منحمّل ملف ماركته بس.
  // كل ملف بينادي PhoneFitAddBrand، والتوافق بين ماركتين موجود بالملفين فمنشيل التكرار بـ k.
  let brandTarget = null;
  const brandPromises = new Map();
  const seenKeys = { groups: new Set(), links: new Set(), denials: new Set(), connectors: new Set() };
  window.PhoneFitAddBrand = function (brand, part) {
    const d = brandTarget;
    if (!d) return;
    if (!d.connectors) d.connectors = [];
    ['groups', 'links', 'denials', 'connectors'].forEach(c => (part[c] || []).forEach(x => {
      if (x.k == null || !seenKeys[c].has(x.k)) {
        if (x.k != null) seenKeys[c].add(x.k);
        d[c].push(x);
      }
    }));
  };

  function needsBrand(data, brand) {
    return !!(data.split && data.brandFiles && data.brandFiles[brand] && !(data._loaded || {})[brand]);
  }

  function ensureBrand(data, brand) {
    if (!needsBrand(data, brand)) return Promise.resolve();
    if (brandPromises.has(brand)) return brandPromises.get(brand);
    brandTarget = data;
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = data.brandFiles[brand];
      s.onload = () => { (data._loaded = data._loaded || {})[brand] = true; resolve(); };
      s.onerror = () => { brandPromises.delete(brand); s.remove(); reject(new Error('load ' + brand)); };
      document.head.appendChild(s);
    });
    brandPromises.set(brand, p);
    return p;
  }

  function slugify(text) {
    return String(text).toLowerCase().trim().replace(/\+/g, '-plus')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.PhoneFit = {
    TYPES, SOURCES, CONFIDENCE, IC_KINDS, CONN_KINDS, CHIP_TYPES, DRAFT_KEY, normalize, loadData, readDraft, writeDraft, clearDraft,
    buildIndex, search, searchICs, searchBatteries, searchChips, sameChipset, compatible, needsBrand, ensureBrand, groupMeta, pairKey, isDenied, voteRules, slugify, escapeHtml
  };
})();
