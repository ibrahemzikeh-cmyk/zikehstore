# النشر على السوشال ميديا

أداة بتنشر المنشورات تلقائياً على **فيسبوك، إنستغرام، تيك توك، ويوتيوب**.

## كيف بتشتغل

1. كل منشور هو مجلد جوّا `social/queue/`، فيه ملف `post.json` مع الصور أو الفيديو.
2. أول ما ينرفع المجلد على GitHub، بيشتغل الـ workflow `.github/workflows/social-publish.yml` وبينشر.
3. بعد النشر بينتقل المجلد لـ `social/published/`، ومعه ملف `status.json` فيه روابط المنشورات.
4. إذا فشلت منصة، المنشور بيضل بـ `queue`، والمحاولة الجاية بتعيد **بس المنصات اللي فشلت**.

## شكل المنشور

```
social/queue/2026-09-28-iphone-offer/
├── post.json
└── video.mp4
```

```json
{
  "text": "عرض خاص على آيفون 17 📱\nتوصيل لكل المناطق",
  "link": "https://example.com",
  "media": ["video.mp4"],
  "platforms": ["facebook", "instagram", "tiktok", "youtube"],
  "publish_at": "2026-09-30T18:00:00+03:00",
  "overrides": {
    "youtube": { "title": "عرض آيفون 17", "tags": ["iphone", "عروض"], "privacy": "public" },
    "tiktok": { "privacy": "PUBLIC_TO_EVERYONE" },
    "instagram": { "text": "نص مختلف لإنستغرام #عروض" }
  }
}
```

| الحقل | إلزامي؟ | الشرح |
|---|---|---|
| `text` | إذا ما في media | نص المنشور |
| `link` | لا | رابط. بفيسبوك النصي بيطلع كبطاقة، وبالباقي بينضاف لآخر النص |
| `media` | لا | صور (`jpg`/`png`، لحد 10) **أو** فيديو واحد (`mp4`/`mov`) |
| `platforms` | لا | إذا ما انكتب، بينشر على كل منصة بتدعم نوع المنشور |
| `publish_at` | لا | موعد النشر. الفحص كل ساعة، وبيشتغل بس على الفرع `main` |
| `overrides` | لا | إعدادات خاصة لكل منصة (`text`، `title`، `description`، `tags`، `privacy`...) |

### شو بيندعم على كل منصة

| نوع المنشور | فيسبوك | إنستغرام | تيك توك | يوتيوب |
|---|---|---|---|---|
| نص بس | ✅ | ❌ | ❌ | ❌ |
| صورة أو عدة صور | ✅ | ✅ (JPG أفضل) | ❌ | ❌ |
| فيديو | ✅ | ✅ Reel | ✅ | ✅ |

## الإعداد (مرة وحدة)

كل المفاتيح بتنحط بـ GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
أي منصة ما إلها مفاتيح بيتم تخطيها بدون ما يتعطل شي.

### 1) فيسبوك وإنستغرام (Meta)

المطلوب: صفحة فيسبوك، وحساب إنستغرام **Business أو Creator** مربوط فيها.

1. ادخل على https://developers.facebook.com واعمل App من نوع **Business**.
2. زيد المنتجات: **Facebook Login for Business** و **Instagram Graph API**.
3. من **Graph API Explorer** اطلب User Token بهالصلاحيات:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`
4. حوّله لتوكن طويل الأمد من **Access Token Debugger → Extend Access Token**.
5. بالـ Explorer بتنفذ `GET /me/accounts` بالتوكن الطويل، ومنه بتاخد `id` الصفحة و`access_token` تبعها. توكن الصفحة هاد ما بينتهي.
6. بتنفذ `GET /{page-id}?fields=instagram_business_account` لتاخد رقم حساب إنستغرام.

| Secret | القيمة |
|---|---|
| `FB_PAGE_ID` | رقم الصفحة |
| `FB_PAGE_TOKEN` | توكن الصفحة |
| `IG_USER_ID` | رقم `instagram_business_account` |

> صور إنستغرام بتنسحب من رابط عام (`raw.githubusercontent.com`)، ف لازم الريبو يكون **Public**.
> إذا كان خاص، حط رابط عام للملفات بـ Variable اسمه `MEDIA_BASE_URL`. الفيديو ما بيحتاج هالشي.

### 2) يوتيوب

1. ادخل على https://console.cloud.google.com واعمل مشروع، وفعّل **YouTube Data API v3**.
2. من **OAuth consent screen** اختار External، وبعدها **Publish app**. إذا ضل بوضع Testing، التوكن بينتهي بعد 7 أيام.
3. من **Credentials → Create OAuth client ID** اختار النوع **Desktop app**.
4. على كمبيوترك (لازم يكون عليه Node 18 أو أحدث) نفّذ:
   ```
   node social/auth.mjs youtube
   ```
   فوت على الرابط اللي بيطلع، وافق، وانسخ عنوان الصفحة اللي بتفتح بعدها وحطه بالسكربت.

| Secret | القيمة |
|---|---|
| `YT_CLIENT_ID` | Client ID |
| `YT_CLIENT_SECRET` | Client secret |
| `YT_REFRESH_TOKEN` | القيمة اللي طلعها السكربت |

> مشاريع Google الجديدة، الفيديوهات يلي بترفعها بتنزل **Private** لحد ما يعمل المشروع
> [تدقيق من يوتيوب](https://support.google.com/youtube/contact/yt_api_form). طلبه مجاني.

### 3) تيك توك

1. ادخل على https://developers.tiktok.com واعمل App.
2. زيد المنتجات **Login Kit** و **Content Posting API**، وفعّل **Direct Post**.
3. سجّل Redirect URI، مثلاً رابط موقعك على GitHub Pages.
4. على كمبيوترك نفّذ:
   ```
   node social/auth.mjs tiktok
   ```

| Secret | القيمة |
|---|---|
| `TIKTOK_CLIENT_KEY` | Client key |
| `TIKTOK_CLIENT_SECRET` | Client secret |
| `TIKTOK_REFRESH_TOKEN` | القيمة اللي طلعها السكربت (صالحة سنة) |

> قبل ما توافق تيك توك على التطبيق (Audit)، المنشورات بتنزل **خاصة (SELF_ONLY)** بس.
> بعد الموافقة حط Variable اسمه `TIKTOK_PRIVACY` وقيمته `PUBLIC_TO_EVERYONE`.

### متغيرات اختيارية (Variables)

| Variable | الافتراضي | الشرح |
|---|---|---|
| `YT_PRIVACY` | `public` | `public` / `unlisted` / `private` |
| `TIKTOK_PRIVACY` | `SELF_ONLY` | `PUBLIC_TO_EVERYONE` / `MUTUAL_FOLLOW_FRIENDS` / `FOLLOWER_OF_CREATOR` / `SELF_ONLY` |
| `MEDIA_BASE_URL` | — | رابط عام للملفات إذا الريبو خاص |

## التجربة محلياً

```
node social/publish.mjs --dry-run            # بيفحص المنشورات بدون ما ينشر
node social/publish.mjs --only <اسم-المجلد>  # بينشر منشور واحد
```

## ملاحظات

- GitHub ما بيقبل ملف أكبر من **100MB**، ف الفيديوهات الأكبر لازم تنضغط.
- النتائج بتبين بـ **Actions** بالريبو، وبملف `status.json` جوّا مجلد المنشور.
