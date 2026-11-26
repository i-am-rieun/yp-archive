
(function(){
  const quoteText = document.getElementById('loveQuoteText');
  const quoteCounter = document.getElementById('loveQuoteCounter');
  const quoteClient = window.supabaseClient;
  let quoteTimer = null;

  async function loadAphorisms() {
    if (!quoteText) return;
    // 정적 문구로 대체하지 않고 Supabase 활성 문구만 표시합니다.
    quoteText.textContent = '';
    if (quoteCounter) {
      quoteCounter.textContent = '';
      quoteCounter.hidden = true;
    }
    if (quoteTimer) window.clearInterval(quoteTimer);

    if (!quoteClient || typeof quoteClient.from !== 'function') {
      console.error('[롤링 문구] Supabase 클라이언트가 초기화되지 않았습니다.');
      return;
    }

    const { data, error } = await quoteClient
      .from('aphorisms')
      .select('id, content, sort_order, created_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[롤링 문구] Supabase 조회 실패:', error);
      return;
    }

    const quotes = (data || [])
      .map(row => String(row.content || '').trim())
      .filter(Boolean);

    if (!quotes.length) {
      console.warn('[롤링 문구] 활성 상태인 문구가 없습니다.');
      return;
    }

    // 활성 문구 중 무작위로 선택하고, 바로 직전 문구와 같은 문구는 연속 표시하지 않습니다.
    let quoteIndex = Math.floor(Math.random() * quotes.length);
    let shownCount = 0;
    let transitionTimer = null;
    const showQuote = () => {
      if (transitionTimer) window.clearTimeout(transitionTimer);
      quoteText.style.transition = 'opacity 180ms ease';
      quoteText.style.opacity = '0';
      transitionTimer = window.setTimeout(() => {
        quoteText.textContent = quotes[quoteIndex];
        quoteText.style.opacity = '1';
        shownCount += 1;
        if (quoteCounter) {
          quoteCounter.textContent = String(shownCount).padStart(2, '0');
          quoteCounter.hidden = quotes.length < 2;
        }
      }, 180);
    };

    showQuote();
    if (quotes.length > 1) {
      quoteTimer = window.setInterval(() => {
        const previousIndex = quoteIndex;
        do { quoteIndex = Math.floor(Math.random() * quotes.length); }
        while (quoteIndex === previousIndex);
        showQuote();
      }, 5000);
    }
  }

  loadAphorisms();
 const programJump=document.getElementById('programJump');
 programJump?.addEventListener('change',()=>{if(programJump.value) document.querySelector(programJump.value)?.scrollIntoView({behavior:'smooth',block:'start'});});
 const client=window.supabaseClient;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function loadNews(){const box=document.getElementById('latestNewsList');if(!client){box.innerHTML='<p class="section-empty">Supabase 연결 설정을 확인해 주세요.</p>';return}
  const {data,error}=await client.from('cast_news_links').select('id,url,title,publisher,published_at,updated_at,created_at,cast_member_id,season_id,is_published,cast_members(name),seasons(season_number,programs(name))').eq('is_published',true).order('updated_at',{ascending:false,nullsFirst:false}).order('published_at',{ascending:false,nullsFirst:false}).limit(5);
  if(error){console.error('최신 소식 조회 오류:',error);box.innerHTML='<p class="section-empty">최신 소식을 불러오지 못했습니다. 뉴스 테이블의 공개 정책과 컬럼을 확인해 주세요.</p>';return}
  if(!data?.length){box.innerHTML='<p class="section-empty">등록된 출연자 관련 뉴스가 없습니다.</p>';return}
  box.innerHTML=data.map((n,i)=>{const date=n.updated_at||n.published_at||n.created_at;const label=date?new Date(date).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}):'날짜 미정';const cast=Array.isArray(n.cast_members)?n.cast_members[0]:n.cast_members;const season=Array.isArray(n.seasons)?n.seasons[0]:n.seasons;const program=Array.isArray(season?.programs)?season.programs[0]:season?.programs;const details=[program?.name,season?.season_number?season.season_number+'기':null,cast?.name].filter(Boolean).join(' · ');const meta=[details,n.publisher?`(${n.publisher})`:null].filter(Boolean).join(' ');return `<a class="news-row" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer"><span class="news-number">${String(i+1).padStart(2,'0')}</span><span class="news-main"><strong>${esc(n.title||'제목 미등록 뉴스')}</strong><small>${esc(meta||'출연자 관련 소식')}</small></span><time datetime="${esc(date||'')}">${esc(label)}</time><span class="news-arrow">↗</span></a>`}).join('');
 }

 async function initProgramMetrics(){
  if(!client || typeof client.from !== 'function') return;

  // Supabase 기본 응답 제한을 넘는 경우에도 모든 공개 데이터를 조회합니다.
  async function fetchAll(table, columns, filters = []) {
   const pageSize = 1000;
   const rows = [];
   for(let from = 0; ; from += pageSize) {
    let query = client.from(table).select(columns).order('id', {ascending:true});
    for(const filter of filters) query = query.eq(filter.column, filter.value);
    const {data, error} = await query.range(from, from + pageSize - 1);
    if(error) throw error;
    const page = data || [];
    rows.push(...page);
    if(page.length < pageSize) break;
   }
   return rows;
  }

  try {
   const [programs, seasons, couples] = await Promise.all([
    fetchAll('programs', 'id,slug', [{column:'is_published', value:true}]),
    fetchAll('seasons', 'id,program_id,season_number', [{column:'is_published', value:true}]),
    fetchAll('couples', 'id,season_id,cast1_id,cast2_id,program_id,is_final_couple', [{column:'is_published', value:true}])
   ]);

   const programBySlug = new Map(programs.map(row => [String(row.slug || '').trim(), row]));
   const castMembers = [];
   // 각 아카이브 출연자 목록과 동일한 RPC 및 공개 필터로 출연자를 집계합니다.
   for(const program of programs) {
    const slug = String(program.slug || '').trim();
    const programSeasonIds = seasons
     .filter(season => String(season.program_id) === String(program.id))
     .map(season => season.id);
    if(!programSeasonIds.length) continue;
    const pageSize = 1000;
    for(let from = 0; ; from += pageSize) {
     const {data, error} = await client.rpc('get_program_cast_members', {p_program_slug: slug})
      .select('id,season_id')
      .in('season_id', programSeasonIds)
      .eq('is_published', true)
      .order('season_id', {ascending:true})
      .order('id', {ascending:true})
      .range(from, from + pageSize - 1);
     if(error) throw error;
     const page = data || [];
     castMembers.push(...page);
     if(page.length < pageSize) break;
    }
   }
   const seasonsByProgram = new Map();
   const seasonById = new Map();
   for(const season of seasons) {
    const programId = String(season.program_id);
    if(!programBySlug.size || !programs.some(program => String(program.id) === programId)) continue;
    if(!seasonsByProgram.has(programId)) seasonsByProgram.set(programId, []);
    seasonsByProgram.get(programId).push(season);
    seasonById.set(String(season.id), season);
   }

   const castByProgram = new Map();
   const castById = new Map();
   const castIdsBySeason = new Map();
   for(const cast of castMembers) {
    const season = seasonById.get(String(cast.season_id));
    if(!season) continue;
    const programId = String(season.program_id);
    if(!castByProgram.has(programId)) castByProgram.set(programId, []);
    castByProgram.get(programId).push(cast);
    castById.set(String(cast.id), cast);
    if(!castIdsBySeason.has(String(cast.season_id))) castIdsBySeason.set(String(cast.season_id), new Set());
    castIdsBySeason.get(String(cast.season_id)).add(String(cast.id));
   }

   const metricsByProgram = new Map();
   for(const program of programs) {
    const id = String(program.id);
    const programSeasons = seasonsByProgram.get(id) || [];
    const programCast = castByProgram.get(id) || [];
    const castIds = new Set(programCast.map(cast => String(cast.id)));
    const slug = String(program.slug || '').trim();

    let finalCoupleCount = 0;
    for(const couple of couples) {
     if(couple.is_final_couple !== true) continue;

     const firstId = String(couple.cast1_id ?? '');
     const secondId = String(couple.cast2_id ?? '');
     let belongsToProgram = false;

     // 각 아카이브의 커플 집계 기준을 동일하게 적용합니다.
     if(['hasi','hape','hwan'].includes(slug)) {
      belongsToProgram = String(couple.program_id ?? '') === id;
     } else if(slug === 'sagye') {
      const seasonCastIds = castIdsBySeason.get(String(couple.season_id));
      belongsToProgram = !!seasonCastIds
       && seasonCastIds.has(firstId)
       && seasonCastIds.has(secondId)
       && String(seasonById.get(String(couple.season_id))?.program_id ?? '') === id;
     } else if(slug === 'mo') {
      belongsToProgram = castIds.has(firstId) || castIds.has(secondId);
     } else {
      belongsToProgram = castIds.has(firstId) && castIds.has(secondId);
     }
     if(belongsToProgram) finalCoupleCount += 1;
    }

    metricsByProgram.set(id, {
     seasons: programSeasons.length,
     cast: programCast.length,
     couples: finalCoupleCount
    });
   }

   document.querySelectorAll('.program-card[data-metrics-slug]').forEach(card => {
    const slug = String(card.dataset.metricsSlug || '').trim();
    const program = programBySlug.get(slug);
    if(!program) {
     console.warn(`[프로그램 통계] 프로그램 slug를 찾을 수 없습니다: ${slug}`);
     return;
    }
    const counts = metricsByProgram.get(String(program.id)) || {seasons:0, cast:0, couples:0};
    const values = {seasons:counts.seasons, cast:counts.cast, couples:counts.couples};
    card.querySelectorAll('[data-metric]').forEach(metric => {
     const key = metric.dataset.metric;
     if(Object.prototype.hasOwnProperty.call(values, key)) metric.textContent = String(values[key]);
    });
   });
  } catch(error) {
   console.error('[프로그램 통계] Supabase 집계 실패:', error);
  }
 }

 initProgramMetrics();

 loadNews();
})();
