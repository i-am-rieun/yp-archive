(() => {
  "use strict";

  const client = window.supabaseClient;
  const PROGRAM_SLUG = "n";
  const getProgramId = async () => {
    if (!window.__nProgramIdPromise) {
      window.__nProgramIdPromise = client
        .from("programs")
        .select("id")
        .eq("slug", "n")
        .eq("is_published", true)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error;
          if (!data?.id) throw new Error("programs 테이블에 slug='n' 항목이 없습니다.");
          return data.id;
        });
    }
    return window.__nProgramIdPromise;
  };
  const params = new URLSearchParams(window.location.search);
  const seasonId = params.get("id") || params.get("season_id");
  const $ = (selector) => document.querySelector(selector);
  const PAGE_SIZE = 10;
  const STORAGE_BASE = "https://iegvfrhcyzbuaszsqkin.supabase.co/storage/v1/object/public/cast-profiles";
  // Storage 버킷(cast-profiles)에 실제 업로드된 파일명과 일치시킵니다.
  const PROFILE_IMAGE_FILES = {
    female: {
      "현숙": "fe_hyunsook.png", "정희": "fe_junghee.png", "정자": "fe_jungja.png",
      "정숙": "fe_jungsook.png", "옥순": "fe_oksoon.png", "순자": "fe_soonja.png",
      "영자": "fe_youngja.png", "영숙": "fe_youngsook.png", "영순": "fe_youngsoon.png",
      "정순": "fe_jungsoon.png"
    },
    male: {
      "종수": "ma_jongsoo.png", "정식": "ma_jungsik.png", "정수": "ma_jungsoo.png",
      "광수": "ma_kwangsoo.png", "경수": "ma_kyungsoo.png", "상철": "ma_sangchul.png",
      "영철": "ma_youngchul.png", "영호": "ma_youngho.png", "영식": "ma_youngsik.png",
      "영수": "ma_youngsoo.png"
    }
  };
  function getMappedImageUrl(name, gender) {
    const normalizedGender = gender === "여성" ? "female" : gender === "남성" ? "male" : gender;
    const fileName = PROFILE_IMAGE_FILES[normalizedGender]?.[String(name || "").trim()];
    return fileName ? `${STORAGE_BASE}/${fileName}` : "";
  }
  function normalizeImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    const path = raw.replace(/^\/+/, "").replace(/^cast-profiles\//i, "");
    return `${STORAGE_BASE}/${path}`;
  }
  let allNews = [];
  let currentPage = 1;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  async function renderSeasonNavigation(currentSeason) {
    const main = document.querySelector(".season-main");
    if (!main || !currentSeason?.id) return;

    // 기수 번호가 아닌 DB의 실제 season.id를 링크에 사용합니다.
    const { data: seasons, error } = await client
      .from("seasons")
      .select("id, season_number, special_label")
      .eq("program_id", await getProgramId())
      .eq("is_published", true)
      .order("season_number", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      console.error("기수 이동 목록 조회 오류:", error);
      return;
    }

    const list = seasons || [];
    const currentIndex = list.findIndex((item) => String(item.id) === String(currentSeason.id));
    if (currentIndex < 0) return;

    let nav = document.querySelector("#seasonNavigation");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "seasonNavigation";
      nav.className = "season-navigation";
      nav.setAttribute("aria-label", "기수 이동");
      const breadcrumbs = document.querySelector("#detailBreadcrumbs");
      if (breadcrumbs?.parentNode) breadcrumbs.insertAdjacentElement("afterend", nav);
      else main.insertBefore(nav, main.firstChild);
    }

    const previous = list[currentIndex - 1];
    const next = list[currentIndex + 1];
    const link = (season, label, className) => season
      ? `<a class="season-navigation-link ${className}" href="n_seasons.html?id=${encodeURIComponent(season.id)}"><span aria-hidden="true">${className === "is-prev" ? "←" : "→"}</span> ${label}</a>`
      : `<span class="season-navigation-link is-disabled ${className}" aria-disabled="true"><span aria-hidden="true">${className === "is-prev" ? "←" : "→"}</span> ${label}</span>`;

    nav.innerHTML = `${link(previous, previous ? `${escapeHtml(previous.season_number)}기` : "이전 기수", "is-prev")}<span class="season-navigation-current">${escapeHtml(currentSeason.season_number)}기</span>${link(next, next ? `${escapeHtml(next.season_number)}기` : "다음 기수", "is-next")}`;
  }

  function renderDetailBreadcrumbs(items) {
    const container = document.querySelector(".season-main");
    if (!container) return;
    let nav = document.querySelector("#detailBreadcrumbs");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "detailBreadcrumbs";
      nav.className = "detail-breadcrumbs";
      nav.setAttribute("aria-label", "현재 위치");
      container.insertBefore(nav, container.firstChild);
    }
    nav.innerHTML = `<div class="detail-breadcrumb-trail">${items.map((item, index) => {
      const content = item.href
        ? `<a href="${escapeHtml(item.href)}"${index === items.length - 1 ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`
        : `<span${index === items.length - 1 ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</span>`;
      return `${index ? '<span class="detail-breadcrumb-separator" aria-hidden="true">›</span>' : ""}${content}`;
    }).join("")}</div>`;
  }

  const showError = (message) => {
    const el = $("#seasonLoading");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
  };

  const formatDate = (value) => {
    if (!value) return "";
    return String(value).slice(0, 10);
  };

  const formatPeriod = (season) => {
    const start = formatDate(season.broadcast_start_date);
    const end = formatDate(season.broadcast_end_date);
    if (start && end) return `${start} ~ ${end}`;
    return start || end || "등록된 방영기간이 없습니다.";
  };

  function renderReplayLinks(url, platformName) {
    const container = $("#seasonReplayLinks");
    if (!container) return;
    const replayUrl = String(url || "").trim();
    if (!replayUrl) {
      container.innerHTML = '<p class="season-empty">등록된 다시보기 링크가 없습니다.</p>';
      return;
    }
    const label = String(platformName || "").trim() || "방송 다시보기";
    container.innerHTML = `<a class="season-replay-link" href="${escapeHtml(replayUrl)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(label)}</span><span>바로 보기 ↗</span></a>`;
  }

  function formatNewsDate(value) {
    if (!value) return "";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : String(value);
  }

  function renderNews() {
    const container = $("#seasonNews");
    const pagination = $("#newsPagination");
    const count = $("#newsCount");
    if (!container || !pagination) return;

    if (!allNews.length) {
      container.innerHTML = '<p class="season-empty">등록된 관련 뉴스가 없습니다.</p>';
      pagination.innerHTML = "";
      if (count) count.textContent = "총 0건";
      return;
    }

    const pageCount = Math.ceil(allNews.length / PAGE_SIZE);
    currentPage = Math.min(Math.max(currentPage, 1), pageCount);
    const start = (currentPage - 1) * PAGE_SIZE;
    const items = allNews.slice(start, start + PAGE_SIZE);

    container.innerHTML = items.map((news) => {
      const publisher = String(news.publisher || "").trim();
      const date = formatNewsDate(news.published_at);
      return `<article class="news-item"><a class="news-row-link" href="${escapeHtml(news.url || "#")}" target="_blank" rel="noopener noreferrer"><span class="news-title">${escapeHtml(news.title || "제목 없음")}</span><span class="news-publisher">${escapeHtml(publisher)}</span><time class="news-date">${escapeHtml(date)}</time><span class="news-open" aria-hidden="true">↗</span></a></article>`;
    }).join("");

    if (count) count.textContent = `총 ${allNews.length}건`;
    if (pageCount <= 1) {
      pagination.innerHTML = "";
      return;
    }

    const pageButtons = Array.from({ length: pageCount }, (_, index) => {
      const page = index + 1;
      return `<button type="button" class="news-page${page === currentPage ? " is-active" : ""}" data-page="${page}" aria-current="${page === currentPage ? "page" : "false"}">${page}</button>`;
    }).join("");
    pagination.innerHTML = `<button type="button" class="news-page news-page-arrow" data-page="${currentPage - 1}" aria-label="이전 페이지" ${currentPage === 1 ? "disabled" : ""}>‹</button>${pageButtons}<button type="button" class="news-page news-page-arrow" data-page="${currentPage + 1}" aria-label="다음 페이지" ${currentPage === pageCount ? "disabled" : ""}>›</button>`;
  }

  async function loadSeason() {
    if (!client || typeof client.from !== "function") {
      console.error("Supabase client가 생성되지 않았습니다.", {
        supabaseSdkLoaded: !!window.supabase,
        supabaseClientExists: !!window.supabaseClient
      });
      showError("Supabase 연결에 실패했습니다. 설정 파일 또는 Supabase SDK 로딩 상태를 확인하세요.");
      return;
    }
    if (!seasonId) {
      showError("기수 정보가 지정되지 않았습니다.");
      return;
    }

    try {
      const { data: season, error } = await client
        .from("seasons")
        .select("id, program_id, season_number, special_label, location, broadcast_start_date, broadcast_end_date, replay_url, replay_name, is_published")
        .eq("id", seasonId)
        .eq("program_id", await getProgramId())
        .eq("is_published", true)
        .maybeSingle();

      if (error) {
        console.error(error);
        showError(`기수 정보를 불러오지 못했습니다. ${error.message}`);
        return;
      }
      if (!season) {
        showError("돌싱앤모솔의 공개된 기수 정보를 찾을 수 없습니다.");
        return;
      }

      $("#seasonLoading")?.classList.add("hidden");
      $("#seasonCard")?.classList.remove("hidden");
      document.title = `${season.season_number}기 — 돌싱앤모솔 아카이브`;
      $("#seasonTitle").textContent = `${season.season_number}기`;
      const breadcrumbCurrent = $("#breadcrumbCurrent");
      if (breadcrumbCurrent) breadcrumbCurrent.textContent = `${season.season_number}기`;
      renderDetailBreadcrumbs([
        { label: "출연자", href: "n_index.html" },
        { label: `${season.season_number}기`, href: `n_seasons.html?id=${encodeURIComponent(season.id)}` }
      ]);
      await renderSeasonNavigation(season);
      $("#seasonSpecial").textContent = season.special_label || "";
      $("#seasonSpecial").classList.toggle("hidden", !season.special_label);
      $("#seasonPeriod").textContent = formatPeriod(season);
      $("#seasonLocation").textContent = season.location || "등록된 촬영장소가 없습니다.";

      await loadSeasonCast(season.id);

      renderReplayLinks(season.replay_url, season.replay_name);

      await loadSeasonNews(season.id);
    } catch (err) {
      console.error("기수 정보 로딩 중 예외 발생:", err);
      const detail = err && err.message ? err.message : String(err);
      showError(`Supabase 요청에 실패했습니다. 네트워크 또는 브라우저 연결을 확인하세요. (${detail})`);
    }
  }

  async function loadSeasonCast(id) {
    const container = $("#seasonCastList");
    if (!container) return;
    container.innerHTML = '<p class="season-empty">출연자 정보를 불러오는 중입니다.</p>';

    const { data, error } = await client
      .rpc("get_program_cast_members", { p_program_slug: PROGRAM_SLUG })
      .select("id, name, gender, profile_image_url, is_published")
      .eq("season_id", id)
      .eq("is_published", true)
      .order("gender", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      console.error("기수 출연자 조회 오류:", error);
      container.innerHTML = `<p class="season-empty">출연자 목록을 불러오지 못했습니다. ${escapeHtml(error.message)}</p>`;
      return;
    }

    if (!data?.length) {
      container.innerHTML = '<p class="season-empty">등록된 출연자가 없습니다.</p>';
      return;
    }

    container.innerHTML = data.map((cast) => {
      const imageCandidates = [...new Set([normalizeImageUrl(cast.profile_image_url), getMappedImageUrl(cast.name, cast.gender)].filter(Boolean))];
      const imageUrl = imageCandidates[0] || "";
      const fallbackUrls = escapeHtml(JSON.stringify(imageCandidates.slice(1)));
      const image = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" data-fallback-urls="${fallbackUrls}" data-fallback-index="0" alt="${escapeHtml(cast.name)} 프로필 사진" loading="lazy" onerror="const urls=JSON.parse(this.dataset.fallbackUrls||'[]');const i=Number(this.dataset.fallbackIndex||0);if(i<urls.length){this.dataset.fallbackIndex=String(i+1);this.src=urls[i]}else{this.remove();this.parentElement.classList.add('no-image')}" >`
        : "";
      const initial = escapeHtml(String(cast.name || "?").slice(0, 1));
      const gender = cast.gender === "male" || cast.gender === "남성" ? "male" : cast.gender === "female" || cast.gender === "여성" ? "female" : "";
      const genderLabel = gender === "male" ? "남자" : gender === "female" ? "여자" : "출연자";
      const genderClass = gender ? ` gender-${gender}` : "";
      return `<a class="season-cast-card" href="n_profile.html?id=${encodeURIComponent(cast.id)}"><span class="season-cast-photo${genderClass}${image ? "" : " no-image"}">${image || initial}</span><span class="season-cast-name">${escapeHtml(cast.name || "이름 미입력")}</span><span class="season-cast-gender">${genderLabel}</span></a>`;
    }).join("");
  }

  async function loadSeasonNews(id) {
    const container = $("#seasonNews");
    if (container) container.innerHTML = '<p class="season-empty">관련 뉴스를 불러오는 중입니다.</p>';

    const { data: castMembers, error: castError } = await client
      .rpc("get_program_cast_members", { p_program_slug: PROGRAM_SLUG })
      .select("id, name")
      .eq("season_id", id)
      .eq("is_published", true);

    if (castError) {
      console.error("관련 뉴스 출연자 조회 오류:", castError);
      if (container) container.innerHTML = `<p class="season-empty">출연자 정보를 불러오지 못했습니다. ${escapeHtml(castError.message)}</p>`;
      return;
    }

    const castIds = (castMembers || []).map((cast) => cast.id);
    const castNames = new Map((castMembers || []).map((cast) => [String(cast.id), cast.name || ""]));

    const { data: seasonNews, error: seasonNewsError } = await client
      .from("cast_news_links")
      .select("id, season_id, cast_member_id, url, title, publisher, published_at, sort_order, is_published")
      .eq("season_id", id)
      .eq("is_published", true);

    if (seasonNewsError) {
      console.error("기수 연결 뉴스 조회 오류:", seasonNewsError);
      if (container) container.innerHTML = `<p class="season-empty">기수 관련 뉴스를 불러오지 못했습니다. ${escapeHtml(seasonNewsError.message)}</p>`;
      return;
    }

    let castNews = [];
    if (castIds.length) {
      const { data, error } = await client
        .from("cast_news_links")
        .select("id, season_id, cast_member_id, url, title, publisher, published_at, sort_order, is_published")
        .in("cast_member_id", castIds)
        .eq("is_published", true);

      if (error) {
        console.error("출연자 연결 뉴스 조회 오류:", error);
        if (container) container.innerHTML = `<p class="season-empty">출연자 관련 뉴스를 불러오지 못했습니다. ${escapeHtml(error.message)}</p>`;
        return;
      }
      castNews = data || [];
    }

    const uniqueNews = new Map();
    [...(seasonNews || []), ...castNews].forEach((item) => {
      const key = item.url ? `url:${item.url}` : `id:${item.id}`;
      if (!uniqueNews.has(key)) uniqueNews.set(key, item);
    });

    allNews = [...uniqueNews.values()]
      .sort((a, b) => {
        const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
        const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        const orderA = Number(a.sort_order ?? 0);
        const orderB = Number(b.sort_order ?? 0);
        if (orderA !== orderB) return orderA - orderB;
        return Number(a.id) - Number(b.id);
      })
      .map((item) => ({
        ...item,
        castName: castNames.get(String(item.cast_member_id)) || ""
      }));

    currentPage = 1;
    renderNews();
  }

  $("#newsPagination")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (!button || button.disabled) return;
    const page = Number(button.dataset.page);
    const pageCount = Math.ceil(allNews.length / PAGE_SIZE);
    if (page < 1 || page > pageCount) return;
    currentPage = page;
    renderNews();
    $("#seasonNews")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  loadSeason();
})();
