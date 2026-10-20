// ====== أدوات يوتيوب (مشتركة) ======
// يقبل: watch?v= / youtu.be / shorts / embed / live / أو الـ ID نفسه (11 حرف)
export function parseYouTubeId(input) {
  const s = (input || "").trim();
  const isId = (x) => /^[\w-]{11}$/.test(x || "");
  if (isId(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^(www|m)\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return isId(id) ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return isId(id) ? id : null;
      }
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* مش رابط */
  }
  return null;
}
