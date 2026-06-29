
(() => {
  const $ = (s) => document.querySelector(s);
  const els = {
    backBtn: $('#backBtn'),
    homeView: $('#homeView'),
    resultsView: $('#resultsView'),
    placeView: $('#placeView'),
    searchForm: $('#searchForm'),
    searchInput: $('#searchInput'),
    resultsList: $('#resultsList'),
    resultMeta: $('#resultMeta'),
    placeCard: $('#placeCard'),
    homeBtnFromResults: $('#homeBtnFromResults')
  };

  const state = { view: 'home', query: '', selectedKey: null };
  let placesRaw = [];
  let places = [];
  let mapMaster = [];
  let links = [];
  let mapById = new Map();
  let linksByPlaceId = new Map();
  let linksByName = new Map();
  let aliasRecords = [];
  let aliasRecordsByPlaceId = new Map();
  let aliasRecordsByName = new Map();


  const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  const esc = (s) => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm = (s) => String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .replace(/[\s·ㆍ.,;:()\[\]{}<>"'“”‘’!?/\\|_\-]+/g,'')
    .trim();
  const text = (v) => arr(v).map(x => {
    if (Array.isArray(x)) return x.join(' ');
    if (x && typeof x === 'object') return Object.values(x).join(' ');
    return String(x ?? '');
  }).join(' ');
  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  const compact = (xs) => uniq(arr(xs).flatMap(x => arr(x)).map(x => String(x || '').trim()).filter(Boolean));
  const placeName = (p) => p.canonical_name || p.official_name || p.name || p.card_title || p.title || '';
  const featureText = (p) => text(p.feature_type || p.category || p.bmpi_feature_types || '');
  const eraText = (p) => text(p.era || p.eras || p.period || '');
  const summaryText = (p) => p.summary || p.card_body || p.biblical_places_note || p.place_meaning || '지도에서 위치를 확인할 수 있는 성경 지명입니다.';
  const refsText = (p) => text(p.bible_refs || p.references || p.refs || '');
  const gradeText = (p) => p.grade || '';

  async function loadJson(url) {
    const r = await fetch(url + '?v=release-1-0-' + Date.now(), { cache: 'reload' });
    if (!r.ok) throw new Error('load failed: ' + url);
    return await r.json();
  }

  function linkUrl(l) {
    return l.preferred_url || l.map_url || l.alternate_url || l.primary_url || l.official_url || '';
  }
  function mapUrl(m) {
    return m?.preferred_url || m?.alternate_url || m?.primary_url || m?.official_url || '';
  }

  // Hotfix #1: Map Trust
  // 지도보기는 반드시 해당 지명이 실제 표기된 direct link만 사용하고,
  // 여러 지도가 있으면 "범용 지도"보다 "구체 지도/고해상도 지도"를 우선한다.
  function directLinks(ls) {
    return arr(ls).filter(l => (['direct_visible_on_bsk_map','external_user_provided_map','external_direct_map','external_representative_map'].includes(String(l.link_type || '')) && linkUrl(l)));
  }
  function linkPriority(l, p) {
    const name = norm(p?._name || p?.official_name || p?.canonical_name || '');
    const labels = arr(l.map_labels).map(norm);
    const title = norm(l.map_title || '');
    let s = 0;

    if (labels.some(x => x === name)) s += 1000;
    else if (labels.some(x => x.includes(name) || name.includes(x))) s += 600;

    if (l.alternate_url || String(l.preferred_url || '').includes('cms.ibep-prod.com')) s += 180;
    if (title.includes(name)) s += 120;

    // 더 구체적인 사건/여정 지도 우선
    if (/바울|여행|선교|예수|예루살렘|엘리야|엘리사|여호수아|전투/.test(String(l.map_title || ''))) s += 90;

    // 범용 지도는 뒤로 보낸다.
    if (/세계|경계|지파|왕국|제국|시대|팔레스타인/.test(String(l.map_title || ''))) s -= 70;

    return s;
  }
  function sortedDirectLinksForPlace(p) {
    return directLinks(p?._links || []).sort((a,b) =>
      linkPriority(b,p) - linkPriority(a,p) ||
      String(a.map_id||'').localeCompare(String(b.map_id||''), 'ko')
    );
  }
  function trustedVisibleLinksForPlace(p) {
    const base = sortedDirectLinksForPlace(p);
    const name = norm(p?._name || p?.official_name || p?.canonical_name || '');
    const aliasKeys = [name, ...arr(p?.aliases).map(norm), ...arr(p?.search_keywords).map(norm)].filter(Boolean);

    // 1차: 지도 표기(map_labels)에 검색 지명/공식명/별칭이 실제로 들어간 링크만 신뢰
    let visible = base.filter(l => {
      const labels = arr(l.map_labels).map(norm).filter(Boolean);
      return labels.some(lb => aliasKeys.some(k => lb === k || lb.includes(k)));
    });

    // 2차: 범용 지도는 구체 지도가 하나라도 있으면 숨김
    const genericTitle = l => /세계|경계|지파|왕국|제국|시대|팔레스타인/.test(String(l.map_title || ''));
    const specific = visible.filter(l => !genericTitle(l));
    if (specific.length) visible = specific;

    // 3차: 과다 노출 방지. 상세 화면에도 최대 3개만 노출.
    return visible.slice(0, 3);
  }
  function addLinkIndex(link) {
    const pid = String(link.place_id || '').trim();
    if (pid) {
      if (!linksByPlaceId.has(pid)) linksByPlaceId.set(pid, []);
      linksByPlaceId.get(pid).push(link);
    }
    const n = norm(link.official_name);
    if (n) {
      if (!linksByName.has(n)) linksByName.set(n, []);
      linksByName.get(n).push(link);
    }
  }

  function addAliasRecordIndex(rec) {
    if (!rec || rec.searchable === false) return;
    const pid = String(rec.place_id || '').trim();
    if (pid) {
      if (!aliasRecordsByPlaceId.has(pid)) aliasRecordsByPlaceId.set(pid, []);
      aliasRecordsByPlaceId.get(pid).push(rec);
    }
    const names = compact([rec.canonical_name, rec.official_name, rec.aliases, rec.bmpi_labels, rec.place_master_aliases]);
    names.forEach(nm => {
      const k = norm(nm);
      if (!k) return;
      if (!aliasRecordsByName.has(k)) aliasRecordsByName.set(k, []);
      aliasRecordsByName.get(k).push(rec);
    });
  }

  function aliasRecordsForPlace(p) {
    const ids = arr(p._ids || p.id).map(String);
    let out = [];
    ids.forEach(id => out.push(...(aliasRecordsByPlaceId.get(id) || [])));
    const keys = [placeName(p), ...(arr(p.aliases)), ...(arr(p.bmpi_map_labels))].map(norm).filter(Boolean);
    keys.forEach(k => out.push(...(aliasRecordsByName.get(k) || [])));
    const seen = new Set();
    return out.filter(r => {
      const key = [r.place_id || '', r.canonical_name || '', compact([r.aliases, r.bmpi_labels]).join('/')].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function bmpiSearchTermsForPlace(p, ls) {
    const aliasRecs = aliasRecordsForPlace(p);
    return compact([
      placeName(p),
      p.canonical_name,
      p.official_name,
      p.bmpi_map_labels,
      ls.map(l => [l.official_name, l.map_labels]),
      aliasRecs.map(r => [r.canonical_name, r.aliases, r.bmpi_labels, r.place_master_aliases])
    ]);
  }

  function linksForPlace(p) {
    const ids = arr(p._ids || p.id).map(String);
    let out = [];
    ids.forEach(id => out.push(...(linksByPlaceId.get(id) || [])));
    const keys = [placeName(p), ...(arr(p.aliases)), ...(arr(p.search_keywords))].map(norm).filter(Boolean);
    keys.forEach(k => out.push(...(linksByName.get(k) || [])));
    const seen = new Set();
    return out.filter(l => {
      const key = [l.place_id, l.map_id, (l.map_labels||[]).join('/')].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b) => String(a.map_id||'').localeCompare(String(b.map_id||''), 'ko'));
  }

  function mergePlaces(raw) {
    const byKey = new Map();
    raw.forEach(p => {
      const key = norm(placeName(p));
      if (!key) return;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { ...p, _ids: [p.id], _sourceRecords: [p] });
      } else {
        prev._ids.push(p.id);
        prev._sourceRecords.push(p);
        // Keep richer text/metadata, but never erase existing values.
        for (const [k,v] of Object.entries(p)) {
          if (k === 'id') continue;
          if (Array.isArray(v)) prev[k] = uniq([...(arr(prev[k])), ...v]);
          else if ((prev[k] === undefined || prev[k] === null || prev[k] === '') && v) prev[k] = v;
        }
        prev.aliases = uniq([...(arr(prev.aliases)), ...(arr(p.aliases)), p.official_name, p.canonical_name, p.name].filter(Boolean));
        prev.search_keywords = uniq([...(arr(prev.search_keywords)), ...(arr(p.search_keywords))]);
      }
    });
    return [...byKey.values()].map(p => {
      const ls = directLinks(linksForPlace(p));
      p._links = ls;
      p._mapCount = ls.length;
      p._name = placeName(p);
      p._bmpiSearchTerms = bmpiSearchTermsForPlace(p, ls);
      p._bmpiSearchText = p._bmpiSearchTerms.map(text).join(' ');
      return p;
    }).sort((a,b) => (b._mapCount-a._mapCount) || a._name.localeCompare(b._name,'ko'));
  }

  function score(p, q0) {
    const q = norm(q0);
    if (!q || !p._mapCount) return 0;
    const terms = compact(p._bmpiSearchTerms || []);
    let s = 0;
    terms.forEach(t => {
      const nt = norm(t);
      if (!nt) return;
      if (nt === q) s += 1200;
      else if (nt.includes(q) || q.includes(nt)) s += 420;
    });
    s += Math.min(p._mapCount, 10) * 8;
    return s;
  }

  function search(q) {
    if (!norm(q)) return [];
    return places.map(p => ({...p, _score: score(p,q)}))
      .filter(p => p._score > 0)
      .sort((a,b) => b._score-a._score || b._mapCount-a._mapCount || a._name.localeCompare(b._name,'ko'));
  }

  function show(view, silentHash=false) {
    state.view = view;
    els.homeView.classList.toggle('hidden', view !== 'home');
    els.resultsView.classList.toggle('hidden', view !== 'results');
    els.placeView.classList.toggle('hidden', view !== 'place');
    els.backBtn.classList.toggle('hidden', view === 'home');
    if (!silentHash) {
      const hash = view === 'home' ? '#home' : view === 'results' ? '#results' : '#place/' + encodeURIComponent(state.selectedKey || '');
      if (location.hash !== hash) history.pushState({...state}, '', hash);
    }
  }
  function goHome() {
    state.query = '';
    state.selectedKey = null;
    els.searchInput.value = '';
    show('home');
  }

  function openUrl(url) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  function openFirstMap(key) {
    const p = places.find(x => x._key === key);
    const link = p && trustedVisibleLinksForPlace(p)[0];
    if (link) openUrl(linkUrl(link));
  }
  function openMapByIndex(key, idx) {
    const p = places.find(x => x._key === key);
    const list = p ? trustedVisibleLinksForPlace(p) : [];
    const link = list[Number(idx)];
    if (link) openUrl(linkUrl(link));
  }

  function mapButtonsHtml(p, limit=3) {
    const ls = trustedVisibleLinksForPlace(p);
    if (!ls.length) {
      return `<div class="map-empty">해당 지명이 실제 표기된 지도만 표시합니다.<br>표기 확인이 안 된 지도는 숨겼습니다.</div>`;
    }
    return `<div class="map-list">${ls.slice(0,limit).map((l,i) => {
      const labels = uniq(arr(l.map_labels)).join(', ');
      const url = linkUrl(l);
      const high = String(l.link_type || '').startsWith('external') ? '<span class="source-pill">외부지도</span>' : (l.alternate_url ? '<span class="source-pill">고해상도 기본</span>' : '<span class="source-pill">공식지도</span>');
      return `<button class="map-item" type="button" data-action="open-map-index" data-key="${esc(p._key)}" data-index="${i}">🗺 ${esc(l.map_title || l.map_id)} ${high}<small>${esc(l.map_id)} · ${esc(l.link_type || 'map_link')}</small>${labels ? `<span class="labels">지도표기: ${esc(labels)}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }

  function resultCard(p) {
    const hasMap = p._mapCount > 0;
    const grade = gradeText(p) ? `<span class="grade-pill">${esc(gradeText(p))}</span>` : '';
    return `<article class="result-card" data-key="${esc(p._key)}">
      <div class="result-top">
        <div class="result-emoji">📍</div>
        <div>
          <h3 class="result-title">${esc(p._name)} ${grade}</h3>
          <p class="result-sub">${esc(eraText(p) || featureText(p) || '성경 지명')}</p>
          <p class="count-line">표기 확인 지도 ${p._mapCount}개</p>
        </div>
      </div>
      <p class="result-desc">${esc(summaryText(p))}</p>
      <div class="result-actions">
        ${hasMap ? `<button class="action-btn map-btn" type="button" data-action="first-map" data-key="${esc(p._key)}">🗺 지도보기</button>` : `<button class="action-btn disabled-map" type="button" disabled>지도 준비중</button>`}
        <button class="action-btn detail-btn" type="button" data-action="detail" data-key="${esc(p._key)}">📖 상세보기</button>
      </div>
    </article>`;
  }

  function renderResults(q) {
    state.query = q;
    const rs = search(q).slice(0, 80);
    els.resultMeta.textContent = `“${q}” 검색 결과 ${rs.length}개 · 전체 장소 ${places.length}개`;
    if (!rs.length) {
      els.resultsList.innerHTML = `<article class="result-card"><h3 class="result-title">검색 결과 없음</h3><p class="result-desc">다른 표기나 짧은 지명으로 다시 검색해 보세요.</p></article>`;
    } else {
      els.resultsList.innerHTML = rs.map(resultCard).join('');
    }
    show('results');
  }

  function renderPlace(key) {
    const p = places.find(x => x._key === key);
    if (!p) return;
    state.selectedKey = key;
    const aliases = compact(p._bmpiSearchTerms || []).filter(a => norm(a) !== norm(p._name)).slice(0, 14);
    const grade = gradeText(p) ? `<span class="grade-pill">${esc(gradeText(p))}</span>` : '';
    els.placeCard.innerHTML = `<div class="place-title-row">
      <div class="emoji">📍</div>
      <div>
        <h2>${esc(p._name)} ${grade}</h2>
        <p class="result-sub">${esc(eraText(p) || featureText(p) || '성경 지명')}</p>
        <p class="count-line">표기 확인 지도 ${p._mapCount}개</p>
      </div>
    </div>
    <div class="badge-row">${aliases.map(a => `<span class="badge">${esc(a)}</span>`).join('')}</div>
    <div class="info-grid">
      <div class="info-box"><strong>한 줄 설명</strong><p>${esc(summaryText(p))}</p></div>
      <div class="info-box"><strong>지도에서 보는 의미</strong><p>${esc(p.place_meaning || p.biblical_places_note || '지도에서 위치와 주변 지명을 함께 확인하는 것이 핵심입니다.')}</p></div>
      <div class="info-box"><strong>주요 본문</strong><p>${esc(refsText(p) || '본문 연결 정보 없음')}</p></div>
      <div class="info-box"><strong>관련지도</strong>${mapButtonsHtml(p)}<p class="map-note">BMPI는 실제 표기 확인 지도만, 외부 URL은 사용자 제공/검토용으로 표시합니다.</p></div>
    </div>
    <div class="place-actions">
      ${p._mapCount ? `<button class="action-btn map-btn" type="button" data-action="first-map" data-key="${esc(p._key)}">🗺 지도보기</button>` : `<button class="action-btn disabled-map" type="button" disabled>지도 준비중</button>`}
      <button class="action-btn detail-btn" type="button" data-action="results">검색결과로</button>
    </div>`;
    show('place');
  }

  async function init() {
    try {
      const [pData, mData, lData, aData] = await Promise.all([
        loadJson('./data/places-master.json'),
        loadJson('./data/map-master.json'),
        loadJson('./data/place-map-links-master.json'),
        loadJson('./data/map-label-aliases.json')
      ]);
      placesRaw = Array.isArray(pData) ? pData : (pData.places || []);
      mapMaster = Array.isArray(mData) ? mData : (mData.maps || []);
      links = Array.isArray(lData) ? lData : (lData.links || []);
      aliasRecords = Array.isArray(aData) ? aData : (aData.records || aData.aliases || []);
      aliasRecords.forEach(addAliasRecordIndex);
      mapById = new Map(mapMaster.map(m => [String(m.map_id || m.id || '').trim(), m]));
      links = links.map(l => {
        const m = mapById.get(String(l.map_id || '').trim());
        return { ...l, map_title: l.map_title || m?.title || l.map_id, preferred_url: l.preferred_url || l.map_url || m?.preferred_url || m?.alternate_url || m?.primary_url };
      });
      links.forEach(addLinkIndex);
      places = mergePlaces(placesRaw).map((p, idx) => ({...p, _key: norm(p._name) || String(idx)}));
      places = places.map(p => {
        const visible = trustedVisibleLinksForPlace(p);
        return { ...p, _links: visible, _mapCount: visible.length };
      }).sort((a,b) => (b._mapCount-a._mapCount) || a._name.localeCompare(b._name,'ko'));
      window.CEN_BIBLEMAPS_DEBUG = { mode: 'BMPI authority QA + external + Google fallback v1.3', placesRaw: placesRaw.length, places: places.length, maps: mapMaster.length, links: links.length, aliases: aliasRecords.length, linkedPlaces: new Set(links.map(l => l.place_id)).size };
      console.log('[CEN BibleMaps v1.3-hotfix]', window.CEN_BIBLEMAPS_DEBUG);
      const stats = document.createElement('div');
      stats.className = 'search-stats';
      stats.textContent = `BMPI QA 통과 + 외부/Google fallback · 링크 ${links.length}개 · 별칭 ${aliasRecords.length}개`;
      document.querySelector('.hero-panel')?.appendChild(stats);
    } catch (e) {
      console.error(e);
      els.resultsList.innerHTML = `<article class="result-card"><h3 class="result-title">데이터 로드 실패</h3><p class="result-desc">data 폴더의 master 파일을 확인해 주세요.</p></article>`;
      show('results');
    }
  }

  els.searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const q = els.searchInput.value.trim();
    if (q) renderResults(q);
  });
  document.querySelectorAll('[data-query]').forEach(btn => btn.addEventListener('click', () => {
    els.searchInput.value = btn.dataset.query;
    renderResults(btn.dataset.query);
  }));
  els.resultsList.addEventListener('click', e => {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    if (b.dataset.action === 'first-map') openFirstMap(b.dataset.key);
    if (b.dataset.action === 'detail') renderPlace(b.dataset.key);
  });
  els.placeCard.addEventListener('click', e => {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    if (b.dataset.action === 'first-map') openFirstMap(b.dataset.key);
    if (b.dataset.action === 'open-map-index') openMapByIndex(b.dataset.key, b.dataset.index);
    if (b.dataset.action === 'results') show('results');
  });
  els.homeBtnFromResults.addEventListener('click', goHome);
  els.backBtn.addEventListener('click', () => {
    if (state.view === 'place') show('results');
    else if (state.view === 'results') goHome();
    else goHome();
  });
  window.addEventListener('popstate', () => {
    const h = location.hash || '#home';
    if (h.startsWith('#place/')) renderPlace(decodeURIComponent(h.split('/')[1] || ''));
    else if (h === '#results') show('results', true);
    else {
      els.homeView.classList.remove('hidden');
      els.resultsView.classList.add('hidden');
      els.placeView.classList.add('hidden');
      els.backBtn.classList.add('hidden');
      state.view = 'home';
    }
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
  if (!location.hash) history.replaceState({...state}, '', '#home');
  init();
})();
