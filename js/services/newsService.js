import { db } from "../config.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// نفس اسم الـ collection اللي الموقع بيقرأ منه (src/services/firestore.js → getNews)
const COLLECTION_NAME = "news";

/**
 * نشر خبر جديد
 * @param {Object} payload { mainImage, subImages, videos, mainDesc, subDesc }
 */
export const createNews = async (payload) => {
  return await addDoc(collection(db, COLLECTION_NAME), {
    ...payload,
    createdAt: serverTimestamp(),
  });
};

/**
 * تعديل خبر حالي (createdAt ما بيتغيّر عشان ترتيبه يبقى ثابت)
 */
export const updateNews = async (id, payload) => {
  return await updateDoc(doc(db, COLLECTION_NAME, id), payload);
};

/**
 * حذف خبر
 */
export const deleteNews = async (id) => {
  return await deleteDoc(doc(db, COLLECTION_NAME, id));
};

/**
 * الاستماع الحي للأخبار (الأحدث أولاً)
 * @param {Function} onDataChanged
 */
export const subscribeToNews = (onDataChanged) => {
  const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));

  return onSnapshot(q, (snap) => {
    onDataChanged(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
};
