// ====== تبويب "فيديو تعريفي": الفيديو اللي بيظهر في الموقع تحت أول صفحة (الهيرو) ======
// البيانات بتتخزن في Firestore → collection: siteContent → doc "video"
//   { videoUrl, videoId, eyebrow, title, text }
//   videoUrl = فيديو مرفوع على Cloudinary، videoId = يوتيوب (اختياري)، وكلاهما فاضي = القسم مخفي في الموقع
import { saveSiteDoc, subscribeToSiteDoc } from "./services/siteContentService.js";
import { parseYouTubeId } from "./youtube.js";
import { uploadVideoToCloudinary, validateVideoFile } from "./videoUpload.js";
import { videoPosterUrl } from "./imageUrl.js";

const $ = (id) => document.getElementById(id);

const form = $("form-intro-video");
const urlInput = $("intro-url");
const fileInput = $("intro-file");
const eyebrowInput = $("intro-eyebrow");
const titleInput = $("intro-title");
const textInput = $("intro-text");
const saveBtn = $("intro-save");
const removeBtn = $("intro-remove");
const statusEl = $("intro-status");
const hintEl = $("intro-hint");
const previewEl = $("intro-preview");

let current = null; // المحفوظ في Firestore
let filled = false;
let videoUrl = ""; // الفيديو المرفوع الحالي (بالفورم)
let upload = null; // { cancel, promise } أثناء الرفع
let uploading = false;
let uploadError = ""; // تعبئة الحقول مرة وحدة عند أول تحميل

const flash = (msg, ms = 2500) => {
  statusEl.textContent = msg;
  if (msg) setTimeout(() => statusEl.textContent === msg && (statusEl.textContent = ""), ms);
};

function renderPreview(ytId) {
  previewEl.innerHTML = "";
  if (!ytId && !videoUrl && !uploading && !uploadError) return;

  const tile = document.createElement("div");
  tile.className = "video-tile" + (uploadError ? " is-error" : "");
  let thumb;
  let meta;
  if (uploading) {
    thumb = "<span>🎬</span>";
    meta = '<span class="vt-name">جاري الرفع...</span><div class="vt-bar"><i></i></div>';
  } else if (uploadError) {
    thumb = "<span>🎬</span>";
    meta = `<span class="vt-name">${uploadError}</span>`;
  } else if (videoUrl) {
    thumb = `<img src="${videoPosterUrl(videoUrl)}" alt="معاينة الفيديو" loading="lazy" decoding="async" onerror="this.remove()"><span>▶</span>`;
    meta = '<span class="vt-name">تم الرفع ✔</span>';
  } else {
    thumb = `<img src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg" alt="معاينة الفيديو" loading="lazy" decoding="async"><span>▶</span>`;
    meta = '<span class="vt-name">يوتيوب</span>';
  }
  tile.innerHTML = `<div class="vt-thumb">${thumb}</div><div class="vt-meta">${meta}</div>`;
  if (videoUrl || uploading || uploadError) {
    const x = document.createElement("button");
    x.type = "button";
    x.className = "remove-x";
    x.textContent = "✕";
    x.addEventListener("click", () => {
      upload?.cancel();
      upload = null;
      uploading = false;
      uploadError = "";
      videoUrl = "";
      fileInput.value = "";
      renderPreview(parseYouTubeId(urlInput.value));
    });
    tile.appendChild(x);
  }
  previewEl.appendChild(tile);
}

function fill(d) {
  videoUrl = d?.videoUrl || "";
  uploadError = "";
  urlInput.value = d?.videoId ? `https://www.youtube.com/watch?v=${d.videoId}` : "";
  eyebrowInput.value = d?.eyebrow ?? "";
  titleInput.value = d?.title ?? "";
  textInput.value = d?.text ?? "";
  renderPreview(d?.videoId || null);
  removeBtn.style.display = d?.videoUrl || d?.videoId ? "inline-block" : "none";
}

// اختيار ملف فيديو → يبدأ الرفع فوراً بالخلفية
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const err = validateVideoFile(file);
  if (err) {
    fileInput.value = "";
    flash(err, 5000);
    return;
  }
  upload?.cancel();
  uploadError = "";
  uploading = true;
  videoUrl = "";
  renderPreview(null);
  const up = uploadVideoToCloudinary(file, (pct) => {
    const bar = previewEl.querySelector(".vt-bar i");
    if (bar) bar.style.width = pct + "%";
  });
  upload = up;
  up.promise.then(
    (url) => {
      if (upload !== up) return;
      uploading = false;
      videoUrl = url;
      urlInput.value = ""; // الفيديو المرفوع بياخد الأولوية على رابط يوتيوب
      renderPreview(null);
    },
    (e) => {
      if (upload !== up || e.message === "cancelled") return;
      uploading = false;
      uploadError = "فشل الرفع، جرب مرة ثانية";
      renderPreview(null);
    },
  );
});

window.addEventListener("beforeunload", (e) => {
  if (uploading) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// معاينة فورية أثناء اللصق
urlInput.addEventListener("input", () => {
  if (urlInput.value.trim()) {
    // اختار رابط يوتيوب بدل الفيديو المرفوع
    upload?.cancel();
    upload = null;
    uploading = false;
    uploadError = "";
    videoUrl = "";
  }
  renderPreview(parseYouTubeId(urlInput.value));
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (uploading) {
    flash("استنى لحد ما يخلص رفع الفيديو", 3000);
    return;
  }
  const raw = urlInput.value.trim();
  const videoId = raw ? parseYouTubeId(raw) : "";
  if (raw && !videoId) {
    flash("رابط اليوتيوب مش صحيح", 4000);
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "جاري الحفظ...";
  try {
    await saveSiteDoc("video", {
      videoUrl: videoUrl || "",
      videoId: videoUrl ? "" : videoId || "",
      eyebrow: eyebrowInput.value.trim(),
      title: titleInput.value.trim(),
      text: textInput.value.trim(),
    });
    flash(videoId || videoUrl ? "تم الحفظ ✓" : "تم الحفظ — القسم مخفي في الموقع لأنه ما في فيديو");
  } catch (err) {
    console.error("Save Intro Video Error:", err);
    flash("تعذر الحفظ، تأكد من صلاحيات Firestore وجرب مرة ثانية", 5000);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "حفظ";
  }
});

removeBtn.addEventListener("click", async () => {
  if (!confirm("متأكد بدك تزيل الفيديو؟ القسم رح يختفي من الموقع.")) return;
  try {
    await saveSiteDoc("video", { videoUrl: "", videoId: "", eyebrow: "", title: "", text: "" });
    upload?.cancel();
    uploading = false;
    fill(null);
    flash("تمت الإزالة ✓");
  } catch (err) {
    console.error("Remove Intro Video Error:", err);
    flash("تعذر الإزالة، جرب مرة ثانية", 5000);
  }
});

// === الاستماع الحي (بيتشغّل من auth.js بعد تسجيل الدخول) ===
export function listenIntroVideo() {
  filled = false;
  return subscribeToSiteDoc(
    "video",
    (data) => {
      current = data;
      if (!filled) {
        fill(current);
        filled = true;
      } else {
        removeBtn.style.display = current?.videoId || current?.videoUrl ? "inline-block" : "none";
      }
      hintEl.textContent = current?.videoId || current?.videoUrl ? "" : "لسا ما في فيديو — القسم مخفي في الموقع. ارفع فيديو واضغط حفظ.";
    },
    (err) => {
      console.error("Listen Intro Video Error:", err);
      hintEl.textContent = "تعذر تحميل البيانات — تأكد من صلاحيات Firestore";
    },
  );
}
