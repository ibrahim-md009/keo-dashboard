import { createWork, updateWork, deleteWork, subscribeToWorks } from "./services/worksService.js";
import { uploadOneToCloudinary, uploadManyToCloudinary } from "./image-upload.js";
import { thumbUrl, mediumUrl, videoPosterUrl } from "./imageUrl.js";
import { uploadVideoToCloudinary, validateVideoFile } from "./videoUpload.js";
import { parseYouTubeId } from "./youtube.js";
import { categorySelect } from "./categoriesUI.js";
import {
  showUploadOverlay,
  setUploadOverlayText,
  hideUploadOverlaySuccess,
  hideUploadOverlayNow,
} from "./uploadOverlay.js";

// === DOM Elements ===
const worksForm = document.getElementById("form-works");
const worksFileInput = document.getElementById("works-file");
const worksPreview = document.getElementById("works-preview");
const worksSubFilesInput = document.getElementById("works-sub-files"); // جديد: <input type="file" multiple>
const worksSubPreview = document.getElementById("works-sub-preview"); // جديد: div للمعاينة
const worksVideoFilesInput = document.getElementById("works-video-files"); // رفع فيديو مباشر
const worksFeaturedInput = document.getElementById("works-featured"); // النجمة: عمل مميز
const worksVideoInput = document.getElementById("works-video-url"); // جديد: خانة لصق رابط يوتيوب
const worksVideoAddBtn = document.getElementById("works-video-add"); // جديد: زر إضافة الفيديو
const worksVideoList = document.getElementById("works-video-list"); // جديد: قائمة الفيديوهات المضافة
const worksSubmitBtn = document.getElementById("works-submit-btn");
const worksCancelBtn = document.getElementById("works-cancel-btn");
const worksFormTitle = document.getElementById("works-form-title");
const worksCard = worksForm.closest(".card");

// === State ===
let editingWorkId = null;
let editingWorkImage = null;
let worksPreviewObjectUrl = null;
let worksSubExistingUrls = [];
let worksSubNewFiles = [];
// عناصر الفيديو: { type: "youtube", id } | { type: "cloudinary", url } | { type: "pending", file, progress, error, upload }
let worksVideos = [];

// === Object URLs للصور الفرعية: رابط واحد لكل ملف + تحريره عند عدم الحاجة ===
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

// === Sub images preview ===
function renderWorksSubPreview() {
  worksSubPreview.innerHTML = "";
  const total = worksSubExistingUrls.length + worksSubNewFiles.length;
  if (total === 0) return;

  const badge = document.createElement("div");
  badge.className = "count-badge";
  badge.textContent = `${total} صورة فرعية`;
  worksSubPreview.appendChild(badge);

  worksSubExistingUrls.forEach((url, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "thumb-wrap";
    wrap.innerHTML = `<img src="${thumbUrl(url)}" alt="" loading="lazy" decoding="async"><button type="button" class="remove-x">✕</button>`;
    wrap.querySelector(".remove-x").addEventListener("click", () => {
      worksSubExistingUrls.splice(idx, 1);
      renderWorksSubPreview();
    });
    worksSubPreview.appendChild(wrap);
  });

  worksSubNewFiles.forEach((file, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "thumb-wrap";
    wrap.innerHTML = `<img src="${previewUrl(file)}" alt="" decoding="async"><button type="button" class="remove-x">✕</button>`;
    wrap.querySelector(".remove-x").addEventListener("click", () => {
      releaseUrl(file);
      worksSubNewFiles.splice(idx, 1);
      renderWorksSubPreview();
    });
    worksSubPreview.appendChild(wrap);
  });
}

// === YouTube videos ===
const readyVideos = () => worksVideos.filter((v) => v.type !== "pending");
const pendingVideos = () => worksVideos.filter((v) => v.type === "pending" && !v.error);

// نرسم القائمة مرة وحدة؛ تقدم الرفع بيتحدّث على عنصر الشريط فقط (بدون إعادة رسم) عشان ما نثقّل الصفحة
function renderWorksVideos() {
  worksVideoList.innerHTML = "";
  if (worksVideos.length === 0) return;

  const badge = document.createElement("div");
  badge.className = "count-badge";
  badge.textContent = `${worksVideos.length} فيديو`;
  worksVideoList.appendChild(badge);

  worksVideos.forEach((v) => {
    const wrap = document.createElement("div");
    wrap.className = "video-tile" + (v.error ? " is-error" : "");
    let thumb = "";
    let meta = "";
    if (v.type === "youtube") {
      thumb = `<img src="https://img.youtube.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy" decoding="async"><span>▶</span>`;
      meta = `<span class="vt-name">يوتيوب</span>`;
    } else if (v.type === "cloudinary") {
      thumb = `<img src="${videoPosterUrl(v.url)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"><span>▶</span>`;
      meta = `<span class="vt-name">تم الرفع ✔</span>`;
    } else {
      thumb = `<span>🎬</span>`;
      meta = `<span class="vt-name">${v.error ? v.error : v.file.name}</span>${
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
      worksVideos = worksVideos.filter((x) => x !== v);
      renderWorksVideos();
    });
    worksVideoList.appendChild(wrap);
  });
}

// بيبدأ رفع الفيديو فوراً بالخلفية، ولما يخلص بيتحوّل العنصر لرابط محفوظ
function queueVideoFiles(files) {
  const statusEl = document.getElementById("works-upload-status");
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
        const i = worksVideos.indexOf(item);
        if (i !== -1) worksVideos[i] = { type: "cloudinary", url };
        renderWorksVideos();
      },
      (e) => {
        if (e.message === "cancelled") return;
        item.error = "فشل الرفع";
        renderWorksVideos();
      },
    );
    worksVideos.push(item);
  });
  renderWorksVideos();
}

// بترجّع true لو الخانة فاضية أو الرابط اتضاف، و false لو الرابط غلط
function addVideoFromInput() {
  const statusEl = document.getElementById("works-upload-status");
  const raw = worksVideoInput.value.trim();
  if (!raw) return true;
  const id = parseYouTubeId(raw);
  if (!id) {
    statusEl.textContent = "رابط يوتيوب غير صحيح";
    return false;
  }
  if (!worksVideos.some((v) => v.type === "youtube" && v.id === id)) worksVideos.push({ type: "youtube", id });
  worksVideoInput.value = "";
  statusEl.textContent = "";
  renderWorksVideos();
  return true;
}

// === Event Listeners ===
worksFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    if (worksPreviewObjectUrl) URL.revokeObjectURL(worksPreviewObjectUrl);
    worksPreviewObjectUrl = URL.createObjectURL(file);
    worksPreview.src = worksPreviewObjectUrl;
    worksPreview.style.display = "block";
  } else if (editingWorkImage) {
    worksPreview.src = mediumUrl(editingWorkImage);
    worksPreview.style.display = "block";
  } else {
    worksPreview.style.display = "none";
  }
});

// اختيار عدة صور فرعية مرة واحدة (ويمكن الإضافة على اختيار سابق)
worksSubFilesInput.addEventListener("change", (e) => {
  worksSubNewFiles.push(...Array.from(e.target.files));
  worksSubFilesInput.value = "";
  renderWorksSubPreview();
});

worksVideoFilesInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  worksVideoFilesInput.value = "";
  queueVideoFiles(files);
});

// تنبيه لو حاول يسكّر الصفحة والفيديو لسا بيترفع
window.addEventListener("beforeunload", (e) => {
  if (pendingVideos().length) {
    e.preventDefault();
    e.returnValue = "";
  }
});

worksVideoAddBtn.addEventListener("click", addVideoFromInput);
// Enter داخل خانة الرابط يضيف الفيديو بدل ما يرسل الفورم
worksVideoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addVideoFromInput();
  }
});

worksCancelBtn.addEventListener("click", resetWorksForm);

worksForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("works-upload-status");
  const file = worksFileInput.files[0];

  if (!file && !editingWorkImage) {
    statusEl.textContent = "الصورة إلزامية";
    return;
  }

  // لو لزق رابط ونسي يضغط "إضافة" نضيفه تلقائياً (ولو الرابط غلط نوقف)
  if (!addVideoFromInput()) return;

  if (worksVideos.some((v) => v.type === "pending" && v.error)) {
    statusEl.textContent = "في فيديو فشل رفعه — احذفه أو أعد رفعه";
    return;
  }

  worksSubmitBtn.disabled = true;
  worksSubmitBtn.textContent = editingWorkId ? "جاري الحفظ..." : "جاري الإضافة...";
  showUploadOverlay(file ? "جاري رفع الصورة..." : "جاري الحفظ...");

  try {
    let imgUrl = editingWorkImage;
    if (file) {
      statusEl.textContent = "جاري رفع الصورة...";
      imgUrl = await uploadOneToCloudinary(file, statusEl);
      statusEl.textContent = "تم رفع الصورة ✔";
    }

    if (worksSubNewFiles.length > 0) {
      setUploadOverlayText(`جاري رفع ${worksSubNewFiles.length} صورة فرعية...`);
    }
    const newSubUrls = await uploadManyToCloudinary(worksSubNewFiles, statusEl);
    const subImages = [...worksSubExistingUrls, ...newSubUrls];

    // لو في فيديو لسا بيترفع نستناه (غالباً خلص أثناء ما كان يعبي الفورم)
    if (pendingVideos().length) {
      setUploadOverlayText("جاري إكمال رفع الفيديو...");
      await Promise.all(pendingVideos().map((v) => v.done));
    }
    if (worksVideos.some((v) => v.type === "pending")) throw new Error("video upload failed");

    setUploadOverlayText("جاري الحفظ...");

    const payload = {
      img: imgUrl,
      subImages,
      videos: readyVideos(),
      featured: worksFeaturedInput.checked,
      category: categorySelect.value,
      title: document.getElementById("works-main").value.trim(),
      sub: document.getElementById("works-sub").value.trim(),
    };

    if (editingWorkId) {
      await updateWork(editingWorkId, payload);
    } else {
      await createWork(payload);
    }

    hideUploadOverlaySuccess(editingWorkId ? "تم حفظ التعديل ✔" : "تمت إضافة العمل ✔");
    resetWorksForm();
    statusEl.textContent = "";
  } catch (err) {
    console.error("Works Form Submit Error:", err);
    statusEl.textContent = "صار خطأ، جرب مرة ثانية";
    hideUploadOverlayNow();
  } finally {
    worksSubmitBtn.disabled = false;
    worksSubmitBtn.textContent = editingWorkId ? "حفظ التعديل" : "إضافة العمل";
  }
});

// === Functions ===

// بترجّع دالة إلغاء الاشتراك (unsubscribe) عشان auth.js يوقف الـ listener عند الخروج
export function listenWorks() {
  return subscribeToWorks((works) => {
    const list = document.getElementById("works-list");
    if (!works.length) {
      list.innerHTML = '<p class="empty-msg">لسا ما في أعمال مضافة</p>';
      return;
    }

    const frag = document.createDocumentFragment();
    works.forEach((item) => {
      const subCount = (item.subImages || []).length + (item.videos || []).length;
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <img src="${thumbUrl(item.img)}" alt="" loading="lazy" decoding="async" width="68" height="68">
        <div class="item-info">
          <span class="tag">${item.category || ""}</span>
          <p class="main">${item.featured ? '<span class="featured-badge" title="عمل مميز">★</span> ' : ""}${item.title || ""}</p>
          <p class="sub">${item.sub || ""}</p>
          ${subCount ? `<p class="sub">${subCount + 1} ملفات</p>` : ""}
        </div>
        <div class="item-actions">
          <button class="star ${item.featured ? "on" : ""}" title="${item.featured ? "إزالة من الأعمال المميزة" : "إضافة للأعمال المميزة"}" aria-label="عمل مميز">${item.featured ? "★" : "☆"}</button>
          <button class="edit">تعديل</button>
          <button class="del">حذف</button>
        </div>`;

      row.querySelector(".star").addEventListener("click", () => updateWork(item.id, { featured: !item.featured }));
      row.querySelector(".edit").addEventListener("click", () => startEditWork(item.id, item));
      row.querySelector(".del").addEventListener("click", async () => {
        if (confirm("متأكد بدك تحذف هالعنصر؟")) {
          await deleteWork(item.id);
        }
      });

      frag.appendChild(row);
    });
    list.replaceChildren(frag);
  });
}

function startEditWork(id, item) {
  releaseAllUrls();
  editingWorkId = id;
  editingWorkImage = item.img || null;
  worksSubExistingUrls = [...(item.subImages || [])];
  worksSubNewFiles = [];
  worksVideos.forEach((v) => v.type === "pending" && v.upload?.cancel());
  worksVideos = [...(item.videos || [])].map((v) => (v.url ? { type: "cloudinary", url: v.url } : v));
  worksFeaturedInput.checked = !!item.featured;
  worksFileInput.required = false;
  worksFileInput.value = "";
  if (editingWorkImage) {
    worksPreview.src = mediumUrl(editingWorkImage);
    worksPreview.style.display = "block";
  }
  renderWorksSubPreview();
  renderWorksVideos();
  categorySelect.value = item.category || "";
  document.getElementById("works-main").value = item.title || "";
  document.getElementById("works-sub").value = item.sub || "";
  worksSubmitBtn.textContent = "حفظ التعديل";
  worksFormTitle.textContent = "تعديل عمل";
  worksCancelBtn.style.display = "inline-block";
  worksCard.classList.add("editing");
  requestAnimationFrame(() => worksCard.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function resetWorksForm() {
  releaseAllUrls();
  editingWorkId = null;
  editingWorkImage = null;
  worksSubExistingUrls = [];
  worksSubNewFiles = [];
  worksVideos.forEach((v) => v.type === "pending" && v.upload?.cancel());
  worksVideos = [];
  worksForm.reset();
  worksVideoList.innerHTML = "";
  worksPreview.style.display = "none";
  worksSubPreview.innerHTML = "";
  worksFileInput.required = true;
  worksSubmitBtn.textContent = "إضافة العمل";
  worksFormTitle.textContent = "إضافة عمل جديد";
  worksCancelBtn.style.display = "none";
  worksCard.classList.remove("editing");
}
