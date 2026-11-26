(() => {
  "use strict";

  const client = window.supabaseClient;
  const PROGRAM_SLUG = "hwan";
  const getProgramId = async () => {
    if (!window.__hwanProgramIdPromise) {
      window.__hwanProgramIdPromise = client
        .from("programs")
        .select("id")
        .eq("slug", "hwan")
        .eq("is_published", true)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error;
          if (!data?.id) throw new Error("programs 테이블에 slug='hwan' 항목이 없습니다.");
          return data.id;
        });
    }
    return window.__hwanProgramIdPromise;
  };

  const state = {
    seasons: [],
    query: "",
    gender: "all",
    season: "all",
    seasonSort: "desc"  // 기본값을 내림차순으로 변경
  };

  const $ = (selector) => document.querySelector(selector);

  const escapeHtml = (value) => {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return map[char];
    });
  };

  const normalizeText = (value) => {
    return String(value ?? "").trim().toLowerCase();
  };

  const getSeasonNumber = (season) => {
    const number = Number(season.season_number);
    return Number.isFinite(number) ? number : 0;
  };

  const getBroadcastPeriod = (season) => {
    const start = season.broadcast_start_date || "";
    const end = season.broadcast_end_date || "";
    if (start && end) {
      return `${start} ~ ${end}`;
    }
    return start || end || "";
  };

  const getBroadcastYear = (season) => {
    const date = season.broadcast_start_date || season.broadcast_end_date || "";
    const year = Number(String(date).slice(0, 4));
    return Number.isFinite(year) && year > 0 ? year : null;
  };

  const getCastAge = (cast, season) => {
    // Number(null)과 Number("")는 0이므로, 변환 전에 값 자체를 확인합니다.
    const rawBirthYear = cast?.birth_year;
    if (rawBirthYear === null || rawBirthYear === undefined || String(rawBirthYear).trim() === "") {
      return null;
    }

    const birthYear = Number(rawBirthYear);
    const broadcastYear = getBroadcastYear(season);

    if (!Number.isInteger(birthYear) || birthYear <= 0 || !broadcastYear) return null;

    const age = broadcastYear - birthYear;
    return age >= 0 ? age : null;
  };

  const showMessage = (message, type = "error") => {
    const container = $("#seasonsContainer");
    if (!container) return;
    container.innerHTML = `
      <div class="${type === "loading" ? "loading-state" : "empty-state"}">
        ${escapeHtml(message)}
      </div>
    `;
  };

  function renderSeasonFilters() {
    const container = $("#seasonFilters");
    if (!container) return;

    const seasonButtons = [...state.seasons]
      .sort((a, b) => getSeasonNumber(a) - getSeasonNumber(b))
      .map((season) => `
        <button
          type="button"
          class="season-btn"
          data-z="${escapeHtml(season.season_number)}"
        >
          ${escapeHtml(season.season_number)}기
        </button>
      `).join("");

    container.innerHTML = `
      <button type="button" class="season-btn active" data-z="all">
        전체
      </button>
      ${seasonButtons}
    `;
  }

  function renderCastList(castMembers, genderClass, season) {
    return castMembers.map((cast) => {
      const age = getCastAge(cast, season);
      return `
      <li>
        <a class="cast-item" href="hwan_profile.html?id=${encodeURIComponent(cast.id)}">
          <span class="cast-badge ${genderClass}">
            ${escapeHtml(cast.name)}
          </span>
          <span class="cast-info">
            ${age !== null ? `${escapeHtml(age)}세${cast.occupation ? ", " : ""}` : ""}
            ${escapeHtml(cast.occupation || "")}
          </span>
        </a>
      </li>
    `;
    }).join("");
  }

  function getFilteredSeasons() {
    const query = normalizeText(state.query);

    return state.seasons
      .filter((season) => {
        return state.season === "all" || String(season.season_number) === String(state.season);
      })
      .map((season) => {
        const matchesCast = (cast) => {
          const matchesGender = state.gender === "all" || cast.gender === state.gender;
          if (!matchesGender) return false;
          if (!query) return true;
          const searchableText = normalizeText(`
            ${cast.name || ""}
            ${cast.occupation_original || cast.occupation || ""}
            ${getCastAge(cast, season) ?? ""}
            ${cast.introduction || ""}
          `);
          return searchableText.includes(query);
        };

        return {
          ...season,
          maleCastCount: (season.castMembers || []).filter((cast) => cast.gender === "male").length,
          femaleCastCount: (season.castMembers || []).filter((cast) => cast.gender === "female").length,
          maleCast: (season.castMembers || []).filter((cast) => cast.gender === "male" && matchesCast(cast)),
          femaleCast: (season.castMembers || []).filter((cast) => cast.gender === "female" && matchesCast(cast))
        };
      })
      .filter((season) => {
        const hasCast = season.maleCast.length > 0 || season.femaleCast.length > 0;
        const initialView = !state.query && state.gender === "all" && state.season === "all";
        return hasCast || initialView;
      })
      .sort((a, b) => {
        const difference = getSeasonNumber(a) - getSeasonNumber(b);
        return state.seasonSort === "asc" ? difference : -difference;
      });
  }

  function renderSeasons() {
    const container = $("#seasonsContainer");
    const resultText = $("#resultText");
    if (!container) return;

    const filteredSeasons = getFilteredSeasons();

    if (!filteredSeasons.length) {
      container.innerHTML = `<div class="empty-state">검색 결과가 없습니다.</div>`;
      if (resultText) {
        resultText.textContent = "검색 결과가 없습니다";
      }
      updateSeasonButtonState();
      return;
    }

    container.innerHTML = filteredSeasons.map((season) => {
      const maleHtml = season.maleCast.length ? `
        <div class="cast-section male">
          <h3>남자 출연자 ${season.maleCastCount}명</h3>
          <ul class="cast-list">
            ${renderCastList(season.maleCast, "male", season)}
          </ul>
        </div>
      ` : "";

      const femaleHtml = season.femaleCast.length ? `
        <div class="cast-section female">
          <h3>여자 출연자 ${season.femaleCastCount}명</h3>
          <ul class="cast-list">
            ${renderCastList(season.femaleCast, "female", season)}
          </ul>
        </div>
      ` : "";

      return `
        <section class="season-card">
          <div class="season-header">
            <h2 class="season-title"><a class="season-detail-link" href="hwan_seasons.html?id=${encodeURIComponent(season.id)}">${escapeHtml(season.season_number)}기</a></h2>
            ${season.special_label ? `<span class="special-badge">${escapeHtml(season.special_label)}</span>` : ""}
            <span class="season-date">${escapeHtml(getBroadcastPeriod(season))}</span>
            ${season.location ? `<span class="season-location">· ${escapeHtml(season.location)}</span>` : ""}
          </div>
          <div class="season-content">
            ${maleHtml}
            ${femaleHtml}
          </div>
        </section>
      `;
    }).join("");

    const castCount = filteredSeasons.reduce((total, season) => {
      return total + season.maleCast.length + season.femaleCast.length;
    }, 0);

    if (resultText) {
      const hasFilter = Boolean(state.query) || state.gender !== "all" || state.season !== "all";
      const sortText = state.seasonSort === "asc" ? "오름차순" : "내림차순";
      resultText.textContent = hasFilter
        ? `${castCount}명의 출연자를 찾았습니다`
        : `모든 기수의 출연자를 ${sortText}으로 보여드리고 있습니다`;
    }

    updateSeasonButtonState();
  }

  function updateSeasonButtonState() {
    document.querySelectorAll("#seasonFilters [data-z]").forEach((button) => {
      button.classList.toggle("active", String(button.dataset.z) === String(state.season));
    });
  }

  // 커플 카운트 로드 함수 추가
  async function loadCoupleCounts() {
    if (!client) return;

    const [finalResult, realityResult] = await Promise.all([
      client.from("couples").select("id", { count: "exact", head: true }).eq("program_id", await getProgramId()).eq("is_final_couple", true).eq("is_published", true),
      client.from("couples").select("id", { count: "exact", head: true }).eq("program_id", await getProgramId()).eq("is_real_couple", true).eq("is_published", true)
    ]);

    const finalCount = $("#finalCount");
    const realityCount = $("#realityCount");

    if (finalCount) {
      finalCount.textContent = `${finalResult.count || 0}쌍`;
    }

    if (realityCount) {
      realityCount.textContent = `${realityResult.count || 0}쌍`;
    }
  }

  async function loadData() {
    if (!client) {
      console.error("Supabase 클라이언트를 찾을 수 없습니다.");
      showMessage("Supabase 연결 설정을 찾을 수 없습니다.");
      return;
    }

    showMessage("데이터를 불러오는 중입니다.", "loading");

    // 환승연애에 속한 공개 기수만 조회합니다.
    const seasonResult = await client
      .from("seasons")
      .select(`
        id,
        program_id,
        season_number,
        special_label,
        location,
        broadcast_start_date,
        broadcast_end_date,
        is_published
      `)
      .eq("program_id", await getProgramId())
      .eq("is_published", true)
      .order("season_number", { ascending: true });

    if (seasonResult.error) {
      console.error("기수 조회 오류:", seasonResult.error);
      showMessage(`기수 데이터를 불러오지 못했습니다.\n${seasonResult.error.message || ""}`);
      return;
    }

    const seasons = seasonResult.data || [];
    const seasonIds = seasons.map((season) => season.id);
    let castMembers = [];

    // 위에서 확인한 환승연애 기수 ID에 속한 출연자만 조회합니다.
    if (seasonIds.length) {
      const castResult = await client
        .rpc("get_program_cast_members", { p_program_slug: PROGRAM_SLUG })
        .select(`
          id,
          season_id,
          name,
          gender,
          birth_year,
          occupation_original,
          region_original,
          introduction,
          is_published
        `)
        .in("season_id", seasonIds)
        .eq("is_published", true)
        .order("season_id", { ascending: true })
        .order("id", { ascending: true });

      if (castResult.error) {
        console.error("출연자 조회 오류:", castResult.error);
        showMessage(`출연자 데이터를 불러오지 못했습니다.\n${castResult.error.message || ""}`);
        return;
      }
      castMembers = castResult.data || [];
    }

    state.seasons = seasons.map((season) => {
      const seasonCast = castMembers.filter((cast) => String(cast.season_id) === String(season.id));
      return { ...season, castMembers: seasonCast.map((cast) => ({
        ...cast,
        occupation: cast.occupation_original || "",
        occupation_original: cast.occupation_original || "",
        region: cast.region_original || "",
        region_original: cast.region_original || ""
      })) };
    });

    const totalSeason = $("#totalSeason");
    const totalCast = $("#totalCast");

    if (totalSeason) {
      totalSeason.textContent = `${state.seasons.length}기`;
    }

    if (totalCast) {
      totalCast.textContent = `${castMembers.length}명`;
    }

    // 커플 카운트 로드
    await loadCoupleCounts();

    renderSeasonFilters();
    renderSeasons();
  }

  function bindEvents() {
    const searchForm = $("#archiveSearchForm");
    if (searchForm) {
      searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const searchInput = $("#searchInput");
        state.query = searchInput ? searchInput.value : "";
        renderSeasons();
      });
    }
    const searchInput = $("#searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (event) => {
        state.query = event.target.value;
        renderSeasons();
      });
    }

    document.querySelectorAll("[data-gender]").forEach((button) => {
      button.addEventListener("click", () => {
        state.gender = button.dataset.gender || "all";
        document.querySelectorAll("[data-gender]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderSeasons();
      });
    });

    const seasonFilters = $("#seasonFilters");
    if (seasonFilters) {
      seasonFilters.addEventListener("click", (event) => {
        const button = event.target.closest("[data-z]");
        if (!button) return;
        state.season = button.dataset.z || "all";
        renderSeasons();
      });
    }

    const seasonSort = $("#seasonSort");
    if (seasonSort) {
      seasonSort.addEventListener("change", (event) => {
        state.seasonSort = event.target.value === "desc" ? "desc" : "asc";
        renderSeasons();
      });
    }
  }

  function setupResultToolbar() {
    const resultText = $("#resultText");
    const sortControl = document.querySelector(".season-filter-row .sort-control");
    if (!resultText || !sortControl || resultText.parentElement?.classList.contains("result-toolbar-row")) return;

    const row = document.createElement("div");
    row.className = "result-toolbar-row";
    resultText.parentNode.insertBefore(row, resultText);
    row.append(resultText, sortControl);
  }

  function setupSearchPlaceholder() {
    const searchInput = $("#searchInput");
    if (searchInput) searchInput.placeholder = "출연자의 이름, 닉네임, 직업을 입력해보세요!";
  }

  function init() {
    setupResultToolbar();
    setupSearchPlaceholder();
    bindEvents();
    loadData();
  }

function adjustFont(delta) {
  const root = document.documentElement;
  const current = parseFloat(getComputedStyle(root).getPropertyValue('--font-scale')) || 1;
  const newValue = Math.max(0.7, Math.min(1.5, current + delta));
  root.style.setProperty('--font-scale', newValue);
}



  init();
})();

(function() {
  const STORAGE_KEY = 'solo-font-scale';
  const DEFAULT_SCALE = 1;
  const MIN_SCALE = 0.7;
  const MAX_SCALE = 1.5;

  function getScale() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = parseFloat(stored);
      if (!isNaN(val)) return val;
    }
    return DEFAULT_SCALE;
  }

  function setScale(scale) {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    document.documentElement.style.setProperty('--font-base', clamped * 16 + 'px');
    localStorage.setItem(STORAGE_KEY, clamped.toString());
  }

  function adjustFont(delta) {
    const current = getScale();
    setScale(current + delta);
  }

  // 초기 적용
  setScale(getScale());

  // 버튼 이벤트 (DOMContentLoaded 후)
  document.addEventListener('DOMContentLoaded', function() {
    const decreaseBtn = document.getElementById('fontDecrease');
    const resetBtn = document.getElementById('fontReset');
    const increaseBtn = document.getElementById('fontIncrease');
    if (decreaseBtn) decreaseBtn.addEventListener('click', function() { adjustFont(-0.1); });
    if (resetBtn) resetBtn.addEventListener('click', function() { setScale(DEFAULT_SCALE); });
    if (increaseBtn) increaseBtn.addEventListener('click', function() { adjustFont(0.1); });
  });
})();