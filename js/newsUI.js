import { createNews, updateNews, deleteNews, subscribeToNews } from "./services/newsService.js";
import { uploadOneToCloudinary, uploadManyToCloudinary } from "./services/imageUpload.js";
import { thumbUrl, mediumUrl, videoPosterUrl } from "./imageUrl.js";
import { uploadVideoToCloudinary, validateVideoFile } from "./services/videoUpload.js";
import { parseYouTubeId } from "./youtube.js";
import {
  showUploadOverlay,
  setUploadOverlayText,
  hideUploadOverlaySuccess,
  hideUploadOverlayNow,
} from "./uploadOverlay.js";

// === DOM Elements ===
const newsForm = document.getElementById("form-news");
const newsMainFileInput = document.getElementById("news-main-file");
const newsMainPreviewWrap = document.getElementById("news-main-preview-wrap");
const newsSubFilesInput = document.getElementById("news-sub-files");
const newsSubPreview = document.getElementById("news-sub-preview");
const newsVideoFilesInput = document.getElementById("news-video-files"); // رفع فيديو مباشر
const newsVideoInput = document.getElementById("news-video-url"); // خانة لصق رابط يوتيوب
const newsVideoAddBtn = document.getElementById("news-video-add");
const newsVideoList = document.getElementById("news-video-list"); // قائمة الفيديوهات المضافة
const newsSubmitBtn = document.getElementById("news-submit-btn");
const newsCancelBtn = document.getElementById("news-cancel-btn");
const newsFormTitle = document.getElementById("news-form-title");
const newsCard = newsForm.closest(".card");

// === State Variables ===
let editingNewsId = null;
let newsMainExistingUrl = null;
let newsMainNewFile = null;
let newsSubExistingUrls = [];
let newsSubNewFiles = [];
// عناصر الفيديو (نفس شكل الأعمال): { type: "youtube", id } | { type: "cloudinary", url } | { type: "pending", file, progress, error, upload }
let newsVideos = [];

// الأخبار بتنعرض بـ innerHTML، فنهرّب النصوص عشان أي رمز < أو " ما يخرّب القائمة
const esc = (str) =>
  String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// === Object URLs: رابط واحد لكل ملف + تحريره لما ما نحتاجه (كان بيتولّد رابط جديد بكل رسم وما بيتحرر) ===
const objectUrls = new Map();
function previewUrl(file) {
  let u = objectUrls.get(file);
  if (!u) {
    u = URL.createObjectURL(file);
    objectUrls.set(file, u);
  }
  return u;
}
function releaseUrl(file) {
  const u = objectUrls.get(file);
  if (u) {
    URL.revokeObjectURL(u);
    objectUrls.delete(file);
  }
}
function releaseAllUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls.clear();
}

// === Preview Functions ===
function renderNewsMainPreview() {
  newsMainPreviewWrap.innerHTML = "";
  const url = newsMainNewFile ? previewUrl(newsMainNewFile) : mediumUrl(newsMainExistingUrl);
  if (!url) return;

  const box = document.createElement("div");
  box.className = "main-preview-box";
  box.innerHTML = `<img src="${url}" alt="" decoding="async"><button type="button" class="remove-x" title="إزالة">✕</button>`;
  box.querySelector(".remove-x").addEventListener("click", () => {
    if (newsMainNewFile) releaseUrl(newsMainNewFile);
    newsMainNewFile = null;
    newsMainExistingUrl = null;
    newsMainFileInput.value = "";
    renderNewsMainPreview();
  });
  newsMainPreviewWrap.appendChild(box);
}

function renderNewsSubPreview() {
  newsSubPreview.innerHTML = "";
  const total = newsSubExistingUrls.length + newsSubNewFiles.length;
  if (total === 0) return;

  const badge = document.createElement("div");
  badge.className = "count-badge";
  badge.textContent = `${total} صورة فرعية`;
  newsSubPreview.appendChild(badge);

  newsSubExistingUrls.forEach((url, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "thumb-wrap";
    wrap.innerHTML = `<img src="${thumbUrl(url)}" alt="" loading="lazy" decoding="async"><button type="button" class="remove-x">✕</button>`;
    wrap.querySelector(".remove-x").addEventListener("click", () => {
      newsSubExistingUrls.splice(idx, 1);
      renderNewsSubPreview();
    });
    newsSubPreview.appendChild(wrap);
  });

  newsSubNewFiles.forEach((file, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "thumb-wrap";
    wrap.innerHTML = `<img src="${previewUrl(file)}" alt="" decoding="async"><button type="button" class="remove-x">✕</button>`;
    wrap.querySelector(".remove-x").addEventListener("click", () => {
      releaseUrl(file);
      newsSubNewFiles.splice(idx, 1);
      renderNewsSubPreview();
    });
    newsSubPreview.appendChild(wrap);
  });
}

// === Videos (يوتيوب + رفع مباشر) ===
const readyVideos = () => newsVideos.filter((v) => v.type !== "pending");
const pendingVideos = () => newsVideos.filter((v) => v.type === "pending" && !v.error);

// نرسم القائمة مرة وحدة؛ تقدم الرفع بيتحدّث على عنصر الشريط فقط (بدون إعادة رسم)
function renderNewsVideos() {
  newsVideoList.innerHTML = "";
  if (newsVideos.length === 0) return;

  const badge = document.createElement("div");
  badge.className = "count-badge";
  badge.textContent = `${newsVideos.length} فيديو`;
  newsVideoList.appendChild(badge);

  newsVideos.forEach((v) => {
    const wrap = document.createElement("div");
    wrap.className = "video-tile" + (v.error ? " is-error" : "");
    let thumb = "";
    let meta = "";
    if (v.type === "youtube") {
      thumb = `<img src="https://img.youtube.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" decoding="async"><span>▶</span>`;
      meta = `<span class="vt-name">يوتيوب</span>`;
    } else if (v.type === "cloudinary") {
      thumb = `<img src="${esc(videoPosterUrl(v.url))}" alt="" loading="lazy" decoding="async" onerror="this.remove()"><span>▶</span>`;
      meta = `<span class="vt-name">تم الرفع ✔</span>`;
    } else {
      thumb = `<span>🎬</span>`;
      meta = `<span class="vt-name">${v.error ? esc(v.error) : esc(v.file.name)}</span>${
        v.error ? "" : '<div class="vt-bar"><i></i></div>'
      }`;
    }
    wrap.innerHTML = `<div class="vt-thumb">${thumb}</div><div class="vt-meta">${meta}</div><button type="button" class="remove-x">✕</button>`;
    if (v.type === "pending") {
      v.barEl = wrap.querySelector(".vt-bar i");
      if (v.barEl) v.barEl.style.width = (v.progress || 0) + "%";
    }
    wrap.querySelector(".remove-x").addEventListener("click", () => {
      if (v.type === "pending") v.upload?.cancel();
      newsVideos = newsVideos.filter((x) => x !== v);
      renderNewsVideos();
    });
    newsVideoList.appendChild(wrap);
  });
}

// بيبدأ رفع الفيديو فوراً بالخلفية، ولما يخلص بيتحوّل العنصر لرابط محفوظ
function queueVideoFiles(files) {
  const statusEl = document.getElementById("news-upload-status");
  statusEl.textContent = "";
  files.forEach((file) => {
    const err = validateVideoFile(file);
    if (err) {
      statusEl.textContent = err;
      return;
    }
    const item = { type: "pending", file, progress: 0, error: null, upload: null, done: null };
    item.upload = uploadVideoToCloudinary(file, (pct) => {
      item.progress = pct;
      if (item.barEl) item.barEl.style.width = pct + "%";
    });
    item.done = item.upload.promise.then(
      (url) => {
        const i = newsVideos.indexOf(item);
        if (i !== -1) newsVideos[i] = { type: "cloudinary", url };
        renderNewsVideos();
      },
      (e) => {
        if (e.message === "cancelled") return;
        item.error = "فشل الرفع";
        renderNewsVideos();
      },
    );
    newsVideos.push(item);
  });
  renderNewsVideos();
}

// بترجّع true لو الخانة فاضية أو الرابط اتضاف، و false لو الرابط غلط
function addVideoFromInput() {
  const statusEl = document.getElementById("news-upload-status");
  const raw = newsVideoInput.value.trim();
  if (!raw) return true;
  const id = parseYouTubeId(raw);
  if (!id) {
    statusEl.textContent = "رابط يوتيوب غير صحيح";
    return false;
  }
  if (!newsVideos.some((v) => v.type === "youtube" && v.id === id)) newsVideos.push({ type: "youtube", id });
  newsVideoInput.value = "";
  statusEl.textContent = "";
  renderNewsVideos();
  return true;
}

// === Event Listeners ===
newsMainFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    if (newsMainNewFile) releaseUrl(newsMainNewFile);
    newsMainNewFile = file;
    renderNewsMainPreview();
  }
});

newsSubFilesInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  newsSubNewFiles.push(...files);
  newsSubFilesInput.value = "";
  renderNewsSubPreview();
});

newsVideoFilesInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  newsVideoFilesInput.value = "";
  queueVideoFiles(files);
});

// تنبيه لو حاول يسكّر الصفحة والفيديو لسا بيترفع
window.addEventListener("beforeunload", (e) => {
  if (pendingVideos().length) {
    e.preventDefault();
    e.returnValue = "";
  }
});

newsVideoAddBtn.addEventListener("click", addVideoFromInput);
// Enter داخل خانة الرابط يضيف الفيديو بدل ما يرسل الفورم
newsVideoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addVideoFromInput();
  }
});

newsCancelBtn.addEventListener("click", resetNewsForm);

newsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("news-upload-status");

  // لو لزق رابط ونسي يضغط "إضافة" نضيفه تلقائياً (ولو الرابط غلط نوقف)
  if (!addVideoFromInput()) return;

  if (newsVideos.some((v) => v.type === "pending" && v.error)) {
    statusEl.textContent = "في فيديو فشل رفعه — احذفه أو أعد رفعه";
    return;
  }

  newsSubmitBtn.disabled = true;
  newsSubmitBtn.textContent = editingNewsId ? "جاري الحفظ..." : "جاري النشر...";
  showUploadOverlay("جاري الرفع...");

  try {
    let mainImage = newsMainExistingUrl;
    if (newsMainNewFile) {
      statusEl.textContent = "جاري رفع الصورة الرئيسية...";
      setUploadOverlayText("جاري رفع الصورة الرئيسية...");
      mainImage = await uploadOneToCloudinary(newsMainNewFile, statusEl);
    }

    if (newsSubNewFiles.length > 0) {
      setUploadOverlayText(`جاري رفع ${newsSubNewFiles.length} صورة فرعية...`);
    }
    const newSubUrls = await uploadManyToCloudinary(newsSubNewFiles, statusEl);
    const subImages = [...newsSubExistingUrls, ...newSubUrls];

    // لو في فيديو لسا بيترفع نستناه (غالباً خلص أثناء ما كان يعبي الفورم)
    if (pendingVideos().length) {
      setUploadOverlayText("جاري إكمال رفع الفيديو...");
      await Promise.all(pendingVideos().map((v) => v.done));
    }
    if (newsVideos.some((v) => v.type === "pending")) throw new Error("video upload failed");

    setUploadOverlayText("جاري الحفظ...");

    const payload = {
      mainImage: mainImage || null,
      subImages,
      videos: readyVideos(),
      mainDesc: document.getElementById("news-main").value.trim(),
      subDesc: document.getElementById("news-sub").value.trim(),
    };

    if (editingNewsId) {
      await updateNews(editingNewsId, payload);
    } else {
      await createNews(payload);
    }

    hideUploadOverlaySuccess(editingNewsId ? "تم حفظ التعديل ✔" : "تم نشر الخبر ✔");
    resetNewsForm();
    statusEl.textContent = "";
  } catch (err) {
    console.error("News Form Submit Error:", err);
    statusEl.textContent = "صار خطأ، جرب مرة ثانية";
    hideUploadOverlayNow();
  } finally {
    newsSubmitBtn.disabled = false;
    newsSubmitBtn.textContent = editingNewsId ? "حفظ التعديل" : "نشر الخبر";
  }
});

// === Main Module Functions ===
// بترجّع دالة إلغاء الاشتراك (unsubscribe) عشان auth.js يوقف الـ listener عند الخروج بدل ما يتراكموا
export function listenNews() {
  return subscribeToNews((newsList) => {
    const list = document.getElementById("news-list");
    if (!newsList.length) {
      list.innerHTML = '<p class="empty-msg">لسا ما في أخبار منشورة</p>';
      return;
    }

    // نبني كل العناصر بالذاكرة أول، وبعدين نحطها بالصفحة بعملية واحدة (بدل reflow لكل عنصر)
    const frag = document.createDocumentFragment();
    newsList.forEach((item) => {
      const mainImage = item.mainImage || item.imageUrl || null;
      const subImages = item.subImages || item.images || [];
      const mainImgHtml = mainImage
        ? `<img src="${thumbUrl(mainImage)}" alt="" loading="lazy" decoding="async" width="68" height="68">`
        : `<div class="no-img">بدون صورة رئيسية</div>`;
      const subImagesHtml = subImages
        .map((url) => `<img src="${thumbUrl(url)}" alt="" loading="lazy" decoding="async" width="68" height="68">`)
        .join("");
      const videoCount = (item.videos || []).length;

      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="item-images">
          ${mainImgHtml}
          ${subImagesHtml}
        </div>
        <div class="item-info">
          <p class="main">${esc(item.mainDesc) || "(بدون عنوان)"}</p>
          <p class="sub">${esc(item.subDesc)}</p>
          ${videoCount ? `<p class="sub">🎬 ${videoCount} فيديو</p>` : ""}
        </div>
        <div class="item-actions">
          <button class="edit">تعديل</button>
          <button class="del">حذف</button>
        </div>`;

      row.querySelector(".edit").addEventListener("click", () => startEditNews(item.id, item));
      row.querySelector(".del").addEventListener("click", async () => {
        if (confirm("متأكد بدك تحذف هالعنصر؟")) {
          await deleteNews(item.id);
        }
      });

      frag.appendChild(row);
    });
    list.replaceChildren(frag);
  });
}

function startEditNews(id, item) {
  releaseAllUrls();
  editingNewsId = id;
  newsMainExistingUrl = item.mainImage || item.imageUrl || null;
  newsMainNewFile = null;
  newsSubExistingUrls = [...(item.subImages || item.images || [])];
  newsSubNewFiles = [];
  newsVideos.forEach((v) => v.type === "pending" && v.upload?.cancel());
  newsVideos = (item.videos || []).map((v) => (v.url ? { type: "cloudinary", url: v.url } : v));

  renderNewsMainPreview();
  renderNewsSubPreview();
  renderNewsVideos();

  document.getElementById("news-main").value = item.mainDesc || "";
  document.getElementById("news-sub").value = item.subDesc || "";

  newsSubmitBtn.textContent = "حفظ التعديل";
  newsFormTitle.textContent = "تعديل خبر";
  newsCancelBtn.style.display = "inline-block";
  newsCard.classList.add("editing");
  requestAnimationFrame(() => newsCard.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function resetNewsForm() {
  releaseAllUrls();
  editingNewsId = null;
  newsMainExistingUrl = null;
  newsMainNewFile = null;
  newsSubExistingUrls = [];
  newsSubNewFiles = [];
  newsVideos.forEach((v) => v.type === "pending" && v.upload?.cancel());
  newsVideos = [];
  newsForm.reset();
  newsVideoList.innerHTML = "";
  newsMainPreviewWrap.innerHTML = "";
  newsSubPreview.innerHTML = "";
  newsSubmitBtn.textContent = "نشر الخبر";
  newsFormTitle.textContent = "إضافة خبر جديد";
  newsCancelBtn.style.display = "none";
  newsCard.classList.remove("editing");
}
