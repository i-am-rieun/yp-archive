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
  const castId = params.get("id") || params.get("cast_id") || params.get("castId") || (window.location.hash.startsWith("#id=") ? new URLSearchParams(window.location.hash.slice(1)).get("id") : null);
  const $ = (selector) => document.querySelector(selector);
  const STORAGE_BASE = "https://iegvfrhcyzbuaszsqkin.supabase.co/storage/v1/object/public/cast-profiles";
  const NEWS_PAGE_SIZE = 5;
  const PROFILE_IMAGE_FILES = {
    female: {
      "현숙": "fe_hyunsook.png",
      "정희": "fe_junghee.png",
      "정자": "fe_jungja.png",
      "정숙": "fe_jungsook.png",
      "옥순": "fe_oksoon.png",
      "순자": "fe_soonja.png",
      "영자": "fe_youngja.png",
      "영숙": "fe_youngsook.png",
      "영순": "fe_youngsoon.png",
      "정순": "fe_jungsoon.png"
    },
    male: {
      "종수": "ma_jongsoo.png",
      "정식": "ma_jungsik.png",
      "정수": "ma_jungsoo.png",
      "광수": "ma_kwangsoo.png",
      "경수": "ma_kyungsoo.png",
      "상철": "ma_sangchul.png",
      "영철": "ma_youngchul.png",
      "영호": "ma_youngho.png",
      "영식": "ma_youngsik.png",
      "영수": "ma_youngsoo.png"
    }
  };
  let newsItems = [];
  let newsPage = 1;
  let currentSeasonCast = [];
  let currentSeasonNumber = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

  function renderDetailBreadcrumbs(items) {
    const container = document.querySelector(".profile-main") || document.querySelector("main");
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
  function showError(message){const el=$("#profileLoading");if(el){el.textContent=message;el.classList.remove("hidden");}}
  function text(value,fallback="-"){return value===null||value===undefined||String(value).trim()===""?fallback:String(value);}
  function createLink(url,label){return url?`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:"";}
  function getStorageImageUrl(name, gender) {
    const normalizedGender = gender === "여성" ? "female" : gender === "남성" ? "male" : gender;
    const fileName = PROFILE_IMAGE_FILES[normalizedGender]?.[String(name || "").trim()];
    return fileName ? `${STORAGE_BASE}/${fileName}` : null;
  }
  function setAvatar(cast){
    const avatar=$("#profileAvatar");
    if(!avatar)return;
    const imageUrl=cast.profile_image_url||getStorageImageUrl(cast.name,cast.gender);
    if(imageUrl){
      avatar.innerHTML=`<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(cast.name)} 프로필 이미지" loading="eager" decoding="async">`;
      avatar.querySelector("img")?.addEventListener("error",()=>{avatar.textContent=String(cast.name||"").slice(0,1);},{once:true});
    }else{
      avatar.textContent=String(cast.name||"").slice(0,1);
    }
  }
  function renderRecordValue(value,linkNames=false){
    const raw=text(value);
    if(raw==="-"||!linkNames||!currentSeasonCast.length)return escapeHtml(raw);
    const people=[...currentSeasonCast].filter(person=>person.name&&person.id).sort((a,b)=>String(b.name).length-String(a.name).length);
    const byName=new Map(people.map(person=>[String(person.name).trim(),person]));
    const names=[...byName.keys()].filter(Boolean);
    if(!names.length)return escapeHtml(raw);
    const pattern=new RegExp(names.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|"),"g");
    let output="",lastIndex=0,match;
    while((match=pattern.exec(raw))!==null){
      output+=escapeHtml(raw.slice(lastIndex,match.index));
      const person=byName.get(match[0]);
      output+=`<a class="record-person-link" href="n_profile.html?id=${encodeURIComponent(person.id)}">${escapeHtml(match[0])}</a>`;
      lastIndex=match.index+match[0].length;
    }
    return output+escapeHtml(raw.slice(lastIndex));
  }
  function record(label,value,linkNames=false){return `<div class="record-row"><span class="record-label">${escapeHtml(label)}</span><span class="record-value">${renderRecordValue(value,linkNames)}</span></div>`;}
  function renderQuotes(items){
    const el=$("#profileQuotes");if(!el)return;
    if(!Array.isArray(items)||!items.length){el.innerHTML=`<p class="empty-text">등록된 어록이 없습니다.</p>`;return;}
    el.innerHTML=items.map(item=>`<article class="quote-item"><p class="quote-text">“${escapeHtml(item?.text||"")}”</p><span class="quote-episode">어록 ${escapeHtml(currentSeasonNumber ?? "-")}기</span></article>`).join("");
  }
  function initSpoilerLock(){const wrapper=$("#broadcastSpoiler");const button=$("#spoilerUnlock");if(!wrapper||!button)return;button.addEventListener("click",()=>wrapper.classList.remove("is-locked"));}
  async function loadSeasonCast(seasonId){
    currentSeasonCast=[];
    if(!seasonId)return;
    const {data,error}=await client
      .rpc("get_program_cast_members", { p_program_slug: PROGRAM_SLUG })
      .select("id, name, season_id")
      .eq("season_id",seasonId)
      .eq("is_published",true);
    if(error){console.error("프로그램 출연자 목록을 불러오지 못했습니다.",error);return;}
    currentSeasonCast=data||[];
  }
  async function loadProfile(){
    if(!client){showError("Supabase 연결 설정을 찾을 수 없습니다.");return null;}
    if(!castId){showError("출연자 정보가 지정되지 않았습니다.");return null;}
    let programId;
    try {
      programId = await getProgramId();
    } catch (programError) {
      console.error("프로그램 정보 조회 오류:", programError);
      showError(`프로그램 정보를 불러오지 못했습니다. ${escapeHtml(programError.message || programError)}`);
      return null;
    }
    const {data,error}=await client.rpc("get_program_cast_members", { p_program_slug: PROGRAM_SLUG, p_cast_member_id: castId }).select("id, name, season_id, gender, profile_image_url, birth_year, occupation_original, region_original, introduction, first_impression, first_date, random_date, final_choice, final_couple_status, quotes, instagram_url, youtube_url, other_url, is_published").eq("id",castId).eq("is_published",true).maybeSingle();
    if(error){console.error(error);showError(`프로필을 불러오지 못했습니다. ${error.message}`);return null;}
    if(!data){showError("공개된 출연자 정보를 찾을 수 없습니다.");return null;}
    const {data: seasonData, error: seasonError} = await client.from("seasons")
      .select("id, program_id, season_number, special_label, broadcast_start_date, broadcast_end_date")
      .eq("id", data.season_id).eq("program_id", programId).eq("is_published", true).maybeSingle();
    if (seasonError || !seasonData) {
      console.error("기수 정보 조회 오류:", seasonError);
      showError("돌싱앤모솔 소속 출연자 정보를 찾을 수 없습니다. ");
      return null;
    }
    data.seasons = seasonData;
    const cast=data,seasons=cast.seasons;
    currentSeasonNumber=seasons?.season_number ?? null;
    await loadSeasonCast(cast.season_id);
    $("#profileLoading")?.classList.add("hidden");
    const card=$("#profileCard");card?.classList.remove("hidden");card?.classList.toggle("profile-male",cast.gender==="male");
    const profileMain=$(".profile-main");
    profileMain?.classList.toggle("profile-male",cast.gender==="male");
    profileMain?.classList.toggle("profile-female",cast.gender==="female");
    $("#profileSeason").textContent="돌싱앤모솔";
    const displayName=seasons?`${seasons.season_number}기 ${cast.name||""}`:(cast.name||"");
    $("#profileName").textContent=displayName;
    const genderLabel=cast.gender==="male"?"남성":cast.gender==="female"?"여성":text(cast.gender,"");
    const genderEl=$("#profileGender");
    if(genderEl) genderEl.textContent=genderLabel;
    const breadcrumbSeason=$("#breadcrumbSeason");
    const breadcrumbCurrent=$("#breadcrumbCurrent");
    if(breadcrumbSeason){
      breadcrumbSeason.textContent=seasons ? `${seasons.season_number}기` : "기수";
      breadcrumbSeason.href=seasons ? `n_seasons.html?id=${encodeURIComponent(cast.season_id)}` : "n_seasons.html";
    }
    if(breadcrumbCurrent) breadcrumbCurrent.textContent=cast.name || "출연자";
    renderDetailBreadcrumbs([
      { label: "출연자", href: "n_index.html" },
      { label: `${seasons?.season_number ?? "기수"}기`, href: seasons ? `n_seasons.html?id=${encodeURIComponent(cast.season_id)}` : "n_seasons.html" },
      { label: cast.name || "출연자" }
    ]);
    document.title=`${displayName} — 돌싱앤모솔 아카이브`;
    setAvatar(cast);
    const broadcastYear = Number(String(seasons?.broadcast_start_date || "").slice(0, 4)) || null;
    const rawBirthYear = cast.birth_year;
    const birthYear = rawBirthYear === null || rawBirthYear === undefined || String(rawBirthYear).trim() === "" ? null : Number(rawBirthYear);
    const age = broadcastYear && Number.isInteger(birthYear) && birthYear > 0 && broadcastYear >= birthYear ? broadcastYear - birthYear : null;
    const label = $("#broadcastInfoLabel");
    if (label) label.textContent = broadcastYear ? `방송 당시 (${broadcastYear}년 기준)` : "방송 당시";
    const originalRows = [["나이", age !== null ? `${age}세` : "-"],["직업", cast.occupation_original || "-"],["거주지", cast.region_original || "-"]];
    $("#profileInfoOriginal").innerHTML = originalRows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
    $("#profileFeature").textContent=cast.introduction||"-";
    $("#profileRecords").innerHTML=[record("첫인상 선택",cast.first_impression,true),record("첫번째 데이트 상대",cast.first_date,true),record("두번째 데이트 상대",cast.random_date,true),record("최종 선택 상대",cast.final_choice,true),record("최종 커플 여부",cast.final_couple_status,true)].join("");
    renderQuotes(cast.quotes);
    $("#profileLinks").innerHTML=[createLink(cast.instagram_url,"인스타그램"),createLink(cast.youtube_url,"유튜브"),createLink(cast.other_url,"블로그")].filter(Boolean).join("") || `<p class="empty-text">등록된 소셜 미디어가 없습니다.</p>`;
    return cast;
  }
  function formatNewsDate(value){
    if(!value)return "";
    const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match?`${match[1]}.${match[2]}.${match[3]}`:String(value);
  }
  function renderNews(){
    const container=$("#profileNews"),pagination=$("#profileNewsPagination");if(!container)return;
    const totalPages=Math.max(1,Math.ceil(newsItems.length/NEWS_PAGE_SIZE));
    newsPage=Math.min(Math.max(1,newsPage),totalPages);
    if(!newsItems.length){container.innerHTML=`<p class="empty-text">등록된 관련 뉴스가 없습니다.</p>`;if(pagination)pagination.innerHTML="";return;}
    const start=(newsPage-1)*NEWS_PAGE_SIZE;
    container.innerHTML=newsItems.slice(start,start+NEWS_PAGE_SIZE).map(news=>{
      const publisher=text(news.publisher,"");
      const date=formatNewsDate(news.published_at);
      return `<article class="news-item"><a class="news-row-link" href="${escapeHtml(news.url||"#")}" target="_blank" rel="noopener noreferrer"><span class="news-title">${escapeHtml(news.title||"제목 없음")}</span><span class="news-publisher">${escapeHtml(publisher)}</span><time class="news-date">${escapeHtml(date)}</time><span class="news-open" aria-hidden="true">↗</span></a></article>`;
    }).join("");
    if(!pagination)return;
    if(totalPages<=1){pagination.innerHTML="";return;}
    const pageButtons=Array.from({length:totalPages},(_,i)=>{const page=i+1;return `<button type="button" class="news-page${page===newsPage?" is-active":""}" data-page="${page}" aria-current="${page===newsPage?"page":"false"}">${page}</button>`;}).join("");
    pagination.innerHTML=`<button type="button" class="news-page news-page-arrow" data-page="${newsPage-1}" aria-label="이전 페이지" ${newsPage===1?"disabled":""}>‹</button>${pageButtons}<button type="button" class="news-page news-page-arrow" data-page="${newsPage+1}" aria-label="다음 페이지" ${newsPage===totalPages?"disabled":""}>›</button>`;
    pagination.querySelectorAll("button[data-page]").forEach(button=>button.addEventListener("click",()=>{const page=Number(button.dataset.page);if(page>=1&&page<=totalPages){newsPage=page;renderNews();}}));
  }
  async function loadNews(id){
    const container=$("#profileNews");if(!container)return;
    if(!client){container.innerHTML=`<p class="empty-text">Supabase 연결 설정을 찾을 수 없습니다.</p>`;return;}
    const {data,error}=await client.from("cast_news_links").select("*").eq("cast_member_id",id).eq("is_published",true).order("sort_order",{ascending:true}).order("id",{ascending:true});
    if(error){container.innerHTML=`<p class="news-error">관련 뉴스를 불러오지 못했습니다.<br>${escapeHtml(error.message)}</p>`;return;}
    newsItems=data||[];newsPage=1;renderNews();
  }
  async function init(){initSpoilerLock();const profile=await loadProfile();if(profile)await loadNews(profile.id);}
  init();
})();

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const client = window.supabaseClient;
  const path = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const soloPrefix = true;
  const profilePage = soloPrefix ? "n_profile.html" : "profile.html";
  const seasonsPage = soloPrefix ? "n_seasons.html" : "seasons.html";

  // 출연자 그룹: index/profile/seasons. 커플 그룹: couples.
  const activeNav = path === "couples.html" || path === "n_couples.html" ? "couples" : "cast";
  document.querySelectorAll(".site-nav a[data-nav]").forEach((link) => {
    if (link.dataset.nav === activeNav) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  async function run() {
    const params = new URLSearchParams(window.location.search);
    if (!client) return;
    let programId;
    try {
      programId = await getProgramId();
    } catch (programError) {
      console.error("프로그램 정보 조회 오류:", programError);
      return;
    }

    // 프로필 페이지의 현재 위치 표시
    if (client && (path === "profile.html" || path === "n_profile.html")) {
      const id = params.get("id") || params.get("cast_id") || params.get("castId");
      if (id) {
        const { data: cast } = await client
          .rpc("get_program_cast_members", { p_program_slug: PROGRAM_SLUG, p_cast_member_id: id })
          .select("id, name, season_id")
          .eq("id", id)
          .maybeSingle();
        const { data: season } = cast ? await client.from("seasons")
          .select("season_number, program_id")
          .eq("id", cast.season_id).eq("program_id", programId).eq("is_published", true).maybeSingle() : { data: null };
        const crumb = $("#breadcrumbCurrent");
        if (crumb && cast && season && Number(season.program_id) === Number(programId)) crumb.textContent = `${season.season_number ?? ""}기 ${cast.name || "프로필"}`;
      }
    }

    const isSeasonDetail = ["seasons.html", "season.html", "n_seasons.html", "n_season.html"].includes(path);
    if (!client || !isSeasonDetail) return;

    const id = params.get("id") || params.get("season_id");
    if (!id) return;

    const { data: all, error: seasonsError } = await client
      .from("seasons")
      .select("id,season_number,special_label")
      .eq("program_id", programId)
      .eq("is_published", true)
      .order("season_number", { ascending: true });

    if (seasonsError) {
      console.error("기수 탐색 정보 조회 오류:", seasonsError);
      return;
    }

    const seasons = all || [];
    const index = seasons.findIndex((season) => String(season.id) === String(id));
    const crumb = $("#breadcrumbCurrent");
    if (crumb && index >= 0) crumb.textContent = `${seasons[index].season_number}기 상세`;

    const title = $("#seasonTitle");
    if (title && index >= 0) {
      let nav = $("#seasonPrevNext");
      if (!nav) {
        nav = document.createElement("nav");
        nav.id = "seasonPrevNext";
        nav.className = "detail-pagination";
        nav.setAttribute("aria-label", "기수 이전 다음 탐색");
        title.parentNode.appendChild(nav);
      }
      const previous = index > 0
        ? `<a class="season-nav-button" href="${seasonsPage}?id=${encodeURIComponent(seasons[index - 1].id)}">← 이전 기수</a>`
        : "<span></span>";
      const next = index < seasons.length - 1
        ? `<a class="season-nav-button" href="${seasonsPage}?id=${encodeURIComponent(seasons[index + 1].id)}">이후 기수 →</a>`
        : "<span></span>";
      nav.innerHTML = `${previous}${next}`;
    }

    // navigation-enhancements.js의 기수별 출연자 프로필 링크 기능
    const { data: cast, error: castError } = await client
      .rpc("get_program_cast_members", { p_program_slug: PROGRAM_SLUG })
      .select("id,name,gender")
      .eq("season_id", id)
      .eq("is_published", true)
      .order("name", { ascending: true });

    if (castError) {
      console.error("기수 출연자 링크 조회 오류:", castError);
      return;
    }

    const card = $("#seasonCard");
    if (!card || !cast?.length) return;

    // seasons.js가 이미 #seasonCastList 안에 프로필 카드 링크를 렌더링하는 페이지에서는
    // 같은 링크 섹션을 중복 생성하지 않습니다.
    if ($("#seasonCastList", card)) return;

    let links = $("#seasonCastLinks", card);
    if (!links) {
      links = document.createElement("section");
      links.id = "seasonCastLinks";
      links.className = "season-cast-links";
      links.innerHTML = '<h2>이 기수 출연자 프로필 바로가기</h2><div class="season-cast-link-list"></div>';

      const news = $("#seasonNewsSection", card) || $("#seasonNews", card)?.closest("section");
      const castList = $("#seasonCastList", card);
      const castSection = castList?.closest("section");
      if (news) {
        news.parentNode.insertBefore(links, news);
      } else if (castSection?.parentNode) {
        castSection.parentNode.insertBefore(links, castSection.nextSibling);
      } else {
        card.appendChild(links);
      }
    }

    const list = $(".season-cast-link-list", links);
    if (list) {
      list.innerHTML = cast.map((member) =>
        `<a href="${profilePage}?id=${encodeURIComponent(member.id)}">${esc(member.name || "이름 미입력")} 프로필</a>`
      ).join("");
    }
  }

  run().catch((error) => console.error("페이지 간 탐색 기능 오류:", error));
})();

