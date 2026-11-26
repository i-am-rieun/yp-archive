(() => {
  "use strict";

  const client = window.supabaseClient;
  const PAGE_SIZE = 20;
  const state = {
    allNews: [],
    filteredNews: [],
    visibleCount: PAGE_SIZE,
    query: "",
    programSlug: "all"
  };

  const $ = (selector) => document.querySelector(selector);
  const list = $("#newsList");
  const count = $("#newsTotalCount");
  const summary = $("#newsResultSummary");
  const searchInput = $("#newsSearchInput");
  const programFilter = $("#newsProgramFilter");
  const moreWrap = $("#newsMoreWrap");
  const moreButton = $("#newsLoadMore");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  const normalize = (value) => String(value ?? "")
    .normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, "");

  const unwrap = (value) => Array.isArray(value) ? (value[0] || null) : (value || null);

  function dateValue(row) {
    return row.published_at || row.updated_at || row.created_at || "";
  }

  function dateTimestamp(value) {
    if (!value) return 0;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function formatDate(value) {
    if (!value) return "날짜 미정";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "날짜 미정";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date);
  }

  async function fetchAll(table, columns, filters = []) {
    const pageSize = 1000;
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      let query = client.from(table).select(columns).order("id", { ascending: true });
      for (const filter of filters) query = query.eq(filter.column, filter.value);
      const { data, error } = await query.range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  }

  function buildNewsRows(newsRows, seasons, castMembers, programs) {
    const programById = new Map(programs.map((program) => [String(program.id), program]));
    const seasonById = new Map();

    seasons.forEach((season) => {
      const program = programById.get(String(season.program_id));
      if (!program) return;
      seasonById.set(String(season.id), { ...season, program });
    });

    const castById = new Map();
    castMembers.forEach((cast) => {
      const season = seasonById.get(String(cast.season_id));
      if (season) castById.set(String(cast.id), { ...cast, season });
    });

    const byUrl = new Map();
    for (const row of newsRows) {
      const directSeason = row.season_id ? seasonById.get(String(row.season_id)) : null;
      const linkedCast = row.cast_member_id ? castById.get(String(row.cast_member_id)) : null;
      const season = directSeason || linkedCast?.season || null;
      if (!season) continue;

      // 두 연결 정보가 모두 있는 경우, 출연자와 시즌이 일치할 때만 출연자명을 표시합니다.
      const cast = linkedCast && String(linkedCast.season_id) === String(season.id) ? linkedCast : null;
      const normalizedUrl = String(row.url || "").trim();
      if (!normalizedUrl) continue;

      const item = {
        id: row.id,
        url: normalizedUrl,
        title: String(row.title || "").trim() || "제목 미등록 뉴스",
        publisher: String(row.publisher || "").trim(),
        published_at: row.published_at || null,
        updated_at: row.updated_at || null,
        created_at: row.created_at || null,
        sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        program_id: season.program.id,
        program_slug: season.program.slug,
        program_name: season.program.name,
        season_label: season.display_name || (season.season_number ? `${season.season_number}기` : ""),
        cast_name: cast?.name || ""
      };

      const previous = byUrl.get(normalizedUrl);
      if (!previous || (item.cast_name && !previous.cast_name)) {
        byUrl.set(normalizedUrl, item);
      }
    }

    return [...byUrl.values()].sort((a, b) => {
      const dateDiff = dateTimestamp(dateValue(b)) - dateTimestamp(dateValue(a));
      if (dateDiff) return dateDiff;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return Number(a.id) - Number(b.id);
    });
  }

  function populatePrograms(programs) {
    const sorted = [...programs].sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
    programFilter.innerHTML = '<option value="all">전체 프로그램</option>' +
      sorted.map((program) =>
        `<option value="${escapeHtml(program.slug)}">${escapeHtml(program.name)}</option>`
      ).join("");
  }

  function render() {
    const query = normalize(state.query);
    const filtered = state.allNews.filter((item) => {
      const matchesProgram = state.programSlug === "all" || item.program_slug === state.programSlug;
      const searchable = normalize([
        item.title, item.publisher, item.cast_name, item.program_name, item.season_label
      ].join(" "));
      return matchesProgram && (!query || searchable.includes(query));
    });

    state.filteredNews = filtered;
    const visible = filtered.slice(0, state.visibleCount);
    count.textContent = `${filtered.length.toLocaleString("ko-KR")} ARTICLES`;
    summary.textContent = filtered.length
      ? `전체 ${filtered.length.toLocaleString("ko-KR")}건 중 ${visible.length.toLocaleString("ko-KR")}건 표시`
      : "검색 조건에 맞는 뉴스가 없습니다.";

    if (!visible.length) {
      list.innerHTML = '<p class="news-state">조건에 맞는 출연자 뉴스가 없습니다.</p>';
    } else {
      list.innerHTML = visible.map((item, index) => {
        const date = dateValue(item);
        const details = [
          item.program_name,
          item.season_label,
          item.cast_name
        ].filter(Boolean).join(" · ");
        const meta = [details, item.publisher].filter(Boolean).join("  |  ");
        return `
          <a class="news-row" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <span class="news-number">${String(index + 1).padStart(2, "0")}</span>
            <span class="news-main">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(meta || "출연자 관련 소식")}</small>
            </span>
            <time datetime="${escapeHtml(date)}">${escapeHtml(formatDate(date))}</time>
            <span class="news-arrow" aria-hidden="true">↗</span>
          </a>`;
      }).join("");
    }

    moreWrap.hidden = visible.length >= filtered.length;
    list.setAttribute("aria-busy", "false");
  }

  async function loadNews() {
    if (!client || typeof client.from !== "function") {
      list.innerHTML = '<p class="news-state">Supabase 연결 설정을 확인해 주세요.</p>';
      count.textContent = "연결 오류";
      list.setAttribute("aria-busy", "false");
      return;
    }

    try {
      const [programs, seasons, castMembers, newsRows] = await Promise.all([
        fetchAll("programs", "id,slug,name", [{ column: "is_published", value: true }]),
        fetchAll("seasons", "id,season_number,display_name,program_id", [{ column: "is_published", value: true }]),
        fetchAll("cast_members", "id,name,season_id", [{ column: "is_published", value: true }]),
        fetchAll("cast_news_links", "id,url,title,publisher,published_at,sort_order,is_published,created_at,updated_at,cast_member_id,season_id", [{ column: "is_published", value: true }])
      ]);

      populatePrograms(programs);
      state.allNews = buildNewsRows(newsRows, seasons, castMembers, programs);
      state.visibleCount = PAGE_SIZE;
      render();
    } catch (error) {
      console.error("[출연자 뉴스] Supabase 조회 실패:", error);
      list.innerHTML = '<p class="news-state">뉴스를 불러오지 못했습니다. 공개 데이터 정책과 연결 설정을 확인해 주세요.</p>';
      count.textContent = "조회 실패";
      summary.textContent = "뉴스 데이터를 불러오는 중 오류가 발생했습니다.";
      list.setAttribute("aria-busy", "false");
    }
  }

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    state.visibleCount = PAGE_SIZE;
    render();
  });

  programFilter.addEventListener("change", () => {
    state.programSlug = programFilter.value;
    state.visibleCount = PAGE_SIZE;
    render();
  });

  $("#newsFilterReset").addEventListener("click", () => {
    searchInput.value = "";
    programFilter.value = "all";
    state.query = "";
    state.programSlug = "all";
    state.visibleCount = PAGE_SIZE;
    render();
  });

  moreButton.addEventListener("click", () => {
    state.visibleCount += PAGE_SIZE;
    render();
  });


  loadNews();
})();
