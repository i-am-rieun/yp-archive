/* 루트 전용 통합 검색: 자동완성, 검색 결과, 최근·인기 검색어 */
(() => {
  "use strict";

  const client = window.supabaseClient;
  const form = document.getElementById("catalogSearchForm");
  const input = document.getElementById("catalogSearchInput");
  const box = document.getElementById("catalogSearchResults");
  const rankingBox = document.getElementById("catalogSearchRankings");
  const programs = window.ARCHIVE_PROGRAMS || {};
  if (!form || !input || !box || !rankingBox) return;

  let suggestionRequest = 0;
  let debounceTimer = null;
  let rankingsLoaded = false;
  let recentTerms = [];
  let popularTerms = [];

  const normalize = value => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const hideResults = () => { box.hidden = true; box.innerHTML = ""; };
  const hideRankings = () => { rankingBox.hidden = true; };
  const programConfigById = new Map();

  async function loadProgramConfigs(ids) {
    const uniqueIds = [...new Set(ids.map(value => String(value ?? "")).filter(Boolean))];
    const missing = uniqueIds.filter(id => !programConfigById.has(id));
    if (!missing.length) return;
    if (!client || typeof client.from !== "function") return;
    const { data, error } = await client.from("programs").select("id,slug,is_published").in("id", missing).eq("is_published", true);
    if (error) {
      console.error("[검색 경로] 프로그램 설정 조회 실패:", error);
      return;
    }
    (data || []).forEach(row => {
      const config = Object.values(programs).find(item => item.slug === row.slug);
      if (config) programConfigById.set(String(row.id), config);
    });
  }

  function renderRankings() {
    const group = (title, items) => `<section class="search-result-group"><h3>${title}</h3>${items.length ? items.map((item, index) => `<button type="button" class="search-result-item search-term-button" data-search-action="history" data-term="${escapeHtml(item.search_term)}"><span class="search-rank">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(item.search_term)}</strong></span></button>`).join("") : '<p class="section-empty">검색 기록이 없습니다.</p>'}</section>`;
    rankingBox.innerHTML = `<div class="search-result-heading"><h2>검색어</h2></div><div class="search-ranking-grid">${group("최근 검색어", recentTerms)}${group("인기 검색어", popularTerms)}</div>`;
    rankingBox.hidden = false;
  }

  async function loadRankings() {
    if (!client || typeof client.rpc !== "function") return;
    const { data, error } = await client.rpc("get_catalog_search_rankings");
    if (error) {
      console.error("[검색 순위] 조회 실패:", error);
      recentTerms = [];
      popularTerms = [];
    } else {
      const rows = data || [];
      recentTerms = rows.filter(row => row.ranking_type === "최근").slice(0, 5);
      popularTerms = rows.filter(row => row.ranking_type === "인기").slice(0, 5);
    }
    rankingsLoaded = true;
  }

  async function showSuggestions(query) {
    const token = ++suggestionRequest;
    const value = String(query || "").trim();
    if (!value) { hideResults(); return; }
    hideRankings();
    if (!client || typeof client.rpc !== "function") {
      box.innerHTML = '<p class="section-empty">검색 서버에 연결할 수 없습니다.</p>';
      box.hidden = false;
      return;
    }
    const { data, error } = await client.rpc("get_catalog_search_suggestions", { p_query: value });
    if (token !== suggestionRequest) return;
    if (error) {
      console.error("[검색 제안] 조회 실패:", error);
      box.innerHTML = '<p class="section-empty">검색 제안을 불러오지 못했습니다.</p>';
      box.hidden = false;
      return;
    }
    const rows = data || [];
    if (!rows.length) {
      box.innerHTML = '<p class="section-empty">등록된 출연자 이름, 프로그램명 또는 직업과 일치하는 제안이 없습니다.</p>';
      box.hidden = false;
      return;
    }
    const groups = ["출연자", "프로그램", "직업"].map(type => {
      const list = rows.filter(row => row.result_type === type);
      if (!list.length) return "";
      return `<section class="search-result-group"><h3>${type}</h3>${list.map(row => `<button type="button" class="search-result-item search-suggestion-button" data-search-action="select" data-term="${escapeHtml(row.search_term)}" data-type="${escapeHtml(row.result_type)}" data-target="${escapeHtml(row.target_id ?? "")}" data-program="${escapeHtml(row.program_id ?? "")}" data-context="${escapeHtml(row.context_label || "")}"><span><strong>${escapeHtml(row.search_term)}</strong><small>${escapeHtml(row.context_label || type)}</small></span><b>선택</b></button>`).join("")}</section>`;
    }).join("");
    box.innerHTML = `<div class="search-result-heading"><h2>검색 제안</h2><small>목록에서 항목을 선택해야 검색됩니다.</small></div>${groups}`;
    box.hidden = false;
  }

  async function resolveOccupationResults(term) {
    const { data, error } = await client.rpc("search_published_cast_members_by_occupation", { p_occupation: term });
    if (error) {
      console.error("[직업 검색] 조회 실패:", error);
      return [];
    }
    const castRows = data || [];
    const seasonIds = [...new Set(castRows.map(row => row.season_id).filter(value => value != null))];
    if (!seasonIds.length) return [];

    const { data: seasons, error: seasonError } = await client.from("seasons")
      .select("id,program_id,season_number,display_name,is_published")
      .in("id", seasonIds)
      .eq("is_published", true);
    if (seasonError) {
      console.error("[직업 검색] 시즌 정보 조회 실패:", seasonError);
      return [];
    }
    const seasonById = new Map((seasons || []).map(row => [String(row.id), row]));
    await loadProgramConfigs((seasons || []).map(row => row.program_id));

    return castRows.map(cast => {
      const season = seasonById.get(String(cast.season_id));
      const config = season ? programConfigById.get(String(season.program_id)) : null;
      if (!season || !config) return null;
      return {
        result_type: "출연자",
        target_id: cast.id,
        program_id: season.program_id,
        search_term: cast.name,
        context_label: [config.name, season.display_name || (season.season_number ? `${season.season_number}기` : null), cast.occupation_original].filter(Boolean).join(" · ")
      };
    }).filter(Boolean);
  }

  async function executeAllowedSearch(term, type, targetId, programId) {
    const selected = String(term || "").trim();
    if (!selected || !client) return;
    input.value = selected;
    hideRankings();
    const { error: recordError } = await client.rpc("record_search_term", { p_search_term: selected });
    if (recordError) console.error("[검색 통계] 기록 실패:", recordError);

    let rows = [];
    if (type === "직업") {
      rows = await resolveOccupationResults(selected);
    } else {
      const { data, error } = await client.rpc("get_catalog_search_suggestions", { p_query: selected });
      if (error) console.error("[검색 결과] 조회 실패:", error);
      else rows = (data || []).filter(row => normalize(row.search_term) === normalize(selected) && row.result_type === type);
    }

    const ids = rows.map(row => type === "프로그램" ? (row.program_id ?? row.target_id) : row.program_id ?? programId);
    await loadProgramConfigs(ids);

    const resultLinks = rows.map(row => {
      const id = String(type === "프로그램" ? (row.program_id ?? row.target_id ?? "") : (row.program_id ?? programId ?? ""));
      const config = programConfigById.get(id);
      if (!config) return null;
      const isProgram = type === "프로그램";
      const href = isProgram ? `${config.folder}/${config.index}` : (row.target_id ? `${config.folder}/${config.profile}?id=${encodeURIComponent(row.target_id)}` : null);
      if (!href) return null;
      return `<a class="search-result-item" href="${escapeHtml(href)}"><span><strong>${escapeHtml(row.search_term)}</strong><small>${escapeHtml(isProgram ? "프로그램" : row.context_label || config.name)}</small></span><b>→</b></a>`;
    }).filter(Boolean);

    const content = resultLinks.length ? resultLinks.join("") : '<p class="section-empty">선택한 항목의 공개 검색 결과가 없습니다.</p>';
    box.innerHTML = `<div class="search-result-heading"><h2>검색 결과</h2><small>${escapeHtml(type)} · “${escapeHtml(selected)}”</small></div><section class="search-result-group">${content}</section>`;
    box.hidden = false;
    rankingsLoaded = false;
    await loadRankings();
  }

  async function activateHistoryTerm(term) {
    const selected = String(term || "").trim();
    if (!selected) return;
    const { data, error } = await client.rpc("get_catalog_search_suggestions", { p_query: selected });
    if (error) {
      console.error("[검색 기록] 검증 실패:", error);
      return;
    }
    const candidates = (data || []).filter(row => normalize(row.search_term) === normalize(selected));
    const match = candidates.find(row => row.result_type === "출연자") || candidates.find(row => row.result_type === "프로그램") || candidates[0];
    if (match) await executeAllowedSearch(match.search_term, match.result_type, match.target_id, match.program_id);
    else {
      hideRankings();
      box.innerHTML = '<p class="section-empty">현재 허용 목록에 없는 검색어입니다.</p>';
      box.hidden = false;
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = input.value.trim();
    if (query) showSuggestions(query);
    else {
      hideResults();
      if (!rankingsLoaded) loadRankings().then(renderRankings);
      else renderRankings();
    }
  });
  input.addEventListener("input", () => {
    const query = input.value.trim();
    if (!query) {
      suggestionRequest++;
      hideResults();
      if (!rankingsLoaded) loadRankings().then(renderRankings);
      else renderRankings();
      return;
    }
    hideRankings();
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => showSuggestions(query), 180);
  });
  input.addEventListener("focus", async () => {
    if (input.value.trim()) { showSuggestions(input.value); return; }
    if (!rankingsLoaded) await loadRankings();
    if (!input.value.trim()) renderRankings();
  });
  input.addEventListener("search", () => {
    if (!input.value.trim()) {
      suggestionRequest++;
      hideResults();
      if (!rankingsLoaded) loadRankings().then(renderRankings);
      else renderRankings();
    }
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      input.value = "";
      suggestionRequest++;
      hideResults();
      hideRankings();
      input.blur();
    }
  });
  box.addEventListener("click", event => {
    const button = event.target.closest('[data-search-action="select"]');
    if (button) executeAllowedSearch(button.dataset.term, button.dataset.type, button.dataset.target, button.dataset.program);
  });
  rankingBox.addEventListener("click", event => {
    const button = event.target.closest('[data-search-action="history"]');
    if (button) activateHistoryTerm(button.dataset.term);
  });
  document.addEventListener("click", event => {
    if (!form.contains(event.target) && !box.contains(event.target) && !rankingBox.contains(event.target)) {
      hideResults();
      hideRankings();
    }
  });
})();
