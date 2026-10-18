import { db } from "../config.js";
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLLECTION_NAME = "siteContent";

/**
 * حفظ محتوى قسم (id = "why" أو "about")
 * setDoc بدون merge: بنكتب الـ doc كامل (بما فيه مصفوفة الكروت) عشان نتجنب أي بيانات قديمة
 */
export const saveSiteDoc = async (id, data) => {
  return await setDoc(doc(db, COLLECTION_NAME, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

/**
 * الاستماع الحي لمحتوى قسم. بترجّع null لو لسا ما اتحفظ شي
 */
export const subscribeToSiteDoc = (id, onDataChanged, onError) => {
  return onSnapshot(
    doc(db, COLLECTION_NAME, id),
    (snap) => onDataChanged(snap.exists() ? snap.data() : null),
    (err) => onError?.(err),
  );
};
