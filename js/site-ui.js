/* 연프도감 공통 UI: 글꼴 크기 조절 및 맨 위로 이동 */
(() => {
  "use strict";

  const root = document.documentElement;
  const storageKey = "solo-font-scale";
  const defaultScale = 1;
  const minScale = 0.7;
  const maxScale = 1.5;
  const programKey = document.body?.dataset.program;
  const legacyKey = programKey === "mo" ? "mo-font-scale"
    : programKey === "dol" ? "dol-font-scale" : null;

  const clamp = value => Math.max(minScale, Math.min(maxScale, value));
  const readScale = () => {
    try {
      const current = Number.parseFloat(localStorage.getItem(storageKey));
      if (Number.isFinite(current)) return clamp(current);
      if (legacyKey) {
        const legacy = Number.parseFloat(localStorage.getItem(legacyKey));
        if (Number.isFinite(legacy)) {
          const migrated = clamp(legacy);
          localStorage.setItem(storageKey, String(migrated));
          return migrated;
        }
      }
    } catch (_) { /* 저장소 접근이 불가능하면 기본값을 사용합니다. */ }
    return defaultScale;
  };
  const applyScale = value => {
    const scale = clamp(value);
    root.style.setProperty("--font-base", `${scale * 16}px`);
    root.style.setProperty("--font-scale", String(scale));
    try { localStorage.setItem(storageKey, String(scale)); } catch (_) {}
  };

  applyScale(readScale());
  document.getElementById("fontDecrease")?.addEventListener("click", () => applyScale(readScale() - 0.1));
  document.getElementById("fontReset")?.addEventListener("click", () => applyScale(defaultScale));
  document.getElementById("fontIncrease")?.addEventListener("click", () => applyScale(readScale() + 0.1));

  document.addEventListener("click", event => {
    const topLink = event.target.closest('.footer-top[href="#top"]');
    if (!topLink) return;
    event.preventDefault();
    document.getElementById("top")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // 관리자에서 공개로 지정한 site.title / site.description을 메인 페이지에 반영합니다.
  async function applyPublicSiteSettings() {
    if (document.body?.dataset.siteSettings !== "enabled") return;
    const db = window.supabaseClient;
    if (!db?.from) return;
    try {
      const { data, error } = await db.from("site_settings")
        .select("key,value")
        .eq("is_public", true)
        .in("key", ["site.title", "site.description"]);
      if (error) throw error;
      const settings = new Map((data || []).map(item => [item.key, item.value]));
      const title = settings.get("site.title");
      const description = settings.get("site.description");
      if (typeof title === "string" && title.trim()) {
        document.title = title.trim();
        document.querySelector('meta[property="og:title"]')?.setAttribute("content", title.trim());
        document.querySelector(".home-header .archive-brand")?.setAttribute("aria-label", title.trim());
      }
      if (typeof description === "string" && description.trim()) {
        document.querySelector('meta[name="description"]')?.setAttribute("content", description.trim());
        document.querySelector('meta[property="og:description"]')?.setAttribute("content", description.trim());
      }
    } catch (error) {
      console.warn("[연프도감] 공개 사이트 설정을 불러오지 못했습니다.", error);
    }
  }
  applyPublicSiteSettings();
})();
