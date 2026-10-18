// ====== تبويب "المحتوى": التحكم بقسم "ليه كيو" وقسم "هويتنا" في الموقع ======
// البيانات بتتخزن في Firestore → collection: siteContent
//   doc "why"   => { eyebrow, title, text, cards: [{ icon, title, text }] }
//   doc "about" => { title, text1, text2 }
// (الإحصائيات مستقلة تمامًا وبتتعدّل من تبويب "الإحصائيات")
import { saveSiteDoc, subscribeToSiteDoc } from "./services/siteContentService.js";

// ---------- القيم الافتراضية (نفس النصوص اللي في الموقع لو ما في بيانات محفوظة) ----------
const DEFAULT_WHY = {
  eyebrow: "ليه كيو",
  title: "تجربة تصوير هادئة، بنتيجة تبقى",
  text: "نتعامل مع كل جلسة كقصة قائمة بذاتها، بإضاءة وتفاصيل تُحاكي طابعكم الخاص.",
  cards: [
    {
      icon: "camera",
      title: "عين احترافية",
      text: "فريق مصورين مدرّب على التقاط اللحظة الحقيقية، بعيداً عن الوضعيات المصطنعة.",
    },
    {
      icon: "sun",
      title: "إضاءة مدروسة",
      text: "استديو مجهّز بإضاءة احترافية قابلة للتعديل حسب طبيعة كل جلسة ومزاجها.",
    },
    {
      icon: "heart",
      title: "اهتمام بالتفاصيل",
      text: "من التنسيق قبل الجلسة إلى التسليم، نتابع كل خطوة بعناية شخصية.",
    },
  ],
};

const DEFAULT_ABOUT = {
  title: "هويتنا زيتية، وحرفتنا أصيلة",
  text1:
    "KEO Studio مساحة تصوير هادئة، اخترنا اللون الزيتي هوية لنا لأنه يشبه فلسفتنا: دافئ، أصيل، وثابت. كل جلسة نصممها بعناية من الإضاءة إلى أدق التفاصيل.",
  text2: "فريقنا يستمع لقصتكم أولاً، ثم يترجمها بصرياً بأسلوب هادئ بعيد عن المبالغة، ليبقى التركيز على اللحظة نفسها.",
};

// مفاتيح الأيقونات لازم تطابق WHY_ICONS في الموقع (src/config/siteContent.js)
const WHY_ICONS = {
  camera: "كاميرا",
  sun: "شمس / إضاءة",
  heart: "قلب",
  star: "نجمة",
  sparkles: "لمعان",
  aperture: "عدسة",
  image: "صورة",
  clock: "ساعة / وقت",
  award: "جائزة",
  users: "فريق",
  shield: "حماية / ضمان",
  palette: "ألوان",
  smile: "ابتسامة",
  gem: "جوهرة",
  zap: "سرعة",
  pin: "موقع",
  video: "فيديو",
  bulb: "فكرة",
  thumbs: "إعجاب",
  check: "علامة صح",
};

// === DOM ===
const $ = (id) => document.getElementById(id);

// ليه كيو - العناوين
const whyHeadForm = $("form-why-head");
const whyEyebrow = $("why-eyebrow");
const whyTitle = $("why-title");
const whyText = $("why-text");
const whyHeadSave = $("why-head-save");
const whyHeadReset = $("why-head-reset");
const whyHeadStatus = $("why-head-status");
const whyHint = $("why-hint");

// ليه كيو - الكروت
const cardForm = $("form-why-card");
const cardIcon = $("why-card-icon");
const cardTitle = $("why-card-title");
const cardText = $("why-card-text");
const cardSave = $("why-card-save");
const cardCancel = $("why-card-cancel");
const cardStatus = $("why-card-status");
const cardFormTitle = $("why-card-form-title");
const cardFormCard = $("why-card-form-card");
const cardsList = $("why-cards-list");

// هويتنا
const aboutForm = $("form-about");
const aboutTitle = $("about-title");
const aboutText1 = $("about-text1");
const aboutText2 = $("about-text2");
const aboutSave = $("about-save");
const aboutReset = $("about-reset");
const aboutStatus = $("about-status");
const aboutHint = $("about-hint");

// === State ===
let whyData = null; // المحفوظ في Firestore (أو null لو لسا ما اتحفظ شي)
let aboutData = null;
let editingIndex = null;
let whyFilled = false; // تعبئة الحقول مرة وحدة عند أول تحميل (ما نكتب فوق اللي عم يكتبه المستخدم)
let aboutFilled = false;

// الأيقونات في القائمة المنسدلة
cardIcon.innerHTML = Object.entries(WHY_ICONS)
  .map(([key, label]) => `<option value="${key}">${label}</option>`)
  .join("");

// === Helpers ===
const currentWhy = () => ({
  eyebrow: whyData?.eyebrow ?? DEFAULT_WHY.eyebrow,
  title: whyData?.title ?? DEFAULT_WHY.title,
  text: whyData?.text ?? DEFAULT_WHY.text,
  cards: Array.isArray(whyData?.cards) ? whyData.cards : DEFAULT_WHY.cards,
});

const currentAbout = () => ({
  title: aboutData?.title ?? DEFAULT_ABOUT.title,
  text1: aboutData?.text1 ?? DEFAULT_ABOUT.text1,
  text2: aboutData?.text2 ?? DEFAULT_ABOUT.text2,
});

const flash = (el, msg, ms = 2500) => {
  el.textContent = msg;
  if (msg) setTimeout(() => el.textContent === msg && (el.textContent = ""), ms);
};

const fillWhyHead = (d) => {
  whyEyebrow.value = d.eyebrow;
  whyTitle.value = d.title;
  whyText.value = d.text;
};

const fillAbout = (d) => {
  aboutTitle.value = d.title;
  aboutText1.value = d.text1;
  aboutText2.value = d.text2;
};

const hintText = (saved) =>
  saved ? "" : "لسا ما اتحفظ شي من هون — الموقع بيعرض النصوص الافتراضية. عدّل واضغط حفظ.";

// حفظ كامل لوثيقة "ليه كيو" (العناوين + الكروت) عشان تضل متناسقة
const saveWhy = (patch) => saveSiteDoc("why", { ...currentWhy(), ...patch });

// === ليه كيو: حفظ العناوين ===
whyHeadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  whyHeadSave.disabled = true;
  whyHeadSave.textContent = "جاري الحفظ...";
  try {
    await saveWhy({
      eyebrow: whyEyebrow.value.trim(),
      title: whyTitle.value.trim(),
      text: whyText.value.trim(),
    });
    flash(whyHeadStatus, "تم الحفظ ✓");
  } catch (err) {
    console.error("Save Why Head Error:", err);
    flash(whyHeadStatus, "تعذر الحفظ، تأكد من صلاحيات Firestore وجرب مرة ثانية", 5000);
  } finally {
    whyHeadSave.disabled = false;
    whyHeadSave.textContent = "حفظ العناوين";
  }
});

whyHeadReset.addEventListener("click", () => {
  fillWhyHead(DEFAULT_WHY);
  flash(whyHeadStatus, "رجعت النصوص الافتراضية — اضغط حفظ لتثبيتها");
});

// === ليه كيو: الكروت ===
cardCancel.addEventListener("click", resetCardForm);

cardForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const card = {
    icon: cardIcon.value,
    title: cardTitle.value.trim(),
    text: cardText.value.trim(),
  };
  if (!card.title || !card.text) {
    cardStatus.textContent = "العنوان والنص إلزاميين";
    return;
  }

  const wasEditing = editingIndex !== null;
  const cards = [...currentWhy().cards];
  if (wasEditing) cards[editingIndex] = card;
  else cards.push(card);

  cardSave.disabled = true;
  cardSave.textContent = wasEditing ? "جاري الحفظ..." : "جاري الإضافة...";
  try {
    await saveWhy({ cards });
    resetCardForm();
    cardStatus.textContent = "";
  } catch (err) {
    console.error("Save Why Card Error:", err);
    cardStatus.textContent = "صار خطأ، جرب مرة ثانية";
  } finally {
    cardSave.disabled = false;
    cardSave.textContent = editingIndex !== null ? "حفظ التعديل" : "إضافة الكرت";
  }
});

function startEditCard(index) {
  const card = currentWhy().cards[index];
  if (!card) return;
  editingIndex = index;
  cardIcon.value = WHY_ICONS[card.icon] ? card.icon : "camera";
  cardTitle.value = card.title || "";
  cardText.value = card.text || "";
  cardSave.textContent = "حفظ التعديل";
  cardFormTitle.textContent = "تعديل كرت";
  cardCancel.style.display = "inline-block";
  cardFormCard.classList.add("editing");
  requestAnimationFrame(() => cardFormCard.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function resetCardForm() {
  editingIndex = null;
  cardForm.reset();
  cardSave.textContent = "إضافة الكرت";
  cardFormTitle.textContent = "إضافة كرت جديد";
  cardCancel.style.display = "none";
  cardFormCard.classList.remove("editing");
}

async function moveCard(index, dir) {
  const cards = [...currentWhy().cards];
  const target = index + dir;
  if (target < 0 || target >= cards.length) return;
  [cards[index], cards[target]] = [cards[target], cards[index]];
  // لو كنا عم نعدّل كرت، نتبع مكانه الجديد
  if (editingIndex === index) editingIndex = target;
  else if (editingIndex === target) editingIndex = index;
  try {
    await saveWhy({ cards });
  } catch (err) {
    console.error("Move Why Card Error:", err);
    alert("تعذر تغيير الترتيب، جرب مرة ثانية");
  }
}

async function deleteCard(index) {
  if (!confirm("متأكد بدك تحذف هالكرت؟")) return;
  const cards = currentWhy().cards.filter((_, i) => i !== index);
  try {
    await saveWhy({ cards });
    if (editingIndex === index) resetCardForm();
    else if (editingIndex !== null && editingIndex > index) editingIndex -= 1;
  } catch (err) {
    console.error("Delete Why Card Error:", err);
    alert("تعذر الحذف، جرب مرة ثانية");
  }
}

function renderCards() {
  const { cards } = currentWhy();

  if (!cards.length) {
    cardsList.innerHTML = '<p class="empty-msg">ما في كروت — القسم رح يظهر بدون كروت في الموقع</p>';
    return;
  }

  cardsList.innerHTML = "";
  cards.forEach((card, index) => {
    const row = document.createElement("div");
    row.className = "item";

    const info = document.createElement("div");
    info.className = "item-info";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = WHY_ICONS[card.icon] || "كاميرا";

    const main = document.createElement("p");
    main.className = "main";
    main.textContent = card.title || "";

    const sub = document.createElement("p");
    sub.className = "sub";
    sub.textContent = card.text || "";

    info.append(tag, main, sub);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.innerHTML = `
      <div class="move-row">
        <button type="button" class="move up" aria-label="تحريك للأعلى" title="تحريك للأعلى">▲</button>
        <button type="button" class="move down" aria-label="تحريك للأسفل" title="تحريك للأسفل">▼</button>
      </div>
      <button type="button" class="edit">تعديل</button>
      <button type="button" class="del">حذف</button>`;

    const up = actions.querySelector(".up");
    const down = actions.querySelector(".down");
    up.disabled = index === 0;
    down.disabled = index === cards.length - 1;

    up.addEventListener("click", () => moveCard(index, -1));
    down.addEventListener("click", () => moveCard(index, 1));
    actions.querySelector(".edit").addEventListener("click", () => startEditCard(index));
    actions.querySelector(".del").addEventListener("click", () => deleteCard(index));

    row.append(info, actions);
    cardsList.appendChild(row);
  });
}

// === هويتنا ===
aboutForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  aboutSave.disabled = true;
  aboutSave.textContent = "جاري الحفظ...";
  try {
    await saveSiteDoc("about", {
      title: aboutTitle.value.trim(),
      text1: aboutText1.value.trim(),
      text2: aboutText2.value.trim(),
    });
    flash(aboutStatus, "تم الحفظ ✓");
  } catch (err) {
    console.error("Save About Error:", err);
    flash(aboutStatus, "تعذر الحفظ، تأكد من صلاحيات Firestore وجرب مرة ثانية", 5000);
  } finally {
    aboutSave.disabled = false;
    aboutSave.textContent = "حفظ";
  }
});

aboutReset.addEventListener("click", () => {
  fillAbout(DEFAULT_ABOUT);
  flash(aboutStatus, "رجعت النصوص الافتراضية — اضغط حفظ لتثبيتها");
});

// === الاستماع الحي (بيتشغّل من auth.js بعد تسجيل الدخول) ===
export function listenSiteContent() {
  whyFilled = false;
  aboutFilled = false;

  const unsubWhy = subscribeToSiteDoc(
    "why",
    (data) => {
      whyData = data;
      if (!whyFilled) {
        fillWhyHead(currentWhy());
        whyFilled = true;
      }
      whyHint.textContent = hintText(!!data);
      renderCards();
    },
    (err) => {
      console.error("Listen Why Error:", err);
      cardsList.innerHTML = '<p class="empty-msg">تعذر تحميل البيانات — تأكد من صلاحيات Firestore</p>';
    },
  );

  const unsubAbout = subscribeToSiteDoc(
    "about",
    (data) => {
      aboutData = data;
      if (!aboutFilled) {
        fillAbout(currentAbout());
        aboutFilled = true;
      }
      aboutHint.textContent = hintText(!!data);
    },
    (err) => console.error("Listen About Error:", err),
  );

  return () => {
    unsubWhy();
    unsubAbout();
  };
}
