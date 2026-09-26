/* بوابة الدخول: إذا requireLogin شغّال بـ auth-config.js، الصفحة ما بتفتح بدون تسجيل دخول.
   بينحط بأول الصفحة (قبل البيانات) حتى ما ينحمّل شي قبل التسجيل.
   ملاحظة: هاد قفل بالواجهة. البيانات يلي بمجلد data بتضل ملفات عامة؛ القفل الحقيقي للبيانات = المرحلة 2 (Supabase). */
(function () {
  const cfg = window.ZIKEH_AUTH || {};
  if (!cfg.requireLogin || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  let inside = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) { inside = true; break; }
    }
  } catch (e) { /* ignore */ }
  // رابط الإيميل (تأكيد / كلمة سر) بيوصل مع #access_token: auth.js بيتعامل معو
  if (inside || /(access_token=|error_description=|error_code=)/.test(location.hash)) return;
  // بعد الدخول منرجّعو على نفس الجهاز يلي كان فاتح عليه
  try { if (location.hash) sessionStorage.setItem('zk_after_login', location.hash); } catch (e) { /* ignore */ }
  document.documentElement.style.visibility = 'hidden';
  location.replace('login.html?next=' + encodeURIComponent((location.pathname.split('/').pop() || 'index.html')) + '&gate=1');
})();
