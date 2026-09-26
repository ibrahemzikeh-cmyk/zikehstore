/* ZIKEH STORE — الحسابات (Supabase). بيستعمل الإعدادات من auth-config.js.
   - زر الهيدر (#accountBtn): «تسجيل الدخول» أو «حسابي» (بدون ما يحمّل مكتبة Supabase، حتى تضل الصفحة خفيفة).
   - ZikehAuth.client(): بيحمّل مكتبة Supabase مرة وحدة وبيرجع الـ client. */
(function () {
  const cfg = window.ZIKEH_AUTH || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  // مكتبة Supabase الرسمية (نسخة 2 ثابتة)
  const LIB = cfg.libUrl || 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';

  // الجلسة محفوظة بالمتصفح بمفتاح sb-<مشروع>-auth-token
  function hasStoredSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function mountHeaderButton() {
    const btn = document.getElementById('accountBtn');
    if (!btn) return;
    if (!enabled) { btn.hidden = true; return; }
    const inside = hasStoredSession();
    btn.href = inside ? 'account.html' : 'login.html';
    btn.querySelector('span').textContent = inside ? 'حسابي' : 'تسجيل الدخول';
    btn.title = inside ? 'حسابي' : 'تسجيل الدخول';
    btn.hidden = false;
  }

  let clientPromise = null;
  function client() {
    if (!enabled) return Promise.reject(new Error('not-configured'));
    if (clientPromise) return clientPromise;
    clientPromise = new Promise((resolve, reject) => {
      const make = () => resolve(window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
      }));
      if (window.supabase && window.supabase.createClient) return make();
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = make;
      s.onerror = () => { clientPromise = null; reject(new Error('lib-load')); };
      document.head.appendChild(s);
    });
    return clientPromise;
  }

  // رسائل Supabase ← عربي
  function arError(err) {
    const m = String((err && (err.message || err.error_description || err)) || '').toLowerCase();
    if (m.includes('not-configured')) return 'الحسابات لسا ما انربطت بالموقع.';
    if (m.includes('lib-load') || m.includes('failed to fetch') || m.includes('network')) return 'ما في اتصال بالإنترنت، أو السيرفر ما ردّ. جرّب مرة تانية.';
    if (m.includes('invalid login')) return 'الإيميل أو كلمة السر غلط.';
    if (m.includes('email not confirmed')) return 'لازم تأكّد إيميلك أول شي: افتح الرسالة يلي وصلتك واضغط الرابط.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'في حساب بهالإيميل. سجّل دخول، أو استعمل «نسيت كلمة السر».';
    if (m.includes('password should be at least') || m.includes('password is too short')) return 'كلمة السر لازم تكون 6 أحرف أو أكتر.';
    if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'في طلبات كتير. استنى شوي وجرّب مرة تانية.';
    if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('email address') && m.includes('invalid')) return 'الإيميل مش مكتوب صح.';
    if (m.includes('same password') || m.includes('different from the old')) return 'كلمة السر الجديدة لازم تكون غير القديمة.';
    if (m.includes('مسموح للأدمن') || m.includes('42501') || m.includes('permission denied')) return 'هالعملية مسموحة للأدمن بس.';
    if (m.includes('jwt') || m.includes('session')) return 'انتهت الجلسة. سجّل دخول من جديد.';
    return 'صار خطأ: ' + String((err && err.message) || err);
  }

  // حالة الاشتراك من تاريخ الانتهاء
  function subStatus(expires) {
    if (!expires) return { key: 'none', label: 'غير مشترك' };
    const end = new Date(expires);
    const days = Math.ceil((end - Date.now()) / 86400000);
    if (end <= new Date()) return { key: 'expired', label: 'منتهي', end, days };
    return { key: days <= 7 ? 'soon' : 'active', label: 'ساري', end, days };
  }

  // "يوم واحد" / "يومين" / "3 أيام" / "40 يوم"
  function daysText(n) {
    if (n <= 1) return 'يوم واحد';
    if (n === 2) return 'يومين';
    return n + (n <= 10 ? ' أيام' : ' يوم');
  }

  function fmtDate(d) {
    if (!d) return '';
    const x = new Date(d);
    return x.getFullYear() + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + String(x.getDate()).padStart(2, '0');
  }

  function siteUrl(page) {
    const base = cfg.siteUrl || (location.origin + location.pathname.replace(/[^/]*$/, ''));
    return base.replace(/\/?$/, '/') + (page || '');
  }

  // رابط الإيميل (تأكيد الحساب / كلمة سر جديدة) إذا وصل على صفحة تانية (مثلاً الرئيسية):
  // منوديه عالصفحة الصح ومعو نفس المعلومات يلي بعد الـ #
  function routeAuthLink() {
    const h = location.hash;
    if (!enabled || !/(access_token=|error_description=|error_code=)/.test(h)) return false;
    const page = location.pathname.split('/').pop() || 'index.html';
    const target = /error/.test(h) || /type=recovery/.test(h) ? 'login.html' : 'account.html';
    if (page === target) return false;
    location.replace(target + h);
    return true;
  }

  // إحصائيات: زيارة وحدة لكل جلسة، وفتحة كل جهاز مرة وحدة بالجلسة (جدول visits بـ Supabase)
  function track(kind, deviceId, deviceName) {
    if (!enabled || !hasStoredSession()) return;
    const key = 'zk_t_' + kind + '_' + (deviceId || '');
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { /* ignore */ }
    const row = kind === 'device' ? { kind, device_id: String(deviceId).slice(0, 120), device_name: String(deviceName || '').slice(0, 160) } : { kind };
    // بعد ما تخلص الصفحة تحميل، حتى ما تبطّئها
    setTimeout(() => { client().then(sb => sb.from('visits').insert(row)).catch(() => { /* مش ضروري */ }); }, 1500);
  }
  // بالصفحة الرئيسية بس (يلي فيها بيانات الأجهزة)
  function autoTrack() {
    if (!enabled || !window.PHONE_DATA || !hasStoredSession()) return;
    track('visit');
    const onHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const d = id && (window.PHONE_DATA.devices || []).find(x => x.id === id);
      if (d) track('device', d.id, (d.brand && !d.name.startsWith(d.brand) ? d.brand + ' ' : '') + d.name);
    };
    window.addEventListener('hashchange', onHash);
    onHash();
  }

  window.ZikehAuth = { enabled, cfg, client, hasStoredSession, mountHeaderButton, arError, subStatus, fmtDate, daysText, siteUrl, track };
  if (!routeAuthLink()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHeaderButton);
    else mountHeaderButton();
    if (document.readyState === 'complete') autoTrack();
    else window.addEventListener('load', autoTrack);
  }
})();
