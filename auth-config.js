/* إعدادات الحسابات (Supabase) — هاد الملف الوحيد يلي بتعدّلو.
   - supabaseUrl و supabaseAnonKey: من Supabase ← Project Settings ← API
     (Project URL و الـ anon public key). هدول عامين ومسموح يكونوا بالموقع.
   - ⚠ مفتاح service_role ممنوع ينحط هون أو بأي ملف بالموقع.
   - إذا الحقلين فاضيين، الحسابات مطفية والموقع بيشتغل متل قبل. */
window.ZIKEH_AUTH = {
  supabaseUrl: 'https://betexmjhvlcinbpjglkt.supabase.co',
  supabaseAnonKey: 'sb_publishable_RgK8JEHVEMjUC1bx9sktRQ_K3KQvANr',
  // true = الموقع ما بيفتح إلا بعد تسجيل الدخول (بحساب مجاني). false = مفتوح للكل.
  requireLogin: true,
  // رقم واتساب لتفعيل الاشتراك (بدون + وبدون صفر البداية: 963 وبعدين الرقم)
  whatsapp: '963935959558',
  // عنوان الموقع (للروابط يلي بتنبعت بالإيميل: تأكيد الحساب، ونسيت كلمة السر)
  siteUrl: 'https://ibrahemzikeh-cmyk.github.io/zikehstore/'
};
