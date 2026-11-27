/* 연프도감 방문 기록: 페이지 진입 시 1회 기록합니다. */
(() => {
  "use strict";

  const db = window.supabaseClient;
  if (!db || typeof db.from !== "function") {
    console.warn("[방문 기록] Supabase 클라이언트를 사용할 수 없습니다.");
    return;
  }

  const VISITOR_KEY = "yp_archive_visitor_id";

  function createVisitorId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    }
    return `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function getVisitorId() {
    try {
      let visitorId = window.localStorage.getItem(VISITOR_KEY);
      if (!visitorId) {
        visitorId = createVisitorId();
        window.localStorage.setItem(VISITOR_KEY, visitorId);
      }
      return visitorId;
    } catch (error) {
      // 저장소 접근이 차단된 브라우저에서는 현재 페이지 수명 동안만 식별합니다.
      if (!window.__ypArchiveVisitorId) {
        window.__ypArchiveVisitorId = createVisitorId();
      }
      return window.__ypArchiveVisitorId;
    }
  }

  async function recordVisit() {
    const pagePath = (window.location.pathname || "/").slice(0, 255);
    const { error } = await db.from("site_visit_logs").insert({
      visitor_id: getVisitorId(),
      page_path: pagePath
    });

    if (error) {
      console.warn("[방문 기록] 저장 실패:", error.message);
    }
  }

  recordVisit().catch((error) => {
    console.warn("[방문 기록] 처리 중 오류:", error);
  });
})();
