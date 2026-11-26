(() => {
  "use strict";

  const client = window.supabaseClient;
  const PROGRAM_SLUG = "hape";
  const getProgramId = async () => {
    if (!window.__hapeProgramIdPromise) {
      window.__hapeProgramIdPromise = client
        .from("programs")
        .select("id")
        .eq("slug", "hape")
        .eq("is_published", true)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error;
          if (!data?.id) throw new Error("programs 테이블에 slug='hape' 항목이 없습니다.");
          return data.id;
        });
    }
    return window.__hapeProgramIdPromise;
  };
  const $ = (selector) => document.querySelector(selector);
  const state = { couples: [], castMembers: [], seasons: [], filter: "all" };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const getCastById = (id) => state.castMembers.find((cast) => String(cast.id) === String(id));
  const getSeasonByCastId = (castId) => {
    const cast = getCastById(castId);
    return cast ? state.seasons.find((season) => String(season.id) === String(cast.season_id)) : null;
  };
  const getBroadcastYear = (season) => {
    const date = season?.broadcast_start_date || season?.broadcast_end_date;
    const match = typeof date === "string" ? /^(\d{4})-\d{2}-\d{2}$/.exec(date) : null;
    if (!match) return null;
    const year = Number(match[1]);
    return Number.isSafeInteger(year) && year > 0 ? year : null;
  };
  const getCastAge = (cast, season) => {
    const rawBirthYear = cast?.birth_year;
    if (rawBirthYear === null || rawBirthYear === undefined) return null;
    const birthYearText = typeof rawBirthYear === "string" ? rawBirthYear.trim() : rawBirthYear;
    if (birthYearText === "" || (typeof birthYearText !== "number" && typeof birthYearText !== "string")) return null;
    if (typeof birthYearText === "string" && !/^\d+$/.test(birthYearText)) return null;
    const birthYear = Number(birthYearText);
    const broadcastYear = getBroadcastYear(season);
    if (!Number.isSafeInteger(birthYear) || birthYear <= 0 || !broadcastYear || birthYear > broadcastYear) return null;
    return broadcastYear - birthYear;
  };
  const isFormerCouple = (couple) => couple.is_former_couple === true || couple.relationship_status === "ended";
  const isCurrentCouple = (couple) => {
    if (isFormerCouple(couple)) return false;
    if (couple.relationship_status === "ongoing") return couple.is_real_couple === true;
    if (couple.relationship_status === "ended") return false;
    return couple.is_current_couple === true && couple.is_real_couple === true;
  };
  const getTypes = (couple) => [
    ...(couple.is_final_couple ? [{ key: "final", label: "최종 커플" }] : []),
    ...(couple.is_real_couple ? [{ key: "reality", label: "현실 커플" }] : []),
    ...(isCurrentCouple(couple) ? [{ key: "current", label: "ing" }] : []),
    ...(isFormerCouple(couple) ? [{ key: "past", label: "done" }] : [])
  ];
  const getCoupleGuide = (type) => ({
    final: "최종 커플(최커): 방송 최종 선택에서 서로를 선택한 커플",
    reality: "현실 커플(현커): 방송 이후 실제 연애를 하거나 결혼한 커플",
    current: "현재 커플: 실제 교제 중이며 현재까지 관계를 이어가고 있는 커플",
    past: "예전 커플: 연애 후 결별하거나 이혼한 커플"
  }[type] || "");
  const renderCoupleTypes = (couple) => getTypes(couple).map(({ key, label }) =>
    `<span class="couple-badge ${key}">${esc(label)}</span>`
  ).join(" ");

  const renderCouples = () => {
    const container = $("#couplesContainer");
    if (!container) return;
    const filtered = state.couples.filter((couple) => {
      if (state.filter === "all") return couple.is_final_couple || couple.is_real_couple || isFormerCouple(couple);
      if (state.filter === "final") return couple.is_final_couple;
      if (state.filter === "reality") return couple.is_real_couple;
      if (state.filter === "current") return isCurrentCouple(couple);
      if (state.filter === "past") return isFormerCouple(couple);
      return false;
    });
    const guide = getCoupleGuide(state.filter);
    const guideHtml = guide ? `<p class="couple-guide">${esc(guide)}</p>` : "";
    if (!filtered.length) {
      container.innerHTML = `${guideHtml}<div class="empty-state">등록된 커플이 없습니다.</div>`;
      return;
    }
    container.innerHTML = `${guideHtml}${filtered.map((couple) => {
      let cast1 = getCastById(couple.cast1_id);
      let cast2 = getCastById(couple.cast2_id);
      // 화면 표시 순서는 남성 왼쪽, 여성 오른쪽으로 통일합니다.
      if (cast1?.gender === "female" && cast2?.gender === "male") {
        [cast1, cast2] = [cast2, cast1];
      }
      const season1 = getSeasonByCastId(cast1?.id);
      const season2 = getSeasonByCastId(cast2?.id);
      const member = (cast, season, isMale) => cast && season
        ? `<div class="couple-member"><h3><a class="${isMale ? "male-cast-link" : ""}" href="hape_profile.html?id=${esc(cast.id)}"><span class="cast-season">${esc(season.season_number)}기</span> ${esc(cast.name)}</a></h3><p>${getCastAge(cast, season) !== null ? `${esc(getCastAge(cast, season))}세` : ""}${(cast.occupation_original || cast.occupation) ? `, ${esc(cast.occupation_original || cast.occupation)}` : ""}</p></div>`
        : '<div class="couple-member"><p>정보 없음</p></div>';
      return `<div class="couple-card"><div class="couple-header">${renderCoupleTypes(couple)}</div><div class="couple-body">${member(cast1, season1, cast1?.gender === "male")}${member(cast2, season2, cast2?.gender === "male")}</div></div>`;
    }).join("")}`;
  };

  function updateStats() {
    const totalSeason = $("#totalSeason");
    const totalCast = $("#totalCast");
    const finalCount = $("#finalCount");
    const realityCount = $("#realityCount");
    if (totalSeason) totalSeason.textContent = `${state.seasons.length}기`;
    if (totalCast) totalCast.textContent = `${state.castMembers.length}명`;
    if (finalCount) finalCount.textContent = `${state.couples.filter((couple) => couple.is_final_couple).length}쌍`;
    if (realityCount) realityCount.textContent = `${state.couples.filter((couple) => couple.is_real_couple).length}쌍`;
  }

  async function loadData() {
    if (!client) {
      console.error("Supabase 클라이언트를 찾을 수 없습니다.");
      return;
    }
    // 하트페어링 프로그램에 속한 시즌만 먼저 조회합니다.
    const seasonResult = await client
      .from("seasons")
      .select("id, season_number, broadcast_start_date, broadcast_end_date, is_published")
      .eq("program_id", await getProgramId())
      .eq("is_published", true);

    if (seasonResult.error) {
      console.error("하트페어링 기수 조회 오류:", seasonResult.error);
      return;
    }

    const seasons = seasonResult.data || [];
    const seasonIds = seasons.map((season) => season.id);

    // 해당 시즌에 속한 출연자만 조회합니다.
    let castMembers = [];
    if (seasonIds.length) {
      const castResult = await client
        .rpc("get_program_cast_members", { p_program_slug: PROGRAM_SLUG })
        .select("id, season_id, name, gender, birth_year, occupation_original, region_original, is_published")
        .in("season_id", seasonIds)
        .eq("is_published", true);

      if (castResult.error) {
        console.error("나는 SOLO 출연자 조회 오류:", castResult.error);
        return;
      }
      castMembers = castResult.data || [];
    }

    // 커플은 양쪽 출연자가 모두 하트페어링 소속일 때만 표시합니다.
    const castIds = new Set(castMembers.map((cast) => String(cast.id)));
    const couplesResult = await client
      .from("couples")
      .select("id, cast1_id, cast2_id, is_final_couple, is_real_couple, is_former_couple, is_current_couple, relationship_status, meet_date, is_published, created_at")
      .eq("program_id", await getProgramId())
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (couplesResult.error) {
      console.error("나는 SOLO 커플 조회 오류:", couplesResult.error);
      return;
    }

    state.seasons = seasons;
    state.castMembers = castMembers;
    state.couples = (couplesResult.data || []).filter((couple) =>
      castIds.has(String(couple.cast1_id)) && castIds.has(String(couple.cast2_id))
    );
    updateStats();
    renderCouples();
  }

  function bindEvents() {
    document.querySelectorAll(".couple-tab").forEach((button) => button.addEventListener("click", () => {
      state.filter = button.dataset.type || "all";
      document.querySelectorAll(".couple-tab").forEach((item) => item.classList.toggle("active", item === button));
      renderCouples();
    }));
    const params = new URLSearchParams(window.location.search);
    const requestedType = params.get("type");
    if (["final", "reality", "current", "past"].includes(requestedType)) {
      state.filter = requestedType;
      document.querySelectorAll(".couple-tab").forEach((item) => item.classList.toggle("active", item.dataset.type === requestedType));
    }
  }
  bindEvents();
  loadData();
})();
