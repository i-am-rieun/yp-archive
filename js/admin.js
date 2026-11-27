/* 연애도감 통합 관리자
 * Supabase 실제 public 스키마 확인 기준:
 * programs, seasons, cast_members, couples, cast_news_links, aphorisms, admin_users
 * 다시보기는 seasons.replay_name / seasons.replay_url에 저장합니다.
 * 브라우저에는 service_role 키를 두지 않습니다.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const db = window.supabaseClient;
  const state = {
    programs: [], seasons: [], cast: [], couples: [], news: [], aphorisms: [], siteVisits: null,
    auditLogs: [],
    user: null, busy: false, formsBound: false, activeTab: 'overview', authSubscription: null
  };

  const STORAGE_PAGE_SIZE = 50;
  let storageFilesCache = [];
  let storagePage = 0;
  let storageSortOrder = 'asc';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const val = (id) => String($(id)?.value ?? '').trim();
  const checked = (id) => Boolean($(id)?.checked);
  const dateValue = (id) => val(id) || null;
  const numberValue = (id) => val(id) === '' ? null : Number(val(id));
  const setValue = (id, value) => { if ($(id)) $(id).value = value ?? ''; };
  const setChecked = (id, value) => { if ($(id)) $(id).checked = Boolean(value); };

  function message(text, isError = false) {
    const el = $('globalStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', Boolean(isError));
  }
  function loginMessage(text, isError = false) {
    const el = $('loginMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', Boolean(isError));
  }
  function fail(error, prefix = '작업에 실패했습니다.') {
    console.error('[연애도감 관리자]', error);
    message(`${prefix} ${error?.message || error || ''}`, true);
  }
  function showView(signedIn, email = '') {
    $('loginView')?.classList.toggle('hidden', signedIn);
    $('dashboardView')?.classList.toggle('hidden', !signedIn);
    if ($('adminEmail')) $('adminEmail').textContent = email;
  }
  function switchTab(tab) {
    state.activeTab = tab;
    if (tab === 'storage') loadStorageFiles().catch((error) => storageMessage(error.message, true));
    if (tab === 'operations') loadOperations().catch((error) => operationsMessage(error.message, true));
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `panel-${tab}`));
  }
  function formatDate(date) {
    if (!date) return '-';
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? String(date) : parsed.toLocaleDateString('ko-KR');
  }
  function statusTag(on) {
    return `<span class="tag ${on ? 'on' : ''}">${on ? '공개' : '비공개'}</span>`;
  }
  function actionButtons(id, type) {
    return `<div class="row-actions"><button type="button" class="secondary" data-edit="${type}" data-id="${esc(id)}">수정</button><button type="button" class="secondary" data-delete="${type}" data-id="${esc(id)}">삭제</button></div>`;
  }
  function setOptions(id, items, placeholder, selected) {
    const el = $(id);
    if (!el) return;
    const current = selected !== undefined ? String(selected ?? '') : el.value;
    el.innerHTML = `<option value="">${esc(placeholder)}</option>` + items.map((item) =>
      `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('');
    if (current && items.some((item) => String(item.id) === current)) el.value = current;
  }
  const programLabel = (id) => state.programs.find((item) => String(item.id) === String(id))?.name || '프로그램 미지정';
  function seasonLabel(id) {
    const season = state.seasons.find((item) => String(item.id) === String(id));
    if (!season) return '시즌 미지정';
    const number = `${season.season_number}기`;
    return `${programLabel(season.program_id)} · ${number}${season.special_label ? ` (${season.special_label})` : ''}`;
  }
  const castLabel = (id) => state.cast.find((item) => String(item.id) === String(id))?.name || '출연자 미지정';

  async function checkAdmin(user) {
    // DB의 is_admin()은 JWT app_metadata.role='admin'을 확인합니다.
    // admin_users 조회 정책도 is_admin()을 사용하므로 두 조건을 모두 확인합니다.
    if (user?.app_metadata?.role !== 'admin') return false;
    const { data, error } = await db.from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new Error(`관리자 허용 목록 조회 실패: ${error.message}`);
    return Boolean(data && String(data.user_id) === String(user.id));
  }

  async function readTable(table, query) {
    const { data, error } = await query;
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    return data || [];
  }

  function localMidnightIso(daysAgo = 0) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
  }

  async function loadSiteVisitStats() {
    const now = new Date();
    const since7d = new Date(now);
    since7d.setDate(since7d.getDate() - 6);
    since7d.setHours(0, 0, 0, 0);
    const since30d = new Date(now);
    since30d.setDate(since30d.getDate() - 29);
    since30d.setHours(0, 0, 0, 0);
    const todayStart = localMidnightIso(0);
    const sevenDayStart = since7d.toISOString();
    const thirtyDayStart = since30d.toISOString();

    const [allCount, todayCount, sevenDayCount, thirtyDayCount] = await Promise.all([
      db.from('site_visit_logs').select('id', { count: 'exact', head: true }),
      db.from('site_visit_logs').select('id', { count: 'exact', head: true }).gte('visited_at', todayStart),
      db.from('site_visit_logs').select('id', { count: 'exact', head: true }).gte('visited_at', sevenDayStart),
      db.from('site_visit_logs').select('id', { count: 'exact', head: true }).gte('visited_at', thirtyDayStart)
    ]);
    for (const result of [allCount, todayCount, sevenDayCount, thirtyDayCount]) {
      if (result.error) throw new Error(`site_visit_logs 통계 조회 실패: ${result.error.message}`);
    }

    const recentRows = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from('site_visit_logs')
        .select('visitor_id,page_path,visited_at')
        .gte('visited_at', thirtyDayStart)
        .order('visited_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`최근 방문 기록 조회 실패: ${error.message}`);
      recentRows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    state.siteVisits = {
      total: allCount.count || 0,
      today: todayCount.count || 0,
      sevenDays: sevenDayCount.count || 0,
      thirtyDays: thirtyDayCount.count || 0,
      rows: recentRows
    };
    renderVisitStats();
  }

  function renderVisitStats() {
    const stats = state.siteVisits;
    if (!stats) return;
    const uniqueVisitors30d = new Set(stats.rows.map((row) => row.visitor_id).filter(Boolean)).size;
    const metrics = [
      ['전체 방문', stats.total], ['오늘 방문', stats.today],
      ['최근 7일 방문', stats.sevenDays], ['최근 30일 방문자', uniqueVisitors30d]
    ];
    if ($('visitMetricCards')) $('visitMetricCards').innerHTML = metrics.map(([label, count]) =>
      `<div class="metric"><strong>${Number(count).toLocaleString('ko-KR')}</strong><span>${label}</span></div>`).join('');

    const daily = new Map();
    const dayFormatter = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    for (let offset = 6; offset >= 0; offset--) {
      const day = new Date(); day.setDate(day.getDate() - offset);
      const key = dayFormatter(day);
      daily.set(key, 0);
    }
    stats.rows.forEach((row) => {
      const key = dayFormatter(new Date(row.visited_at));
      if (daily.has(key)) daily.set(key, daily.get(key) + 1);
    });
    const maxDaily = Math.max(1, ...daily.values());
    if ($('visitDailyRows')) $('visitDailyRows').innerHTML = [...daily.entries()].map(([day, count]) =>
      `<div class="visit-day"><span>${esc(day.slice(5).replace('-', '/'))}</span><div class="visit-bar-track"><i style="width:${Math.round(count / maxDaily * 100)}%"></i></div><strong>${count.toLocaleString('ko-KR')}</strong></div>`
    ).join('');

    const pages = new Map();
    stats.rows.forEach((row) => {
      const key = row.page_path || '(경로 없음)';
      if (!pages.has(key)) pages.set(key, { visits: 0, visitors: new Set() });
      const item = pages.get(key); item.visits += 1;
      if (row.visitor_id) item.visitors.add(row.visitor_id);
    });
    const popular = [...pages.entries()].sort((a, b) => b[1].visits - a[1].visits).slice(0, 10);
    if ($('visitPageRows')) $('visitPageRows').innerHTML = popular.map(([path, item]) =>
      `<tr><td>${esc(path)}</td><td>${item.visits.toLocaleString('ko-KR')}</td><td>${item.visitors.size.toLocaleString('ko-KR')}</td></tr>`
    ).join('') || '<tr><td colspan="3">최근 30일 방문 기록이 없습니다.</td></tr>';
    if ($('visitStatsNote')) $('visitStatsNote').textContent = `최근 30일 방문 기록 ${stats.thirtyDays.toLocaleString('ko-KR')}건 기준 · 방문자 수는 visitor_id 중복 제거 · ${new Date().toLocaleString('ko-KR')} 갱신`;
  }

  async function loadAll() {
    if (state.busy) return;
    state.busy = true;
    message('Supabase 데이터를 불러오는 중입니다.');
    try {
      const [programs, seasons, cast, couples, news, aphorisms] = await Promise.all([
        readTable('programs', db.from('programs').select('*').order('name')),
        readTable('seasons', db.from('seasons').select('*').order('program_id').order('season_number')),
        readTable('cast_members', db.from('cast_members').select('*').order('name')),
        readTable('couples', db.from('couples').select('*').order('created_at', { ascending: false })),
        readTable('cast_news_links', db.from('cast_news_links').select('*').order('sort_order').order('id')),
        readTable('aphorisms', db.from('aphorisms').select('*').order('sort_order').order('created_at'))
      ]);
      state.programs = programs;
      state.seasons = seasons;
      state.cast = cast;
      state.couples = couples;
      state.news = news;
      state.aphorisms = aphorisms;
      refreshSelects();
      renderAll();
      try {
        await loadSiteVisitStats();
      } catch (visitError) {
        console.error('[연애도감 관리자] 방문 통계 조회 실패', visitError);
        if ($('visitMetricCards')) $('visitMetricCards').innerHTML = '<div class="metric"><strong>조회 실패</strong><span>방문 통계</span></div>';
        if ($('visitStatsNote')) $('visitStatsNote').textContent = `방문 통계를 불러오지 못했습니다. site_visit_logs의 관리자 SELECT 권한과 RLS 정책을 확인하세요. (${visitError.message})`;
      }
      message('Supabase 데이터 조회가 완료되었습니다.');
    } catch (error) {
      fail(error, '데이터 조회에 실패했습니다. 로그인 권한, RLS 정책 및 테이블 권한을 확인하세요.');
    } finally {
      state.busy = false;
    }
  }

  function refreshSelects() {
    const programs = state.programs.map((item) => ({ id: item.id, label: item.name }));
    const seasons = state.seasons.map((item) => ({ id: item.id, label: seasonLabel(item.id) }));
    const cast = state.cast.map((item) => ({ id: item.id, label: `${item.name} · ${seasonLabel(item.season_id)}` }));
    setOptions('seasonProgram', programs, '프로그램 선택');
    setOptions('castProgram', programs, '프로그램 선택');
    setOptions('castFilterProgram', programs, '전체 프로그램');
    const selectedProgram = val('castProgram');
    setOptions('castSeason', seasons.filter((item) => {
      const season = state.seasons.find((row) => String(row.id) === String(item.id));
      return !selectedProgram || String(season?.program_id) === selectedProgram;
    }), '시즌 선택');
    refreshBroadcastRecordOptions();
    setOptions('coupleCast1', cast, '첫 번째 출연자 선택');
    setOptions('coupleCast2', cast, '두 번째 출연자 선택');
    setOptions('newsCast', cast, '출연자 미지정');
    setOptions('newsSeason', seasons, '시즌 미지정');
    setOptions('replaySeason', seasons, '시즌 선택');
    setOptions('quotesCast', cast, '출연자 선택');
  }

  function refreshBroadcastRecordOptions(values = {}) {
    const seasonId = val('castSeason');
    const editingId = val('castId');
    const roster = state.cast.filter((item) => String(item.season_id) === String(seasonId) &&
      (!editingId || String(item.id) !== String(editingId)));
    const uniqueRoster = [...new Map(roster.map((person) => [person.name, person])).values()];
    const fields = [
      ['castFirstImpression', 'first_impression'],
      ['castFirstDate', 'first_date'],
      ['castRandomDate', 'random_date'],
      ['castFinalChoice', 'final_choice']
    ];
    fields.forEach(([elementId, key]) => {
      const selected = values[key] !== undefined ? String(values[key] ?? '') : val(elementId);
      const options = uniqueRoster.map((person) => ({ id: person.name, label: person.name }));
      if (selected && !options.some((option) => option.id === selected)) {
        options.unshift({ id: selected, label: `기존 기록: ${selected}` });
      }
      setOptions(elementId, options, '선택 안 함', selected);
    });
    const status = values.final_couple_status !== undefined
      ? String(values.final_couple_status ?? '') : val('castFinalCoupleStatus');
    const statusOptions = [{ id: '성공', label: '성공' }, { id: '실패', label: '실패' }];
    if (status && !statusOptions.some((option) => option.id === status)) {
      statusOptions.unshift({ id: status, label: `기존 기록: ${status}` });
    }
    setOptions('castFinalCoupleStatus', statusOptions, '선택 안 함', status);
  }

  function normalizeHttps(value) {
    const input = String(value ?? '').trim();
    if (!input || input.toLowerCase() === 'https://') return '';
    if (/^https?:\/\//i.test(input)) return input;
    return `https://${input.replace(/^\/+/, '')}`;
  }

  function renderOverview() {
    const unpublishedPrograms = state.programs.filter((item) => !item.is_published).length;
    const unpublishedSeasons = state.seasons.filter((item) => !item.is_published).length;
    const unpublishedCast = state.cast.filter((item) => !item.is_published).length;
    const unpublishedNews = state.news.filter((item) => !item.is_published).length;
    const metrics = [
      ['프로그램', state.programs.length], ['시즌', state.seasons.length],
      ['출연자', state.cast.length], ['커플', state.couples.length],
      ['뉴스 링크', state.news.length], ['명언 문구', state.aphorisms.length],
      ['공개 출연자', state.cast.filter((item) => item.is_published).length],
      ['현재 관계', state.couples.filter((item) => item.is_current_couple && !item.is_former_couple).length]
    ];
    if ($('overviewCards')) $('overviewCards').innerHTML = metrics.map(([name, count]) =>
      `<div class="metric"><strong>${Number(count).toLocaleString('ko-KR')}</strong><span>${name}</span></div>`).join('');

    if ($('overviewProgramRows')) {
      $('overviewProgramRows').innerHTML = state.programs.map((program) => {
        const seasons = state.seasons.filter((item) => String(item.program_id) === String(program.id));
        const seasonIds = new Set(seasons.map((item) => String(item.id)));
        const cast = state.cast.filter((item) => seasonIds.has(String(item.season_id)));
        const castIds = new Set(cast.map((item) => String(item.id)));
        const couples = state.couples.filter((item) => castIds.has(String(item.cast1_id)) || castIds.has(String(item.cast2_id)));
        return `<tr><td><strong>${esc(program.name)}</strong><br><small>${esc(program.slug)}</small></td><td>${statusTag(program.is_published)}</td><td>${seasons.length.toLocaleString('ko-KR')}</td><td>${cast.length.toLocaleString('ko-KR')}</td><td>${couples.length.toLocaleString('ko-KR')}</td></tr>`;
      }).join('') || '<tr><td colspan="5">등록된 프로그램이 없습니다.</td></tr>';
    }

    const alerts = [
      { label: '비공개 프로그램', count: unpublishedPrograms, tab: 'programs' },
      { label: '비공개 시즌', count: unpublishedSeasons, tab: 'seasons' },
      { label: '비공개 출연자', count: unpublishedCast, tab: 'cast' },
      { label: '비공개 뉴스 링크', count: unpublishedNews, tab: 'news' },
      { label: '프로필 이미지 미등록', count: state.cast.filter((item) => !item.profile_image_url).length, tab: 'cast' },
      { label: '소개 미등록', count: state.cast.filter((item) => !String(item.introduction || '').trim()).length, tab: 'cast' },
      { label: '다시보기 링크 미등록 시즌', count: state.seasons.filter((item) => !item.replay_url).length, tab: 'replay' },
      { label: '관계 상태 미확인 커플', count: state.couples.filter((item) => !item.relationship_status || item.relationship_status === 'unknown').length, tab: 'couples' }
    ];
    if ($('overviewAlerts')) {
      $('overviewAlerts').innerHTML = alerts.map((item) =>
        `<button type="button" class="dashboard-alert" data-go-tab="${item.tab}"><span>${esc(item.label)}</span><strong class="${item.count ? 'needs-check' : 'all-clear'}">${item.count.toLocaleString('ko-KR')}</strong></button>`
      ).join('');
    }

    const recent = [];
    const addRecent = (items, type, tab, labelFn) => items.forEach((item) => {
      const date = item.updated_at || item.created_at || null;
      if (!date) return;
      recent.push({ type, tab, label: labelFn(item), date, id: item.id });
    });
    addRecent(state.programs, '프로그램', 'programs', (item) => item.name);
    addRecent(state.seasons, '시즌', 'seasons', (item) => seasonLabel(item.id));
    addRecent(state.cast, '출연자', 'cast', (item) => `${item.name} · ${seasonLabel(item.season_id)}`);
    addRecent(state.couples, '커플', 'couples', (item) => `${castLabel(item.cast1_id)} ♥ ${castLabel(item.cast2_id)}`);
    addRecent(state.news, '뉴스', 'news', (item) => item.title || item.url);
    addRecent(state.aphorisms, '명언', 'aphorisms', (item) => item.content);
    recent.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if ($('overviewRecentRows')) {
      $('overviewRecentRows').innerHTML = recent.slice(0, 8).map((item) =>
        `<tr><td>${esc(item.type)}</td><td>${esc(item.label)}</td><td>${esc(new Date(item.date).toLocaleString('ko-KR'))}</td><td><button type="button" class="secondary mini-button" data-go-tab="${item.tab}">관리</button></td></tr>`
      ).join('') || '<tr><td colspan="4">최근 변경 기록이 없습니다.</td></tr>';
    }
  }
  function renderPrograms() {
    $('programRows').innerHTML = state.programs.map((item) =>
      `<tr><td>${esc(item.name)}</td><td>${esc(item.slug)}</td><td>${statusTag(item.is_published)}</td><td>${actionButtons(item.id, 'program')}</td></tr>`).join('') || '<tr><td colspan="4">등록된 프로그램이 없습니다.</td></tr>';
  }
  function renderSeasons() {
    $('seasonRows').innerHTML = state.seasons.map((item) =>
      `<tr><td>${esc(programLabel(item.program_id))}</td><td>${esc(item.season_number)}기</td><td>${esc(item.special_label || '-')}</td><td>${formatDate(item.broadcast_start_date)} ~ ${formatDate(item.broadcast_end_date)}</td><td>${statusTag(item.is_published)}</td><td>${actionButtons(item.id, 'season')}</td></tr>`).join('') || '<tr><td colspan="6">등록된 시즌이 없습니다.</td></tr>';
  }
  function renderCast() {
    const query = val('castSearch').toLocaleLowerCase('ko-KR');
    const programId = val('castFilterProgram');
    const rows = state.cast.filter((item) => {
      const season = state.seasons.find((row) => String(row.id) === String(item.season_id));
      return (!programId || String(season?.program_id) === programId) &&
        (!query || String(item.name || '').toLocaleLowerCase('ko-KR').includes(query));
    });
    $('castRows').innerHTML = rows.map((item) =>
      `<tr><td>${esc(seasonLabel(item.season_id))}</td><td>${esc(item.name)}</td><td>${esc(item.gender || '-')}</td><td>${esc(item.occupation_original || '-')}</td><td>${statusTag(item.is_published)}</td><td>${actionButtons(item.id, 'cast')}</td></tr>`).join('') || '<tr><td colspan="6">검색 결과가 없습니다.</td></tr>';
  }
  function coupleScope(couple) {
    const one = state.cast.find((item) => String(item.id) === String(couple.cast1_id));
    const two = state.cast.find((item) => String(item.id) === String(couple.cast2_id));
    const seasonOne = state.seasons.find((item) => String(item.id) === String(one?.season_id));
    const seasonTwo = state.seasons.find((item) => String(item.id) === String(two?.season_id));
    let relation = 'unknown';
    if (one && two && seasonOne && seasonTwo) {
      relation = String(seasonOne.program_id) !== String(seasonTwo.program_id) ? 'cross-program' :
        String(one.season_id) !== String(two.season_id) ? 'cross-season' : 'same';
    }
    return { one, two, seasonOne, seasonTwo, relation };
  }
  function renderCouples() {
    const query = val('coupleSearch').toLocaleLowerCase('ko-KR');
    const filter = val('coupleFilter');
    const rows = state.couples.filter((item) => {
      const scope = coupleScope(item);
      return (!filter || scope.relation === filter) &&
        (!query || `${scope.one?.name || ''} ${scope.two?.name || ''}`.toLocaleLowerCase('ko-KR').includes(query));
    });
    $('coupleRows').innerHTML = rows.map((item) => {
      const scope = coupleScope(item);
      const types = [item.is_final_couple && '최종', item.is_real_couple && '현실', item.is_former_couple && '예전'].filter(Boolean).join(' · ') || '일반';
      const status = item.relationship_status === 'ongoing' ? '현재 관계 유지' : item.relationship_status === 'ended' ? '종료' : '미확인';
      return `<tr><td>${esc(scope.one?.name || '삭제된 출연자')} ♥ ${esc(scope.two?.name || '삭제된 출연자')}</td><td>${esc(seasonLabel(scope.one?.season_id))}<br>${esc(seasonLabel(scope.two?.season_id))}</td><td>${esc(types)}<br><small>${esc(item.relationship_type || '미분류')} / ${esc(status)}</small></td><td>${statusTag(item.is_published)}</td><td>${actionButtons(item.id, 'couple')}</td></tr>`;
    }).join('') || '<tr><td colspan="5">등록된 커플이 없습니다.</td></tr>';
  }
  function renderNews() {
    $('newsRows').innerHTML = state.news.map((item) =>
      `<tr><td><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title || item.url)}</a><br><small>${esc(item.publisher || '')}</small></td><td>${esc(castLabel(item.cast_member_id))}<br>${esc(seasonLabel(item.season_id))}</td><td>${formatDate(item.published_at)}</td><td>${statusTag(item.is_published)}</td><td>${actionButtons(item.id, 'news')}</td></tr>`).join('') || '<tr><td colspan="5">등록된 뉴스 링크가 없습니다.</td></tr>';
  }
  function renderReplay() {
    const rows = state.seasons.filter((item) => item.replay_url || item.replay_name);
    $('replayRows').innerHTML = rows.map((item) =>
      `<tr><td>${esc(seasonLabel(item.id))}</td><td>${esc(item.replay_name || '-')}</td><td>${item.replay_url ? `<a href="${esc(item.replay_url)}" target="_blank" rel="noopener noreferrer">링크 열기</a>` : '-'}</td><td>${actionButtons(item.id, 'replay')}</td></tr>`).join('') || '<tr><td colspan="4">등록된 다시보기 링크가 없습니다.</td></tr>';
  }
  function renderAphorisms() {
    $('aphorismRows').innerHTML = state.aphorisms.map((item) =>
      `<tr><td>${esc(item.content)}</td><td>${statusTag(item.is_active)}</td><td>${actionButtons(item.id, 'aphorism')}</td></tr>`).join('') || '<tr><td colspan="3">등록된 명언 문구가 없습니다.</td></tr>';
  }
  function renderQuotes() {
    $('quotesRows').innerHTML = state.cast.filter((item) => item.quotes != null &&
      !(Array.isArray(item.quotes) && item.quotes.length === 0)).map((item) =>
      `<tr><td>${esc(item.name)}</td><td>${esc(JSON.stringify(item.quotes).slice(0, 160))}</td><td><button type="button" class="secondary" data-edit="quotes" data-id="${esc(item.id)}">불러오기</button></td></tr>`).join('') || '<tr><td colspan="3">저장된 어록이 없습니다.</td></tr>';
  }

  function renderDataQuality() {
    const issues = [];
    const add = (type, label, item, tab, detail) => issues.push({ type, label, id: item?.id, tab, detail });
    const programIds = new Set(state.programs.map(x => String(x.id)));
    const seasonIds = new Set(state.seasons.map(x => String(x.id)));
    const castIds = new Set(state.cast.map(x => String(x.id)));
    const slugMap = new Map();
    state.programs.forEach(x => { const k=String(x.slug||'').trim().toLowerCase(); if(k){ if(slugMap.has(k)) add('중복','프로그램 slug 중복',x,'programs',k); else slugMap.set(k,x.id); } });
    state.seasons.forEach(x => { if(!programIds.has(String(x.program_id))) add('참조 오류','소속 프로그램이 없는 시즌',x,'seasons',`season_id: ${x.id}`); });
    state.cast.forEach(x => {
      if(!seasonIds.has(String(x.season_id))) add('참조 오류','소속 시즌이 없는 출연자',x,'cast',x.name||x.id);
      if(!String(x.name||'').trim()) add('필수 정보','이름이 비어 있는 출연자',x,'cast',String(x.id));
      if(!String(x.profile_image_url||'').trim()) add('누락','프로필 이미지 미등록',x,'cast',x.name||String(x.id));
      if(!String(x.introduction||'').trim()) add('누락','소개 미등록',x,'cast',x.name||String(x.id));
    });
    const pairMap = new Map();
    state.couples.forEach(x => {
      const a=String(x.cast1_id), b=String(x.cast2_id), key=[a,b].sort().join('::');
      if(!castIds.has(a)||!castIds.has(b)) add('참조 오류','연결된 출연자가 존재하지 않는 커플',x,'couples',`${castLabel(x.cast1_id)} / ${castLabel(x.cast2_id)}`);
      if(a===b) add('관계 오류','동일 출연자가 양쪽에 지정된 커플',x,'couples',castLabel(x.cast1_id));
      if(pairMap.has(key)) add('중복','동일 출연자 조합의 중복 커플',x,'couples',`${castLabel(x.cast1_id)} ♥ ${castLabel(x.cast2_id)}`); else pairMap.set(key,x.id);
      if(!x.relationship_status || x.relationship_status==='unknown') add('확인 필요','관계 상태 미확인 커플',x,'couples',`${castLabel(x.cast1_id)} ♥ ${castLabel(x.cast2_id)}`);
    });
    state.seasons.forEach(x => { if(!String(x.replay_url||'').trim()) add('누락','다시보기 링크 미등록',x,'replay',seasonLabel(x.id)); });
    const counts = ['참조 오류','중복','관계 오류','필수 정보','누락','확인 필요'].map(k=>[k,issues.filter(x=>x.type===k).length]);
    if($('qualitySummary')) $('qualitySummary').innerHTML = `<div class="metric"><strong>${issues.length.toLocaleString('ko-KR')}</strong><span>전체 점검 항목</span></div>` + counts.map(([k,v])=>`<button type="button" class="metric metric-button" data-quality-filter="${esc(k)}" ${v ? '' : 'disabled'}><strong>${v.toLocaleString('ko-KR')}</strong><span>${esc(k)}</span></button>`).join('');
    if($('qualityRows')) $('qualityRows').innerHTML = issues.length ? issues.map((x,index)=>`<button type="button" class="quality-row" id="quality-issue-${index}" data-quality-issue-type="${esc(x.type)}" data-go-tab="${x.tab}"><span><b>${esc(x.type)}</b> ${esc(x.label)}<small>${esc(x.detail)}</small></span><span class="quality-open">관리 화면 →</span></button>`).join('') : '<p class="quality-clear">검사한 항목에서 오류나 누락이 발견되지 않았습니다.</p>';
  }

  const listControlIds = ['programRows','seasonRows','castRows','coupleRows','newsRows','replayRows','aphorismRows','quotesRows'];
  const listPages = Object.create(null);
  const sortableListIds = ['seasonRows', 'castRows', 'coupleRows', 'newsRows'];
  const listSorts = Object.create(null);

  function setupColumnSorting() {
    sortableListIds.forEach((bodyId) => {
      const body = $(bodyId);
      const headers = body?.closest('table')?.querySelectorAll('thead th');
      if (!headers?.length) return;
      headers.forEach((header, index) => {
        if (header.textContent.trim() === '관리') return;
        header.dataset.sortColumn = String(index);
        header.dataset.sortBody = bodyId;
        header.tabIndex = 0;
        header.setAttribute('role', 'button');
        header.setAttribute('aria-label', `${header.textContent.trim()} 기준 정렬`);
        header.dataset.sortIndicator = listSorts[bodyId]?.column === index
          ? (listSorts[bodyId].direction === 'asc' ? '▲' : '▼') : '↕';
        header.setAttribute('aria-sort', listSorts[bodyId]?.column === index
          ? (listSorts[bodyId].direction === 'asc' ? 'ascending' : 'descending') : 'none');
      });
    });
  }

  function sortListRows(bodyId) {
    const body = $(bodyId);
    const sort = listSorts[bodyId];
    if (!body || !sort) return;
    const rows = [...body.querySelectorAll('tr')].filter((row) => !row.querySelector('td[colspan]'));
    const column = Number(sort.column);
    rows.sort((a, b) => {
      const left = a.cells[column]?.textContent.trim() || '';
      const right = b.cells[column]?.textContent.trim() || '';
      const leftNumber = Number(left.replace(/,/g, ''));
      const rightNumber = Number(right.replace(/,/g, ''));
      let result;
      if (left && right && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        result = leftNumber - rightNumber;
      } else {
        result = left.localeCompare(right, 'ko-KR', { numeric: true, sensitivity: 'base' });
      }
      return result * (sort.direction === 'asc' ? 1 : -1);
    });
    rows.forEach((row) => body.appendChild(row));
  }

  function setupListControls() {
    listControlIds.forEach((bodyId) => {
      const body = $(bodyId);
      const tableWrap = body?.closest('.table-wrap');
      if (!body || !tableWrap || tableWrap.previousElementSibling?.dataset?.listControls === bodyId) return;
      const toolbar = document.createElement('div');
      toolbar.className = 'list-toolbar';
      toolbar.dataset.listControls = bodyId;
      toolbar.innerHTML = `<label class="list-search-label">목록 검색<input type="search" data-list-search="${bodyId}" placeholder="현재 목록에서 검색"></label><label class="list-size-label">페이지당 표시<select data-list-size="${bodyId}"><option value="10">10개</option><option value="25" selected>25개</option><option value="50">50개</option><option value="100">100개</option></select></label><span class="list-count" data-list-count="${bodyId}" aria-live="polite"></span><div class="list-pager"><button type="button" class="secondary" data-list-prev="${bodyId}">이전</button><span data-list-page="${bodyId}">1 / 1</span><button type="button" class="secondary" data-list-next="${bodyId}">다음</button></div>`;
      tableWrap.parentNode.insertBefore(toolbar, tableWrap);
      listPages[bodyId] = 1;
    });
  }

  function applyListControl(bodyId, resetPage = false) {
    const body = $(bodyId);
    if (!body) return;
    const toolbar = document.querySelector(`[data-list-controls="${bodyId}"]`);
    if (!toolbar) return;
    if (resetPage) listPages[bodyId] = 1;
    const query = toolbar.querySelector('[data-list-search]').value.trim().toLocaleLowerCase('ko-KR');
    const pageSize = Number(toolbar.querySelector('[data-list-size]').value) || 25;
    sortListRows(bodyId);
    const rows = [...body.querySelectorAll('tr')];
    const dataRows = rows.filter((row) => !row.querySelector('td[colspan]'));
    const matched = dataRows.filter((row) => !query || row.textContent.toLocaleLowerCase('ko-KR').includes(query));
    const totalPages = Math.max(1, Math.ceil(matched.length / pageSize));
    listPages[bodyId] = Math.min(Math.max(1, listPages[bodyId] || 1), totalPages);
    const start = (listPages[bodyId] - 1) * pageSize;
    const visible = new Set(matched.slice(start, start + pageSize));
    dataRows.forEach((row) => { row.hidden = !visible.has(row); });
    rows.filter((row) => row.querySelector('td[colspan]')).forEach((row) => { row.hidden = matched.length > 0; });
    toolbar.querySelector('[data-list-count]').textContent = `${matched.length.toLocaleString('ko-KR')}건`;
    toolbar.querySelector('[data-list-page]').textContent = `${listPages[bodyId]} / ${totalPages}`;
    toolbar.querySelector('[data-list-prev]').disabled = listPages[bodyId] <= 1;
    toolbar.querySelector('[data-list-next]').disabled = listPages[bodyId] >= totalPages;
  }

  function applyAllListControls() {
    setupListControls();
    setupColumnSorting();
    listControlIds.forEach((id) => applyListControl(id));
  }

  function renderAll() {
    renderOverview(); renderPrograms(); renderSeasons(); renderCast(); renderCouples();
    renderNews(); renderReplay(); renderAphorisms(); renderQuotes(); renderDataQuality();
    applyAllListControls();
  }

  function resetForm(formId, hiddenId) {
    $(formId)?.reset();
    if (hiddenId && $(hiddenId)) $(hiddenId).value = '';
    if (formId === 'castForm') {
      const programs = state.programs.map((item) => ({ id: item.id, label: item.name }));
      setOptions('castSeason', [], '시즌 선택', '');
      setOptions('castProgram', programs, '프로그램 선택', '');
      refreshBroadcastRecordOptions({ first_impression: '', first_date: '', random_date: '', final_choice: '', final_couple_status: '' });
    }
    if (formId === 'coupleForm') updateCoupleScope();
  }

  function editRecord(type, id) {
    const find = (list) => list.find((item) => String(item.id) === String(id));
    const program = find(state.programs), season = find(state.seasons), cast = find(state.cast);
    const couple = find(state.couples), news = find(state.news), aphorism = find(state.aphorisms);
    if (type === 'program' && program) {
      setValue('programId', program.id); setValue('programName', program.name); setValue('programSlug', program.slug);
      setValue('programDescription', program.description); setChecked('programPublished', program.is_published); switchTab('programs');
    } else if (type === 'season' && season) {
      refreshSelects(); setValue('seasonId', season.id); setValue('seasonProgram', season.program_id);
      setValue('seasonNumber', season.season_number); setValue('seasonDisplayName', season.special_label);
      setValue('seasonLocation', season.location); setValue('seasonStart', season.broadcast_start_date);
      setValue('seasonEnd', season.broadcast_end_date); setChecked('seasonPublished', season.is_published); switchTab('seasons');
    } else if (type === 'cast' && cast) {
      const ownerSeason = state.seasons.find((item) => String(item.id) === String(cast.season_id));
      setValue('castProgram', ownerSeason?.program_id); refreshSelects(); setValue('castId', cast.id);
      setValue('castProgram', ownerSeason?.program_id); setValue('castSeason', cast.season_id);
      setValue('castName', cast.name); setValue('castProfileImageUrl', cast.profile_image_url); setValue('castGender', cast.gender); setValue('castBirthYear', cast.birth_year);
      setValue('castOccupation', cast.occupation_original); setValue('castRegion', cast.region_original);
      setValue('castIntro', cast.introduction); setValue('castInstagram', cast.instagram_url);
      refreshBroadcastRecordOptions({
        first_impression: cast.first_impression, first_date: cast.first_date,
        random_date: cast.random_date, final_choice: cast.final_choice,
        final_couple_status: cast.final_couple_status
      });
      setChecked('castPublished', cast.is_published); switchTab('cast');
    } else if (type === 'couple' && couple) {
      setValue('coupleId', couple.id); setValue('coupleCast1', couple.cast1_id); setValue('coupleCast2', couple.cast2_id);
      const typeValue = couple.relationship_type || (couple.is_final_couple ? 'final_choice' : couple.is_real_couple ? 'dating' : 'unknown');
      const statusValue = couple.relationship_status || (couple.is_former_couple ? 'ended' : couple.is_current_couple ? 'ongoing' : 'unknown');
      setValue('relationshipType', typeValue); setValue('relationshipStatus', statusValue);
      setChecked('coupleFinal', couple.is_final_couple); setChecked('coupleReal', couple.is_real_couple);
      setChecked('coupleFormer', couple.is_former_couple);
      setChecked('couplePublished', couple.is_published); updateCoupleScope(); switchTab('couples');
    } else if (type === 'news' && news) {
      setValue('newsId', news.id); setValue('newsCast', news.cast_member_id); setValue('newsSeason', news.season_id);
      setValue('newsUrl', news.url); setValue('newsTitle', news.title); setValue('newsPublisher', news.publisher);
      setValue('newsDate', news.published_at); setValue('newsOrder', news.sort_order ?? 0);
      setChecked('newsPublished', news.is_published); switchTab('news');
    } else if (type === 'replay' && season) {
      setValue('replaySeason', season.id); setValue('replayName', season.replay_name); setValue('replayUrl', season.replay_url); switchTab('replay');
    } else if (type === 'aphorism' && aphorism) {
      setValue('aphorismId', aphorism.id); setValue('aphorismContent', aphorism.content);
      setChecked('aphorismActive', aphorism.is_active); switchTab('aphorisms');
    } else if (type === 'quotes' && cast) {
      setValue('quotesCast', cast.id); setValue('quotesJson', JSON.stringify(cast.quotes ?? [], null, 2)); switchTab('quotes');
    }
    document.querySelector(`#panel-${state.activeTab} .editor`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveRecord(formId, table, idField, payload) {
    const id = idField ? val(idField) : '';
    const query = id ? db.from(table).update(payload).eq('id', id) : db.from(table).insert(payload);
    const { error } = await query;
    if (error) throw error;
    resetForm(formId, idField);
    await loadAll();
    message(id ? '기존 데이터 수정이 완료되었습니다.' : '새 데이터 등록이 완료되었습니다.');
  }

  async function removeRecord(type, id) {
    if (type === 'replay') {
      if (!window.confirm('이 시즌의 다시보기 링크를 삭제하시겠습니까?')) return;
      const { error } = await db.from('seasons').update({ replay_name: null, replay_url: null }).eq('id', id);
      if (error) throw error;
      await loadAll(); message('다시보기 링크를 삭제했습니다.'); return;
    }
    const config = {
      program: ['programs', '프로그램'], season: ['seasons', '시즌'], cast: ['cast_members', '출연자'],
      couple: ['couples', '커플'], news: ['cast_news_links', '뉴스 링크'], aphorism: ['aphorisms', '명언 문구']
    }[type];
    if (!config) return;
    if (!window.confirm(`${config[1]} 데이터를 삭제하시겠습니까? 연결된 데이터가 있으면 외래 키 제약 조건으로 삭제가 거부될 수 있습니다.`)) return;
    const { error } = await db.from(config[0]).delete().eq('id', id);
    if (error) throw error;
    await loadAll(); message(`${config[1]} 데이터 삭제가 완료되었습니다.`);
  }

  function couplePayload() {
    const cast1Id = val('coupleCast1'), cast2Id = val('coupleCast2');
    if (!cast1Id || !cast2Id || cast1Id === cast2Id) throw new Error('서로 다른 출연자 두 명을 선택하세요.');
    const one = state.cast.find((item) => String(item.id) === cast1Id);
    const two = state.cast.find((item) => String(item.id) === cast2Id);
    if (!one || !two) throw new Error('선택한 출연자 정보를 찾을 수 없습니다. 새로고침 후 다시 선택하세요.');
    const seasonOne = state.seasons.find((item) => String(item.id) === String(one.season_id));
    const seasonTwo = state.seasons.find((item) => String(item.id) === String(two.season_id));
    const sameProgram = seasonOne && seasonTwo && String(seasonOne.program_id) === String(seasonTwo.program_id);
    const sameSeason = sameProgram && String(one.season_id) === String(two.season_id);
    const relationshipType = val('relationshipType');
    const selectedStatus = val('relationshipStatus');
    const relationshipStatus = checked('coupleFormer') ? 'ended' : (selectedStatus || 'unknown');
    const finalFlag = checked('coupleFinal') || relationshipType === 'final_choice';
    const realFlag = checked('coupleReal') || ['dating', 'married'].includes(relationshipType);
    const formerFlag = checked('coupleFormer') || relationshipStatus === 'ended';
    return {
      cast1_id: Number(cast1Id), cast2_id: Number(cast2Id),
      program_id: sameProgram ? Number(seasonOne.program_id) : null,
      season_id: sameSeason ? Number(one.season_id) : null,
      relationship_type: relationshipType || 'unknown',
      relationship_status: relationshipStatus || 'unknown',
      is_current_couple: relationshipStatus === 'ongoing' && !formerFlag,
      is_final_couple: finalFlag, is_real_couple: realFlag, is_former_couple: formerFlag,
      is_published: checked('couplePublished')
    };
  }

  function updateCoupleScope() {
    const one = state.cast.find((item) => String(item.id) === val('coupleCast1'));
    const two = state.cast.find((item) => String(item.id) === val('coupleCast2'));
    const seasonOne = state.seasons.find((item) => String(item.id) === String(one?.season_id));
    const seasonTwo = state.seasons.find((item) => String(item.id) === String(two?.season_id));
    let text = '출연자를 선택하면 프로그램과 시즌 범위를 자동 판정합니다.';
    if (one && two && seasonOne && seasonTwo) {
      if (String(seasonOne.program_id) !== String(seasonTwo.program_id)) text = '서로 다른 프로그램 간 커플입니다. 프로그램·시즌 범위는 NULL로 저장됩니다.';
      else if (String(one.season_id) !== String(two.season_id)) text = '동일 프로그램 · 다른 시즌 커플입니다. 프로그램만 연결하고 시즌 범위는 NULL로 저장됩니다.';
      else text = '동일 프로그램 · 동일 시즌 커플입니다. 프로그램과 시즌을 모두 연결합니다.';
    }
    if ($('coupleScopeNote')) $('coupleScopeNote').textContent = text;
  }

  function storageMessage(text, isError = false) {
    const el = $('storageStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', Boolean(isError));
  }

  function storageBucket() { return 'cast-profiles'; }

  function storagePath() {
    return val('storageFolder').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
  }

  async function loadStorageFiles() {
    if (!db?.storage) throw new Error('Supabase Storage 클라이언트를 사용할 수 없습니다.');
    const folder = storagePath();
    const bucket = storageBucket();
    const allItems = [];
    const batchSize = 1000;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await db.storage.from(bucket).list(folder, {
        limit: batchSize, offset, sortBy: { column: 'name', order: 'asc' }
      });
      if (error) throw error;
      const batch = data || [];
      allItems.push(...batch.filter((item) => item.id || item.metadata));
      if (batch.length < batchSize) break;
    }
    storageFilesCache = allItems;
    await renderStorageFiles();
  }

  async function renderStorageFiles() {
    const folder = storagePath();
    const bucket = storageBucket();
    const sortedFiles = [...storageFilesCache].sort((a, b) => {
      const result = String(a.name || '').localeCompare(String(b.name || ''), 'ko', {
        numeric: true, sensitivity: 'base'
      });
      return storageSortOrder === 'asc' ? result : -result;
    });
    const total = sortedFiles.length;
    const pageCount = Math.max(1, Math.ceil(total / STORAGE_PAGE_SIZE));
    storagePage = Math.min(storagePage, pageCount - 1);
    const start = storagePage * STORAGE_PAGE_SIZE;
    const pageFiles = sortedFiles.slice(start, start + STORAGE_PAGE_SIZE);

    $('storageSummary').textContent = `${bucket} / ${folder || '루트'} · 전체 파일 ${total.toLocaleString('ko-KR')}개 · ${total ? `${start + 1}-${start + pageFiles.length}개 표시` : '표시할 파일 없음'}`;
    if ($('storagePageInfo')) $('storagePageInfo').textContent = `${storagePage + 1} / ${pageCount} 페이지`;
    if ($('storagePrev')) $('storagePrev').disabled = storagePage <= 0;
    if ($('storageNext')) $('storageNext').disabled = storagePage >= pageCount - 1;
    if ($('storageSortToggle')) {
      $('storageSortToggle').textContent = `파일명 ${storageSortOrder === 'asc' ? '오름차순 ↑' : '내림차순 ↓'}`;
      $('storageSortToggle').setAttribute('aria-label', `파일명 ${storageSortOrder === 'asc' ? '오름차순' : '내림차순'} 정렬 중. 클릭하여 전환`);
    }

    const displayFiles = await Promise.all(pageFiles.map(async (file) => {
      const path = [folder, file.name].filter(Boolean).join('/');
      const image = /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(file.name);
      const previewUrl = image
        ? db.storage.from(bucket).getPublicUrl(path).data?.publicUrl || ''
        : '';
      return { file, path, image, previewUrl };
    }));
    $('storageRows').innerHTML = displayFiles.length ? displayFiles.map(({file,path,image,previewUrl}) => {
      const size = Number(file.metadata?.size || 0);
      const preview = image && previewUrl
        ? `<img src="${esc(previewUrl)}" alt="${esc(file.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'미리보기 불가'}))">`
        : `<span>${image ? '미리보기 불가' : '파일'}</span>`;
      return `<article class="storage-item"><div class="storage-preview ${image ? 'is-image' : ''}">${preview}</div><div class="storage-meta"><strong>${esc(file.name)}</strong><small>${size ? `${(size / 1024).toFixed(1)} KB` : '크기 정보 없음'} · ${esc(file.updated_at || file.created_at || '')}</small><code>${esc(path)}</code></div><div class="row-actions"><button type="button" class="secondary" data-storage-open="${esc(path)}">열기</button><button type="button" class="secondary" data-storage-delete="${esc(path)}">삭제</button></div></article>`;
    }).join('') : '<p class="empty-note">표시할 파일이 없습니다.</p>';
    storageMessage('파일 목록을 불러왔습니다.');
  }

  async function uploadStorageFiles() {
    const input = $('storageUpload');
    const files = Array.from(input?.files || []);
    if (!files.length) throw new Error('업로드할 파일을 선택하세요.');
    const bucket = storageBucket();
    if (bucket === 'cast-profiles') {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      const invalid = files.find((file) => !allowed.includes(file.type) || file.size > 5 * 1024 * 1024);
      if (invalid) throw new Error(`${invalid.name}: cast-profiles는 JPG·PNG·WebP, 파일당 5MB 이하만 허용합니다.`);
    }
    const folder = storagePath();
    for (const file of files) {
      const path = [folder, file.name].filter(Boolean).join('/');
      const { error } = await db.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw new Error(`${file.name}: ${error.message}`);
    }
    input.value = '';
    storagePage = 0;
    await loadStorageFiles();
    storageMessage(`${files.length}개 파일을 업로드했습니다.`);
  }

  async function openStorageFile(path) {
    const { data } = db.storage.from('cast-profiles').getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('파일의 공개 URL을 확인할 수 없습니다.');
    window.open(data.publicUrl, '_blank', 'noopener,noreferrer');
  }

  async function deleteStorageFile(path) {
    if (!window.confirm(`다음 파일을 영구 삭제합니다.\n${path}\n\n계속하시겠습니까?`)) return;
    storageMessage(`파일 삭제 중: ${path}`);

    const { data: sessionData, error: sessionError } = await db.auth.refreshSession();
    if (sessionError) throw new Error(`로그인 세션 확인 실패: ${sessionError.message}`);
    if (!sessionData?.session) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인하세요.');

    const { data, error } = await db.storage.from(storageBucket()).remove([path]);
    if (error) throw new Error(`파일 삭제 실패: ${error.message}`);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('삭제된 파일이 확인되지 않았습니다. 관리자 권한 또는 파일 경로를 확인하세요.');
    }

    await loadStorageFiles();
    storageMessage(`파일 삭제 완료: ${path}`);
  }

  function operationsMessage(text, isError = false) {
    const el = $('operationsStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', Boolean(isError));
  }

  function auditChangedFields(row) {
    const before = row.old_data || {};
    const after = row.new_data || {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    return changed.length ? changed.slice(0, 8).join(', ') + (changed.length > 8 ? ` 외 ${changed.length - 8}개` : '') : '-';
  }

  function renderAuditLogs() {
    const rows = state.auditLogs || [];
    $('auditLogRows').innerHTML = rows.length ? rows.map((row) => {
      const before = row.old_data ? JSON.stringify(row.old_data, null, 2) : '없음';
      const after = row.new_data ? JSON.stringify(row.new_data, null, 2) : '없음';
      return `<tr><td>${esc(row.changed_at ? new Date(row.changed_at).toLocaleString('ko-KR') : '-')}</td><td>${esc(row.table_name)}</td><td><code>${esc(row.record_id || '-')}</code></td><td>${esc(row.action)}</td><td><details class="audit-detail"><summary>${esc(auditChangedFields(row))}</summary><strong>변경 전</strong><pre>${esc(before)}</pre><strong>변경 후</strong><pre>${esc(after)}</pre></details></td><td><code>${esc(row.changed_by || '시스템/확인 불가')}</code></td></tr>`;
    }).join('') : '<tr><td colspan="6">기록된 변경 이력이 없습니다.</td></tr>';
    $('auditLogSummary').textContent = `최근 ${rows.length}건 표시 · 과거 변경 내역은 기록 시작 시점부터 확인할 수 있습니다.`;
  }

  async function loadOperations() {
    if (!db) throw new Error('Supabase 클라이언트를 사용할 수 없습니다.');
    const { data, error } = await db.from('admin_audit_logs')
      .select('id,table_name,record_id,action,changed_by,changed_at,old_data,new_data')
      .order('changed_at', { ascending: false }).limit(100);
    if (error) throw new Error(`변경 이력 조회 실패: ${error.message}`);
    state.auditLogs = data || [];
    renderAuditLogs();
    operationsMessage('데이터 변경 이력을 새로고침했습니다.');
  }

  function downloadDataBackup() {
    const payload = {
      format: 'yeonpodo-gam-admin-backup',
      version: 1,
      exported_at: new Date().toISOString(),
      exported_by: state.user?.email || null,
      source: 'Supabase public tables via authenticated admin session',
      tables: {
        programs: state.programs,
        seasons: state.seasons,
        cast_members: state.cast,
        couples: state.couples,
        cast_news_links: state.news,
        aphorisms: state.aphorisms
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `yeonpodo-admin-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const status = $('backupStatus');
    if (status) status.textContent = '현재 화면에 조회된 데이터의 JSON 백업 다운로드를 시작했습니다.';
  }

  function bindForms() {
    if (state.formsBound) return;
    state.formsBound = true;

    $('programForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const slug = val('programSlug').toLowerCase();
        if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('slug는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.');
        await saveRecord('programForm', 'programs', 'programId', {
          name: val('programName'), slug, description: val('programDescription') || null,
          is_published: checked('programPublished')
        });
      } catch (error) { fail(error, '프로그램 저장 실패:'); }
    });
    $('seasonForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const start = dateValue('seasonStart'), end = dateValue('seasonEnd');
        if (start && end && end < start) throw new Error('방영 종료일은 시작일보다 빠를 수 없습니다.');
        await saveRecord('seasonForm', 'seasons', 'seasonId', {
          program_id: Number(val('seasonProgram')), season_number: numberValue('seasonNumber'),
          special_label: val('seasonDisplayName') || null, location: val('seasonLocation') || null,
          broadcast_start_date: start, broadcast_end_date: end, is_published: checked('seasonPublished')
        });
      } catch (error) { fail(error, '시즌 저장 실패:'); }
    });
    $('castForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const season = state.seasons.find((item) => String(item.id) === val('castSeason'));
        if (!season || String(season.program_id) !== val('castProgram')) throw new Error('선택한 프로그램에 속한 시즌을 선택하세요.');
        const birthYear = numberValue('castBirthYear');
        if (birthYear !== null && (birthYear < 0 || birthYear > new Date().getFullYear())) throw new Error('출생년도를 확인하세요.');
        await saveRecord('castForm', 'cast_members', 'castId', {
          season_id: Number(val('castSeason')), name: val('castName'), profile_image_url: val('castProfileImageUrl') || null, gender: val('castGender') || null,
          birth_year: birthYear, occupation_original: val('castOccupation') || null,
          region_original: val('castRegion') || null, introduction: val('castIntro') || null,
          instagram_url: normalizeHttps(val('castInstagram')) || null,
          first_impression: val('castFirstImpression') || null,
          first_date: val('castFirstDate') || null,
          random_date: val('castRandomDate') || null,
          final_choice: val('castFinalChoice') || null,
          final_couple_status: val('castFinalCoupleStatus') || null,
          is_published: checked('castPublished')
        });
      } catch (error) { fail(error, '출연자 저장 실패:'); }
    });
    $('coupleForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await saveRecord('coupleForm', 'couples', 'coupleId', couplePayload()); }
      catch (error) { fail(error, '커플 저장 실패:'); }
    });
    $('newsForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const url = normalizeHttps(val('newsUrl'));
        if (!/^https?:\/\/[^\s.]+(?:\.[^\s.]+)+(?:[/:?#][^\s]*)?$/i.test(url)) throw new Error('올바른 뉴스 URL을 입력하세요.');
        const castId = val('newsCast'), seasonId = val('newsSeason');
        if (castId && seasonId) {
          const cast = state.cast.find((item) => String(item.id) === castId);
          if (cast && String(cast.season_id) !== seasonId) throw new Error('출연자와 시즌의 소속이 다릅니다. 연결 대상을 확인하세요.');
        }
        await saveRecord('newsForm', 'cast_news_links', 'newsId', {
          cast_member_id: castId ? Number(castId) : null, season_id: seasonId ? Number(seasonId) : null,
          url, title: val('newsTitle') || null, publisher: val('newsPublisher') || null,
          published_at: dateValue('newsDate'), sort_order: numberValue('newsOrder') ?? 0,
          is_published: checked('newsPublished')
        });
      } catch (error) { fail(error, '뉴스 링크 저장 실패:'); }
    });
    $('replayForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const seasonId = val('replaySeason'), url = normalizeHttps(val('replayUrl'));
        if (!seasonId) throw new Error('시즌을 선택하세요.');
        if (url && !/^https?:\/\/[^\s.]+(?:\.[^\s.]+)+(?:[/:?#][^\s]*)?$/i.test(url)) throw new Error('올바른 다시보기 URL을 입력하세요.');
        const { error } = await db.from('seasons').update({ replay_name: val('replayName') || null, replay_url: url || null }).eq('id', seasonId);
        if (error) throw error;
        resetForm('replayForm'); await loadAll(); message('다시보기 링크 저장이 완료되었습니다.');
      } catch (error) { fail(error, '다시보기 링크 저장 실패:'); }
    });
    $('aphorismForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await saveRecord('aphorismForm', 'aphorisms', 'aphorismId', { content: val('aphorismContent'), is_active: checked('aphorismActive') }); }
      catch (error) { fail(error, '명언 저장 실패:'); }
    });
    $('quotesForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const castId = val('quotesCast');
        if (!castId) throw new Error('출연자를 선택하세요.');
        let quotes;
        try { quotes = JSON.parse(val('quotesJson')); } catch { throw new Error('어록 JSON 문법을 확인하세요.'); }
        if (quotes === null || typeof quotes !== 'object') throw new Error('어록은 배열 또는 객체 JSON이어야 합니다.');
        const { error } = await db.from('cast_members').update({ quotes }).eq('id', castId);
        if (error) throw error;
        await loadAll(); message('출연자 어록 저장이 완료되었습니다.');
      } catch (error) { fail(error, '어록 저장 실패:'); }
    });

    $('loadQuotes').addEventListener('click', () => {
      const cast = state.cast.find((item) => String(item.id) === val('quotesCast'));
      $('quotesJson').value = cast ? JSON.stringify(cast.quotes ?? [], null, 2) : '';
      if (!cast) message('출연자를 선택하세요.', true);
    });
    $('castProgram').addEventListener('change', () => {
      const options = state.seasons.filter((item) => String(item.program_id) === val('castProgram'))
        .map((item) => ({ id: item.id, label: seasonLabel(item.id) }));
      setOptions('castSeason', options, '시즌 선택', '');
      ['castFirstImpression', 'castFirstDate', 'castRandomDate', 'castFinalChoice', 'castFinalCoupleStatus']
        .forEach((id) => setValue(id, ''));
      refreshBroadcastRecordOptions();
    });
    $('castSeason').addEventListener('change', () => {
      ['castFirstImpression', 'castFirstDate', 'castRandomDate', 'castFinalChoice', 'castFinalCoupleStatus']
        .forEach((id) => setValue(id, ''));
      refreshBroadcastRecordOptions();
    });
    $('castInstagram').addEventListener('focus', () => {
      if (!val('castInstagram')) setValue('castInstagram', 'https://');
    });
    $('castInstagram').addEventListener('blur', () => {
      setValue('castInstagram', normalizeHttps(val('castInstagram')));
    });
    ['newsUrl', 'replayUrl'].forEach((id) => {
      const input = $(id);
      if (!input) return;
      input.addEventListener('focus', () => {
        if (!val(id)) setValue(id, 'https://');
      });
      input.addEventListener('blur', () => setValue(id, normalizeHttps(val(id))));
    });
    $('castSearch').addEventListener('input', () => { renderCast(); applyListControl('castRows', true); });
    $('castFilterProgram').addEventListener('change', () => { renderCast(); applyListControl('castRows', true); });
    $('coupleSearch').addEventListener('input', () => { renderCouples(); applyListControl('coupleRows', true); });
    $('coupleFilter').addEventListener('change', () => { renderCouples(); applyListControl('coupleRows', true); });
    setupListControls();
    const changeListSort = (header) => {
      if (!header?.dataset.sortBody) return;
      const bodyId = header.dataset.sortBody;
      const column = Number(header.dataset.sortColumn);
      const current = listSorts[bodyId];
      listSorts[bodyId] = { column, direction: current?.column === column && current.direction === 'asc' ? 'desc' : 'asc' };
      setupColumnSorting();
      applyListControl(bodyId, true);
    };
    document.addEventListener('keydown', (event) => {
      const header = event.target.closest('th[data-sort-body]');
      if (header && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        changeListSort(header);
      }
    });
    document.addEventListener('input', (event) => {
      const search = event.target.closest('[data-list-search]');
      if (search) applyListControl(search.dataset.listSearch, true);
    });
    document.addEventListener('change', (event) => {
      const size = event.target.closest('[data-list-size]');
      if (size) applyListControl(size.dataset.listSize, true);
    });
    document.addEventListener('click', (event) => {
      const header = event.target.closest('th[data-sort-body]');
      if (header) { changeListSort(header); return; }
      const prev = event.target.closest('[data-list-prev]');
      const next = event.target.closest('[data-list-next]');
      const id = prev?.dataset.listPrev || next?.dataset.listNext;
      if (!id) return;
      listPages[id] = Math.max(1, (listPages[id] || 1) + (prev ? -1 : 1));
      applyListControl(id);
    });
    $('coupleCast1').addEventListener('change', updateCoupleScope);
    $('coupleCast2').addEventListener('change', updateCoupleScope);
    $('refreshAll').addEventListener('click', loadAll);
    $('storageRefresh')?.addEventListener('click', () => loadStorageFiles().catch((error) => storageMessage(error.message, true)));
    $('refreshOperations')?.addEventListener('click', () => loadOperations().catch((error) => operationsMessage(error.message, true)));
    $('downloadDataBackup')?.addEventListener('click', downloadDataBackup);
    $('refreshAuditLogs')?.addEventListener('click', () => loadOperations().catch((error) => operationsMessage(error.message, true)));
    $('storageUploadButton')?.addEventListener('click', () => uploadStorageFiles().catch((error) => storageMessage(error.message, true)));
    $('storageFolder')?.addEventListener('change', () => {
      storagePage = 0;
      loadStorageFiles().catch((error) => storageMessage(error.message, true));
    });
    $('storageSortToggle')?.addEventListener('click', () => {
      storageSortOrder = storageSortOrder === 'asc' ? 'desc' : 'asc';
      storagePage = 0;
      renderStorageFiles().catch((error) => storageMessage(error.message, true));
    });
    $('storagePrev')?.addEventListener('click', () => {
      if (storagePage <= 0) return;
      storagePage -= 1;
      renderStorageFiles().catch((error) => storageMessage(error.message, true));
    });
    $('storageNext')?.addEventListener('click', () => {
      const pageCount = Math.max(1, Math.ceil(storageFilesCache.length / STORAGE_PAGE_SIZE));
      if (storagePage >= pageCount - 1) return;
      storagePage += 1;
      renderStorageFiles().catch((error) => storageMessage(error.message, true));
    });
    document.addEventListener('click', (event) => {
      const open = event.target.closest('[data-storage-open]');
      const remove = event.target.closest('[data-storage-delete]');
      if (open) openStorageFile(open.dataset.storageOpen).catch((error) => storageMessage(error.message, true));
      if (remove) deleteStorageFile(remove.dataset.storageDelete).catch((error) => storageMessage(error.message, true));
    });
    $('runQualityCheck')?.addEventListener('click', renderDataQuality);
    $('qualitySummary')?.addEventListener('click', (event) => {
      const metric = event.target.closest('[data-quality-filter]');
      if (!metric || metric.disabled) return;
      const type = metric.dataset.qualityFilter;
      const rows = [...document.querySelectorAll('[data-quality-issue-type]')];
      rows.forEach((row) => { row.hidden = row.dataset.qualityIssueType !== type; });
      document.querySelectorAll('[data-quality-filter]').forEach((button) => button.classList.toggle('is-selected', button === metric));
      const first = rows.find((row) => row.dataset.qualityIssueType === type);
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        first.focus({ preventScroll: true });
      }
    });
    $('overviewRecentRefresh')?.addEventListener('click', loadAll);
    $('overviewVisitsRefresh')?.addEventListener('click', async () => {
      const button = $('overviewVisitsRefresh');
      if (button) { button.disabled = true; button.textContent = '조회 중'; }
      try { await loadSiteVisitStats(); }
      catch (error) { if ($('visitStatsNote')) $('visitStatsNote').textContent = `방문 통계 조회 실패: ${error.message}`; }
      finally { if (button) { button.disabled = false; button.textContent = '통계 새로고침'; } }
    });
    document.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go-tab]');
      if (go) switchTab(go.dataset.goTab);
    });
    $('cancelProgram').addEventListener('click', () => resetForm('programForm', 'programId'));
    $('cancelSeason').addEventListener('click', () => resetForm('seasonForm', 'seasonId'));
    $('cancelCast').addEventListener('click', () => resetForm('castForm', 'castId'));
    $('cancelCouple').addEventListener('click', () => resetForm('coupleForm', 'coupleId'));
    $('cancelNews').addEventListener('click', () => resetForm('newsForm', 'newsId'));
    $('cancelReplay').addEventListener('click', () => resetForm('replayForm'));
    $('cancelAphorism').addEventListener('click', () => resetForm('aphorismForm', 'aphorismId'));
    document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    document.addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-edit]');
      const remove = event.target.closest('[data-delete]');
      if (edit) editRecord(edit.dataset.edit, edit.dataset.id);
      if (remove) {
        try { await removeRecord(remove.dataset.delete, remove.dataset.id); }
        catch (error) { fail(error, '삭제 실패:'); }
      }
    });
  }

  async function applySession(session) {
    if (!session?.user) {
      state.user = null; showView(false); return;
    }
    showView(false);
    loginMessage('관리자 권한을 확인하는 중입니다.');
    try {
      const allowed = await checkAdmin(session.user);
      if (!allowed) {
        state.user = null;
        loginMessage('로그인은 되었지만 관리자 권한이 확인되지 않았습니다. app_metadata.role=admin 및 admin_users 등록을 확인하세요.', true);
        await db.auth.signOut();
        showView(false);
        return;
      }
      state.user = session.user;
      showView(true, session.user.email || '관리자');
      loginMessage('');
      bindForms();
      await loadAll();
    } catch (error) {
      state.user = null; showView(false); fail(error, '관리자 인증 또는 데이터 초기화 실패:');
      loginMessage(error.message || '관리자 인증에 실패했습니다.', true);
    }
  }

  async function start() {
    try {
      if (!db || typeof db.from !== 'function' || !db.auth) throw new Error('Supabase 클라이언트가 없습니다. CDN 및 supabase-config.js 로드 순서를 확인하세요.');
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      await applySession(data.session);
      const { data: listener } = db.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => applySession(session), 0);
      });
      state.authSubscription = listener?.subscription || null;
    } catch (error) {
      showView(false); loginMessage(error.message || 'Supabase 초기화에 실패했습니다.', true);
      console.error('[연애도감 관리자 초기화]', error);
    }
  }

  $('loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = val('email'), password = $('password')?.value || '';
    if (!email || !password) { loginMessage('이메일과 비밀번호를 입력하세요.', true); return; }
    const button = $('loginForm').querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    loginMessage('로그인 중입니다.');
    try {
      if (!db) throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await applySession(data.session);
    } catch (error) {
      console.error('[연애도감 관리자 로그인]', error);
      loginMessage(error.message || '로그인에 실패했습니다.', true);
      showView(false);
    } finally {
      if (button) button.disabled = false;
    }
  });

  $('logoutButton')?.addEventListener('click', async () => {
    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;
      state.user = null; showView(false); loginMessage('로그아웃되었습니다.');
    } catch (error) { fail(error, '로그아웃 실패:'); }
  });

  window.addEventListener('pagehide', () => state.authSubscription?.unsubscribe?.());
  start();
})();
