/* 연프도감 프로그램 아카이브 공통 레이아웃 동작 */
(() => {
  "use strict";

  const body = document.body;
  if (!body) return;
  const programs = window.ARCHIVE_PROGRAMS || {};
  const program = programs[body.dataset.program];

  // 모든 아카이브 페이지의 공통 글꼴 크기 조정
  const fontRoot = document.documentElement;
  const fontStorageKey = "solo-font-scale";
  const defaultFontScale = 1;
  const minFontScale = 0.7;
  const maxFontScale = 1.5;
  const legacyFontKey = body.dataset.program === "mo" ? "mo-font-scale"
    : body.dataset.program === "dol" ? "dol-font-scale" : null;
  const clampFontScale = value => Math.max(minFontScale, Math.min(maxFontScale, value));
  const readFontScale = () => {
    try {
      const saved = Number.parseFloat(localStorage.getItem(fontStorageKey));
      if (Number.isFinite(saved)) return clampFontScale(saved);
      if (legacyFontKey) {
        const legacy = Number.parseFloat(localStorage.getItem(legacyFontKey));
        if (Number.isFinite(legacy)) {
          const migrated = clampFontScale(legacy);
          localStorage.setItem(fontStorageKey, String(migrated));
          return migrated;
        }
      }
    } catch (_) { /* 저장소를 사용할 수 없으면 기본 크기를 적용합니다. */ }
    return defaultFontScale;
  };
  const applyFontScale = value => {
    const scale = clampFontScale(value);
    fontRoot.style.setProperty("--font-base", `${scale * 16}px`);
    fontRoot.style.setProperty("--font-scale", String(scale));
    try { localStorage.setItem(fontStorageKey, String(scale)); } catch (_) {}
  };

  applyFontScale(readFontScale());
  document.getElementById("fontDecrease")?.addEventListener("click", () => applyFontScale(readFontScale() - 0.1));
  document.getElementById("fontReset")?.addEventListener("click", () => applyFontScale(defaultFontScale));
  document.getElementById("fontIncrease")?.addEventListener("click", () => applyFontScale(readFontScale() + 0.1));

  if (!program) return;

  const pageName = window.location.pathname.split("/").pop() || "";
  const activeNav = pageName === program.couples ? "couples" : "cast";

  // 공통 헤더: 프로그램 설정에 따라 현재 프로그램명과 메뉴 목적지를 적용합니다.
  const nav = document.querySelector(".archive-header .site-nav");
  if (nav) {
    nav.setAttribute("aria-label", `${program.name} 아카이브 메뉴`);
    const links = {
      cast: nav.querySelector('[data-nav="cast"]'),
      couples: nav.querySelector('[data-nav="couples"]')
    };
    if (links.cast) {
      links.cast.href = program.index;
      links.cast.textContent = "출연자";
      if (activeNav === "cast") links.cast.setAttribute("aria-current", "page");
      else links.cast.removeAttribute("aria-current");
    }
    if (links.couples) {
      links.couples.href = program.couples;
      links.couples.textContent = "커플";
      if (activeNav === "couples") links.couples.setAttribute("aria-current", "page");
      else links.couples.removeAttribute("aria-current");
    }
  }

  // 공통 경로 표시와 푸터 문구를 설정값으로 통일합니다.
  const breadcrumb = document.querySelector(".archive-breadcrumb");
  if (breadcrumb) {
    breadcrumb.setAttribute("aria-label", "현재 위치");
    const homeLink = document.createElement("a");
    homeLink.href = "../index.html";
    homeLink.textContent = "연프도감";

    const separator = document.createElement("span");
    separator.setAttribute("aria-hidden", "true");
    separator.textContent = ">";

    const archiveLink = document.createElement("a");
    archiveLink.href = program.index;
    archiveLink.textContent = program.archiveTitle;
    archiveLink.setAttribute("aria-current", "page");

    breadcrumb.replaceChildren(homeLink, separator, archiveLink);
  }
  const footerLabel = document.querySelector(".footer-with-top > span");
  if (footerLabel) footerLabel.textContent = `연프도감 · ${program.name} 아카이브`;

})();
