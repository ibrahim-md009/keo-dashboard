/* =========================================================
   تسريع الرفع: تصغير الصورة بالمتصفح قبل ما تترفع
   (بيقلل حجم الملف بشكل كبير بدون فرق واضح بالجودة)
   ========================================================= */
import { CLOUD_NAME, UPLOAD_PRESET } from "../config.js";

// كاش لمكتبة heic2any (تحويل صور آيفون HEIC/HEIF لصيغة يقدر المتصفح يفكّها)
let heic2anyPromise = null;
function loadHeic2any() {
  if (!heic2anyPromise) {
    heic2anyPromise = import("https://esm.sh/heic2any@0.0.4").then((m) => m.default || m);
  }
  return heic2anyPromise;
}

function isHeic(file) {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return type.includes("heic") || type.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
}

// يجرب يشفّر الكانفاس بجودة معيّنة ويرجع Blob (Promise wrapper حول toBlob)
function encodeCanvas(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// ضغط متدرّج: بيحاول يوصل لحجم مستهدف (targetKB) بالتنازل بالجودة، وإذا ما كفى بالأبعاد كمان
// بحدود دنيا حتى ما تصير الصورة مشوّهة (minQuality / minDim)
async function compressToTarget(
  img,
  outputType,
  { startDim = 1800, startQuality = 0.85, targetKB = 180, minQuality = 0.55, minDim = 1000 } = {},
) {
  let dim = startDim;
  let quality = startQuality;
  let bestBlob = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    let { width, height } = img;
    if (width > dim || height > dim) {
      if (width > height) {
        height = Math.round((height * dim) / width);
        width = dim;
      } else {
        width = Math.round((width * dim) / height);
        height = dim;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    const blob = await encodeCanvas(canvas, outputType, quality);
    if (!blob) break;
    bestBlob = blob;

    if (blob.size <= targetKB * 1024) break; // وصلنا للحجم المطلوب

    // ما وصلنا بعد: أول شي ننزّل الجودة تدريجياً
    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.1);
    } else if (dim > minDim) {
      // الجودة وصلت لأدنى حد مقبول، ننزّل الأبعاد بدل ما نكمل نضغط
      dim = Math.max(minDim, dim - 200);
      quality = 0.75; // نرجّع الجودة لمستوى معقول بعد ما صغّرنا الأبعاد
    } else {
      break; // وصلنا للحدود الدنيا من الجودة والأبعاد، منوقف هون
    }
  }
  return bestBlob;
}

let webpSupportPromise = null;
function supportsWebp() {
  if (!webpSupportPromise) {
    webpSupportPromise = new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      canvas.toBlob((blob) => resolve(!!blob && blob.type === "image/webp"), "image/webp");
    });
  }
  return webpSupportPromise;
}

async function resizeImage(file, targetKB = 180) {
  let sourceFile = file;

  // 1) لو الصورة HEIC/HEIF (آيفون) حوّلها لـ JPEG أول، المتصفح ما بيقدر يفكّها مباشرة
  if (isHeic(file)) {
    try {
      const heic2any = await loadHeic2any();
      const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      sourceFile = new File([convertedBlob], (file.name || "image") + ".jpg", { type: "image/jpeg" });
    } catch (err) {
      console.warn("فشل تحويل HEIC، رح تترفع الصورة الأصلية:", err);
      return { file, wasOptimized: false };
    }
  }

  const useWebp = await supportsWebp();
  const outputType = useWebp ? "image/webp" : "image/jpeg";
  const outputExt = useWebp ? ".webp" : ".jpg";

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const blob = await compressToTarget(img, outputType, { targetKB });
        if (!blob) {
          console.warn("فشل الضغط، رح تترفع الصورة الأصلية بدون تصغير");
          return resolve({ file: sourceFile, wasOptimized: false });
        }
        resolve({
          file: new File([blob], (sourceFile.name || "image") + outputExt, { type: outputType }),
          wasOptimized: true,
        });
      };
      img.onerror = () => {
        console.warn("فشل تحميل الصورة بالـ canvas، رح تترفع الصورة الأصلية");
        resolve({ file: sourceFile, wasOptimized: false });
      };
      img.src = e.target.result;
    };
    reader.onerror = () => resolve({ file: sourceFile, wasOptimized: false });
    reader.readAsDataURL(sourceFile);
  });
}

export async function uploadOneToCloudinary(file, statusEl = null) {
  const { file: optimized, wasOptimized } = await resizeImage(file);
  if (!wasOptimized && statusEl) {
    statusEl.textContent = `تنبيه: تعذّر ضغط "${file.name}" — رح ترفع بحجمها الأصلي`;
  }
  const formData = new FormData();
  formData.append("file", optimized);
  formData.append("upload_preset", UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("فشل رفع الصورة");
  const data = await res.json();
  return data.secure_url;
}

// رفع عدة صور بالتوازي (أسرع بكتير من رفعهم وحدة وحدة)
export async function uploadManyToCloudinary(files, statusEl) {
  if (files.length === 0) return [];
  statusEl.textContent = `جاري رفع ${files.length} صورة...`;
  const urls = await Promise.all(files.map((f) => uploadOneToCloudinary(f, statusEl)));
  statusEl.textContent = `تم رفع ${files.length} صورة ✔`;
  return urls;
}
