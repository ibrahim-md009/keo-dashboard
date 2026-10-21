/* =========================================================
   رفع الفيديو مباشرة من المتصفح إلى Cloudinary (بدون أي معالجة بالمتصفح)
   - الملف بيروح للسيرفر مباشرة (ما بنقرأه بالذاكرة ولا بنضغطه) → ما بيبطّأ الداشبورد
   - الرفع بالخلفية مع شريط تقدم، وبطابور (فيديو واحد بالمرة) عشان ما نخنق النت
   - الفيديو بيتخزن في Firestore كرابط فقط (نص صغير)، فالموقع ما بيتأثر وقت التحميل
   ========================================================= */
import { CLOUD_NAME, UPLOAD_PRESET } from "../config.js";

// الحد الأقصى لحجم الفيديو (الخطة المجانية في Cloudinary بتسمح بـ 100MB للملف)
export const MAX_VIDEO_MB = 100;

export function validateVideoFile(file) {
  if (!file) return "ما تم اختيار ملف";
  const isVideo = (file.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name || "");
  if (!isVideo) return `"${file.name}" مش ملف فيديو`;
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    return `"${file.name}" أكبر من ${MAX_VIDEO_MB}MB — قلّل حجمه أو اضغطه قبل الرفع`;
  }
  return null;
}

// === طابور: فيديو واحد بالمرة ===
let chain = Promise.resolve();

/**
 * رفع فيديو. بترجّع { promise, cancel }
 * promise → يرجّع secure_url، وبيرفض بـ Error("cancelled") لو انلغى
 */
export function uploadVideoToCloudinary(file, onProgress) {
  const xhr = new XMLHttpRequest();
  let cancelled = false;

  const run = () =>
    new Promise((resolve, reject) => {
      if (cancelled) return reject(new Error("cancelled"));
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", UPLOAD_PRESET);

      xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) return resolve(data.secure_url);
          reject(new Error(data?.error?.message || "فشل رفع الفيديو"));
        } catch {
          reject(new Error("فشل رفع الفيديو"));
        }
      };
      xhr.onerror = () => reject(new Error("انقطع الاتصال أثناء رفع الفيديو"));
      xhr.onabort = () => reject(new Error("cancelled"));
      xhr.send(fd);
    });

  const promise = chain.then(run, run);
  chain = promise.catch(() => {}); // الفشل ما يوقف الطابور

  return {
    promise,
    cancel() {
      cancelled = true;
      try {
        xhr.abort();
      } catch {
        /* ما بدأ بعد */
      }
    },
  };
}
