// ====== نسخة مصغّرة من صور Cloudinary للقوائم ======
// القوائم بتعرض الصور بحجم 68px، فما في داعي نحمّل ونفك صورة 1800px لكل خانة.
// Cloudinary بيعطينا نسخة مقصوصة وخفيفة (WebP/AVIF تلقائياً) بمجرد إضافة تحويل للرابط.
// أي رابط مو من Cloudinary (أو ما إلو الشكل المعروف) بيرجع كما هو بدون تغيير.
export function thumbUrl(url, size = 136) {
  if (!url || typeof url !== "string") return url;
  return url.replace(
    /(res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/)/,
    `$1c_fill,w_${size},h_${size},q_auto,f_auto/$2`,
  );
}

// نسخة متوسطة (عرض أقصى 800px، بدون قص) لمعاينة الصورة الكبيرة داخل الفورم
export function mediumUrl(url, width = 800) {
  if (!url || typeof url !== "string") return url;
  return url.replace(
    /(res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/)/,
    `$1c_limit,w_${width},q_auto,f_auto/$2`,
  );
}

// ====== الفيديو (Cloudinary) ======
// صورة غلاف خفيفة من أول لقطة بالفيديو (للمعاينة بالداشبورد)
export function videoPosterUrl(url, width = 320) {
  if (!url || typeof url !== "string") return url;
  return url
    .replace(/(res\.cloudinary\.com\/[^/]+\/video\/upload\/)(v\d+\/)/, `$1so_0,c_limit,w_${width},q_auto,f_jpg/$2`)
    .replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
}
