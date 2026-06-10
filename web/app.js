/* 이음(EUM) 플랫폼 프론트엔드 - 의존성 없는 바닐라 JS (공공망 친화) */
const $ = (s) => document.querySelector(s);
const api = (p) => fetch(p).then(r => r.json());
const apiPost = (p) => fetch(p, {method:'POST'}).then(r => r.json());
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- 탭 전환 ---------- */
document.querySelectorAll('#nav button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('#nav button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    $('#tab-' + b.dataset.tab).classList.remove('hidden');
    if (b.dataset.tab === 'ontology') loadOntology();
    if (b.dataset.tab === 'portal') searchCatalog();
    if (b.dataset.tab === 'submission') window.initSubmissionTab();
  };
});

/* ---------- 대시보드 ---------- */
async function loadDashboard() {
  const ov = await api('/api/overview');
  const ev = await api('/api/evaluation');
  const s = ov.summary;
  $('#stats').innerHTML = [
    ['개방 데이터셋', `${s.open}/${s.datasets}`],
    ['AI-Ready 데이터', s.ai_ready + '건'],
    ['온톨로지 객체·관계', `${s.objects}·${s.links}`],
    ['입주 시군', `${s.tenants_on}/${s.tenants_total}`],
  ].map(([l, v]) => `<div class="card stat"><div class="num">${esc(v)}</div><div class="lbl">${esc(l)}</div></div>`).join('');

  $('#overall').textContent = ev.overall;
  $('#ring').style.setProperty('--p', ev.overall);
  // a.color: server-side constant (AREAS in evaluation.py), not user input
  $('#areabars').innerHTML = ev.areas.map(a => `
    <div class="abar"><div class="top"><b>${esc(a.name)}</b><span>${a.score}점 · ${a.ok}/${a.total}</span></div>
    <div class="track"><div class="fill" style="width:${a.score}%;background:${a.color}"></div></div></div>`).join('');

  $('#indicators').innerHTML = ev.areas.map(a => `
    <div class="card" style="border-top:4px solid ${a.color}">
      <h3 style="font-size:14.5px">${esc(a.name)} <span style="float:right;color:${a.color}">${a.score}점</span></h3>
      ${a.indicators.map(i => `<div class="ind">
        <div class="nm">${esc(i.name)}<small>${esc(i.desc)}</small></div>
        <div class="vl">${esc(i.value)} ${badge(i.status)}</div></div>`).join('')}
    </div>`).join('');

  const t = await api('/api/tenants');
  $('#tenants').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:7px">` +
    t.map(x => `<span class="badge ${x.onboarded ? 'b-ok' : 'b-na'}" title="${x.onboarded ? '입주' : '미입주'}">${esc(x.name)}</span>`).join('') +
    `</div><div class="note">입주 시군은 수집·품질·개방·평가대응 기능을 즉시 사용합니다.</div>`;
}
const badge = (st) => ({ok:'<span class="badge b-ok">충족</span>', warn:'<span class="badge b-warn">개선</span>', na:'<span class="badge b-na">준비</span>'}[st] || '');

/* ---------- 개방포털 ---------- */
async function searchCatalog() {
  const q = $('#q').value.trim();
  const sort = $('#sort-catalog') ? $('#sort-catalog').value : 'high_value';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('sort', sort);
  const rows = await api('/api/catalog?' + params.toString());
  $('#catalog').innerHTML = rows.length ? rows.map(d => {
    const desc = d.description ? d.description.slice(0, 80) : '';
    const kw   = d.keywords   ? d.keywords.slice(0, 30)   : '';
    return `<div class="ds" onclick="openDataset('${d.dataset_id}')">
      <h4>${esc(d.title)}</h4>
      ${desc ? `<div class="page-sub" style="margin:2px 0 6px;font-size:12.5px">${esc(desc)}${d.description.length > 80 ? '…' : ''}</div>` : ''}
      <div class="meta">${esc(d.theme)} · ${Number(d.rows).toLocaleString()}행 · ${esc(d.format)}</div>
      <div class="tags">
        ${d.is_open  ? '<span class="badge b-ok">개방</span>' : '<span class="badge b-na">비공개</span>'}
        ${d.ai_ready ? '<span class="badge b-ai">AI-Ready</span>' : ''}
        ${d.high_value ? '<span class="badge b-hv">고가치</span>' : ''}
        ${kw ? `<span class="badge b-na">${esc(kw)}${d.keywords.length > 30 ? '…' : ''}</span>` : ''}
      </div></div>`;
  }).join('') : '<div class="loading">검색 결과가 없습니다.</div>';
}

async function openDataset(id) {
  const d = await api('/api/dataset/' + id);
  const m = d.meta;
  const cols = d.preview.length ? Object.keys(d.preview[0]) : [];
  const q = d.quality;

  /* 배지 행 */
  const layerBadge = m.layer === 'gold'   ? '<span class="badge b-hv">Gold</span>'
                   : m.layer === 'silver' ? '<span class="badge b-ai">Silver</span>'
                   : m.layer             ? '<span class="badge b-na">Bronze</span>' : '';
  const badges = [
    m.is_open   ? '<span class="badge b-ok">개방</span>'     : '',
    m.ai_ready  ? '<span class="badge b-ai">AI-Ready</span>' : '',
    m.high_value? '<span class="badge b-hv">고가치</span>'    : '',
    m.format    ? `<span class="badge b-na">${esc(m.format)}</span>` : '',
    layerBadge,
  ].filter(Boolean).join(' ');

  /* DCAT 메타데이터 2열 그리드 — .ind 클래스 재사용 */
  function row(label, value) {
    return `<div class="ind"><div class="nm">${esc(label)}</div><div class="vl" style="font-size:13px;font-weight:400;color:var(--ink)">${esc(value ?? '')}</div></div>`;
  }
  const metaGrid = [
    row('발행기관',  m.publisher),
    row('주제 분류', m.theme),
    row('키워드',    m.keywords),
    row('라이선스',  m.license),
    row('형식',      m.format),
    row('규모',      `${Number(m.rows).toLocaleString()}행`),
    row('수정일',    m.updated_at),
  ].join('');

  /* 품질 진단 섹션 */
  let qualityHtml = '';
  if (q) {
    const passedBadge = q.passed
      ? '<span class="badge b-ok">기준 충족</span>'
      : '<span class="badge b-red">기준 미달</span>';
    const detailList = Array.isArray(q.detail) && q.detail.length
      ? q.detail.map(x => `<div class="ind"><div class="nm" style="font-size:12.5px">${esc(x.rule)}</div><div class="vl" style="font-size:12.5px">${esc(String(x.violations))}건</div></div>`).join('')
      : '';
    qualityHtml = `
      <h3 style="margin:18px 0 6px">품질 진단 결과</h3>
      <div class="note" style="margin:0 0 8px">규칙 ${q.rule_count}개 · 오류 ${q.errors}건 · 오류율 ${q.error_rate}% &nbsp; ${passedBadge}</div>
      ${detailList ? `<div style="margin:0 0 12px">${detailList}</div>` : ''}`;
  }

  /* 스키마 배지 */
  const schemaHtml = cols.length ? `
    <h3 style="margin:18px 0 6px">스키마 <small style="font-weight:400;color:var(--muted)">(${cols.length}개 컬럼)</small></h3>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
      ${cols.map(c => `<span class="badge b-na">${esc(c)}</span>`).join('')}
    </div>` : '';

  /* 미리보기 테이블 */
  const previewHtml = d.preview.length ? `
    <h3 style="margin:18px 0 6px">데이터 미리보기 <small style="font-weight:400;color:var(--muted)">(상위 ${d.preview.length}행)</small></h3>
    <div style="overflow:auto;max-height:320px"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${d.preview.map(r => `<tr>${cols.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';

  $('#modal-root').innerHTML = `<div class="modal" onclick="if(event.target===this)closeModal()">
    <div class="box">
      <button class="x" onclick="closeModal()">&times;</button>
      <h2>${esc(m.title)}</h2>
      <div style="margin:6px 0 14px">${badges}</div>

      <div style="border:1px solid var(--line);border-radius:10px;padding:4px 14px;margin-bottom:16px">
        ${metaGrid}
      </div>

      ${m.description ? `<h3 style="margin:0 0 6px">설명</h3><p style="margin:0 0 16px;font-size:13.5px;color:var(--ink)">${esc(m.description)}</p>` : ''}

      ${qualityHtml}
      ${schemaHtml}
      ${previewHtml}

      <div style="margin-top:20px"><button class="btn btn-o" onclick="closeModal()">닫기</button></div>
    </div></div>`;
}
const closeModal = () => $('#modal-root').innerHTML = '';

/* ---------- 품질 ---------- */
async function loadQuality() {
  const rows = await api('/api/quality');
  renderQuality(rows);
}
async function runQuality() {
  const r = await apiPost('/api/quality/run');
  renderQuality(r.results);
}
function renderQuality(rows) {
  $('#quality').innerHTML = `<table><thead><tr>
    <th>데이터셋</th><th>업무규칙</th><th class="right">점검 셀</th><th class="right">오류</th>
    <th class="right">오류율</th><th>판정</th></tr></thead><tbody>` +
    rows.map(r => `<tr>
      <td>${esc(r.dataset_id)}</td><td>${r.rule_count}개</td>
      <td class="right">${Number(r.checked).toLocaleString()}</td>
      <td class="right">${r.errors}</td>
      <td class="right">${r.error_rate}%</td>
      <td>${r.passed ? '<span class="badge b-ok">충족</span>' : '<span class="badge b-red">미달</span>'}</td>
    </tr>` +
    `<tr><td colspan="6" style="background:#f9fbff"><small style="color:#5b6b80">` +
      r.detail.map(x => `${esc(x.rule)}: ${x.violations}건`).join(' &nbsp;·&nbsp; ') +
    `</small></td></tr>`).join('') + '</tbody></table>';
}

/* ---------- 온톨로지 그래프 (의존성 없는 SVG) ---------- */
let chipsLoaded = false;
async function loadOntology() {
  if (!chipsLoaded) {
    const t = await api('/api/tenants');
    $('#sgg-chips').innerHTML = '<button onclick="drawGraph(\'\')">전체</button>' +
      t.filter(x => x.onboarded).slice(0, 9).map(x => `<button onclick="drawGraph('${esc(x.sgg_cd)}')">${esc(x.name)}</button>`).join('');
    chipsLoaded = true;
  }
  drawGraph('48121'); // 창원시 중심 기본
  loadAction();
}

async function drawGraph(sgg) {
  const g = await api('/api/ontology/graph' + (sgg ? '?sgg=' + sgg : ''));
  const svg = $('#graph');
  const W = svg.clientWidth || 600, H = 520;
  const color = {'시군':'#1457b8','청년인구':'#7b4fc4','사업체':'#e8731a','청년인프라':'#0f9d8f'};
  // 노드 한정(전체일 때 과밀 방지: 시군 노드 중심 + 연결만)
  let nodes = g.nodes, edges = g.edges;
  if (!sgg) { nodes = nodes.filter(n => n.obj_type === '시군'); }
  const idx = {}; nodes.forEach((n, i) => idx[n.obj_id] = i);
  // 원형 배치
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 70;
  nodes.forEach((n, i) => {
    const ang = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    n._x = sgg && n.obj_type === '시군' ? cx : cx + R * Math.cos(ang);
    n._y = sgg && n.obj_type === '시군' ? cy : cy + R * Math.sin(ang);
  });
  if (sgg) { // 중심-위성 배치
    const center = nodes.find(n => n.obj_type === '시군');
    const sats = nodes.filter(n => n !== center);
    if (center) { center._x = cx; center._y = cy; }
    sats.forEach((n, i) => {
      const ang = (i / sats.length) * Math.PI * 2 - Math.PI / 2;
      n._x = cx + (R - 40) * Math.cos(ang); n._y = cy + (R - 40) * Math.sin(ang);
    });
  }
  let svgEdges = '', svgNodes = '';
  edges.forEach(e => {
    const a = nodes[idx[e.src]], b = nodes[idx[e.dst]];
    if (!a || !b) return;
    const mx = (a._x + b._x) / 2, my = (a._y + b._y) / 2;
    svgEdges += `<line x1="${a._x}" y1="${a._y}" x2="${b._x}" y2="${b._y}" stroke="#c5d4e6" stroke-width="1.5"/>`;
    if (sgg) svgEdges += `<text x="${mx}" y="${my}" font-size="10" fill="#7a8aa0" text-anchor="middle">${esc(e.rel)}</text>`;
  });
  nodes.forEach(n => {
    const r = n.obj_type === '시군' ? 26 : 19;
    svgNodes += `<g><circle cx="${n._x}" cy="${n._y}" r="${r}" fill="${color[n.obj_type]||'#888'}" opacity="0.92"/>
      <text x="${n._x}" y="${n._y + r + 13}" font-size="11" font-weight="700" fill="#15233a" text-anchor="middle">${esc(n.label)}</text></g>`;
  });
  svg.innerHTML = svgEdges + svgNodes;
}

async function loadAction() {
  const r = await api('/api/ontology/action/settlement?top=10');
  $('#action').innerHTML = `<table><thead><tr><th>순위</th><th>시군</th>
    <th class="right">우선점수</th><th class="right">청년인구</th><th class="right">순이동</th><th class="right">청년센터</th></tr></thead><tbody>` +
    r.results.map(a => `<tr>
      <td><b>#${a.rank}</b></td><td>${esc(a.sigun)}</td>
      <td class="right"><b style="color:#7b4fc4">${a.priority_score}</b></td>
      <td class="right">${Number(a.youth_pop).toLocaleString()}</td>
      <td class="right" style="color:${a.net_migration < 0 ? '#d9534f' : '#1aa251'}">${a.net_migration}</td>
      <td class="right">${a.youth_centers}</td></tr>`).join('') + '</tbody></table>';
}

/* ---------- 자연어 질의 ---------- */
function loadNLSamples() {
  const categories = [
    { label: "청년인구", samples: ["창원시 청년 순유입", "경남 전체 청년 유출입"] },
    { label: "사업체·고용", samples: ["진주 사업체 현황", "경남 일자리·종사자 현황"] },
    { label: "공공시설", samples: ["거창군 청년센터", "경남 전체 공공시설"] },
  ];
  const chips = categories.flatMap(cat =>
    cat.samples.map(s => `<button class="chip-sample" data-q="${esc(s)}">[${esc(cat.label)}] ${esc(s)}</button>`)
  );
  $('#nlq-samples').innerHTML = chips.join('');
  document.querySelectorAll('.chip-sample', $('#nlq-samples')).forEach(btn => {
    btn.addEventListener('click', () => {
      $('#nlq').value = btn.dataset.q;
      runNL();
    });
  });
  // 초기 안내 메시지 설정
  $('#nlresult').innerHTML = `
    <div class="note">
      자연어로 경남 데이터를 질의하세요. 위 예시 버튼을 클릭하거나 직접 입력해 보세요.<br>
      지원 질의 유형: <span class="badge b-hv">청년인구 유출입</span>
      <span class="badge b-ai">사업체·고용</span>
      <span class="badge b-na">공공시설</span>
    </div>`;
}
async function runNL() {
  const q = $('#nlq').value.trim();
  if (!q) return;
  $('#nlresult').innerHTML = '<div class="loading">질의 중...</div>';
  const r = await api('/api/nlquery?q=' + encodeURIComponent(q));
  if (!r.intent) {
    const fallbackSamples = ['창원시 청년 순유입', '진주 사업체 현황', '거창군 청년센터'];
    const fallbackChips = fallbackSamples.map(s =>
      `<button class="chip-sample" data-q="${esc(s)}">${esc(s)}</button>`
    ).join(' ');
    $('#nlresult').innerHTML = `
      <div class="note">
        <b>의도를 해석하지 못했습니다.</b> ${esc(r.hint || '')}<br>
        아래 예시 질문으로 시작해 보세요:<br>${fallbackChips}
      </div>`;
    document.querySelectorAll('#nlresult .chip-sample').forEach(btn => {
      btn.addEventListener('click', () => {
        $('#nlq').value = btn.dataset.q;
        runNL();
      });
    });
    return;
  }
  if (!r.rows || r.rows.length === 0) {
    $('#nlresult').innerHTML = `
      <div class="note">
        <b>검색 결과가 없습니다.</b>
        <span class="badge b-hv">의도: ${esc(r.intent)}</span>
        ${r.sigun ? `<span class="badge b-ai">${esc(r.sigun)}</span>` : ''}<br>
        조건에 맞는 데이터가 없거나 아직 로드되지 않았습니다.
        <a href="#" onclick="event.preventDefault();document.querySelector('[data-tab=portal]').click()">개방포털</a>에서 데이터를 확인하세요.
      </div>`;
    return;
  }
  const cols = r.columns;
  $('#nlresult').innerHTML = `
    <div style="margin-bottom:8px"><span class="badge b-hv">의도: ${esc(r.intent)}</span>
      ${r.sigun ? `<span class="badge b-ai">${esc(r.sigun)}</span>` : ''}</div>
    <div class="sql">${esc(r.sql)}</div>
    <div style="overflow:auto;max-height:420px"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${r.rows.map(row => `<tr>${cols.map(c => `<td>${esc(row[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* ---------- init ---------- */
loadDashboard();
loadQuality();
loadNLSamples();
searchCatalog();

// ---------- 데이터 등록·관리 탭 ----------
(function () {
  const TENANT_ID = "48121"; // 데모: 창원시 고정 (로그인 미구현 단계)
  let currentMode = "agency";

  // 파일 상단에 이미 정의된 전역 $ (querySelector)를 그대로 쓰고, $all만 추가한다
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function initSubmissionTab() {
    const toggle = $("#sub-mode-toggle");
    if (!toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = "1";

    $all("button", toggle).forEach((btn) => {
      btn.addEventListener("click", () => {
        $all("button", toggle).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentMode = btn.dataset.mode;
        $("#sub-agency-view").classList.toggle("hidden", currentMode !== "agency");
        $("#sub-center-view").classList.toggle("hidden", currentMode !== "center");
        if (currentMode === "agency") renderAgencyView();
        else renderCenterView();
      });
    });

    renderAgencyView();
  }

  function renderAgencyView() {
    const root = $("#sub-agency-view");
    root.innerHTML = `
      <div class="cards c2">
        <div class="card">
          <h3>새 데이터 등록</h3>
          <form id="upload-form">
            <p><input type="file" id="upload-file" accept=".csv" required></p>
            <p><button type="submit" class="btn btn-p">업로드 &amp; 미리보기</button></p>
          </form>
          <div id="upload-result"></div>
          <form id="meta-form" class="hidden">
            <p><input type="text" name="title" placeholder="제목" required></p>
            <p><input type="text" name="description" placeholder="설명" required></p>
            <p><input type="text" name="theme" placeholder="주제(예: 인구·행정·교통)" required></p>
            <p><input type="text" name="keywords" placeholder="키워드(쉼표로 구분)" required></p>
            <p><input type="text" name="license" placeholder="라이선스(예: CC-BY)" required></p>
            <p><input type="text" name="format" placeholder="형식(예: CSV)" required></p>
            <p><button type="submit" class="btn btn-p">등록(자동 진단 실행)</button></p>
          </form>
          <div id="register-result"></div>
        </div>
        <div class="card">
          <h3>내 제출 현황</h3>
          <div id="my-submissions"></div>
        </div>
      </div>
      <div class="card" id="plan-draft-card">
        <h3>계획서 초안 생성</h3>
        <div class="chips">
          <button data-plan="open" class="btn btn-o">공공데이터 개방계획 초안</button>
          <button data-plan="quality" class="btn btn-o">품질개선계획 초안</button>
        </div>
        <pre id="plan-draft-output" class="sql"></pre>
      </div>
    `;

    let uploadedTable = null;
    let uploadedRows = 0;

    $("#upload-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileInput = $("#upload-file");
      if (!fileInput.files.length) return;
      const fd = new FormData();
      fd.append("file", fileInput.files[0]);
      fd.append("tenant_id", TENANT_ID);
      const res = await fetch("/api/submission/upload", { method: "POST", body: fd });
      const data = await res.json();
      uploadedTable = data.table_name;
      uploadedRows = data.rows;
      $("#upload-result").innerHTML =
        `<p class="note">스키마 추론 완료: ${data.rows}행, 컬럼 ${data.schema.length}개. 아래 메타정보를 입력해 등록하세요.</p>`;
      $("#meta-form").classList.remove("hidden");
    });

    $("#meta-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!uploadedTable) return;
      const fd = new FormData(e.target);
      fd.append("tenant_id", TENANT_ID);
      fd.append("table_name", uploadedTable);
      fd.append("rows", String(uploadedRows));
      const res = await fetch("/api/submission", { method: "POST", body: fd });
      const data = await res.json();
      $("#register-result").innerHTML =
        `<p class="note">등록 완료 — 자동 진단 결과: ${esc(data.quality_summary)}</p>`;
      e.target.reset();
      e.target.classList.add("hidden");
      uploadedTable = null;
      loadMySubmissions();
    });

    $all("[data-plan]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const res = await fetch(`/api/plan/draft?tenant_id=${TENANT_ID}&type=${btn.dataset.plan}`);
        const data = await res.json();
        $("#plan-draft-output").textContent = data.draft;
      });
    });

    loadMySubmissions();
  }

  async function loadMySubmissions() {
    const res = await fetch(`/api/submission?tenant_id=${TENANT_ID}`);
    const rows = await res.json();
    const root = $("#my-submissions");
    if (!rows.length) {
      root.innerHTML = '<p class="note">등록된 제출이 없습니다.</p>';
      return;
    }
    root.innerHTML = rows.map((r) => `
      <div class="ds" data-id="${r.submission_id}">
        <strong>${esc(r.title)}</strong>
        <span class="badge ${r.status === 'approved' ? 'b-ok' : r.status === 'rejected' ? 'b-na' : 'b-warn'}">${r.status}</span>
        <p>${esc(r.quality_summary || '')}</p>
      </div>
    `).join("");
    $all(".ds", root).forEach((el) => {
      el.addEventListener("click", () => openSubmissionDetail(el.dataset.id));
    });
  }

  function renderContributionRows(contribution) {
    return (contribution || []).map((c) => `
      <div class="ind">
        <div class="nm">${esc(c.name)}<small>${esc(c.note)}</small></div>
        <div class="vl">${c.contributes ? '<span class="badge b-ok">기여</span>' : '<span class="badge b-na">대기</span>'}</div>
      </div>`).join('');
  }

  async function openSubmissionDetail(submissionId) {
    const res = await fetch(`/api/submission/${submissionId}`);
    const detail = await res.json();
    const m = detail.meta;
    const modalRoot = $("#modal-root");
    const recs = detail.recommendations || [];
    const recsHtml = recs.length ? `
  <h4>품질개선 권고</h4>
  <ul>${recs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '';
    const cands = detail.ontology_candidates || [];
    const candHtml = cands.length ? `
  <h4>온톨로지 연계 후보</h4>
  <div class="chips">${cands.map((c) =>
    `<span class="badge b-hv" title="${esc(c.reason)}">${esc(c.obj_type)}</span>`
  ).join(' ')}</div>
  <p class="note">${esc(cands.map((c) => `${c.obj_type}: ${c.reason}`).join(' / '))}</p>` : '';
    modalRoot.innerHTML = `
      <div class="modal">
        <div class="box">
          <h3>${esc(m.title)}</h3>
          <p>${esc(m.description)}</p>
          <p><span class="badge ${m.status === 'approved' ? 'b-ok' : m.status === 'rejected' ? 'b-na' : 'b-warn'}">${m.status}</span> ${esc(m.quality_summary || '')}</p>
          ${m.status === 'submitted' ? `
            <p>
              <button class="btn btn-p" id="btn-approve">승인(개방)</button>
              <button class="btn btn-o" id="btn-reject">반려(보류)</button>
            </p>
            <p><input type="text" id="decision-note" placeholder="결정 메모(선택)"></p>
          ` : ''}
          <h4>AI-Ready 체크리스트 ${(function(){const aicl=detail.ai_ready_checklist||{ai_ready:false,checklist:[]};return aicl.ai_ready?'<span class="badge b-ai">AI-Ready</span>':'<span class="badge b-warn">AI-Ready 아님</span>';})()}</h4>
          <div>${(function(){const aicl=detail.ai_ready_checklist||{ai_ready:false,checklist:[]};return aicl.checklist.map((c)=>`<div class="ind"><div class="nm">${esc(c.item)}<small>${esc(c.detail)}</small></div><div class="vl">${c.passed?'<span class="badge b-ai">충족</span>':'<span class="badge b-warn">미충족</span>'}</div></div>`).join('');})()}</div>
          <h4>평가 기여도</h4>
          <div>${renderContributionRows(detail.contribution)}</div>
          ${candHtml}
          ${recsHtml}
          <h4>센터 코멘트</h4>
          ${detail.comments.length
            ? detail.comments.map((c) => `<p>- ${esc(c.comment)} (${esc(c.created_at)})</p>`).join("")
            : '<p class="note">코멘트가 없습니다.</p>'}
          <p><button class="btn btn-o" id="btn-close">닫기</button></p>
        </div>
      </div>
    `;
    $("#btn-close").addEventListener("click", () => { modalRoot.innerHTML = ""; });
    const approveBtn = $("#btn-approve");
    const rejectBtn = $("#btn-reject");
    if (approveBtn) approveBtn.addEventListener("click", () => decide(submissionId, "approved"));
    if (rejectBtn) rejectBtn.addEventListener("click", () => decide(submissionId, "rejected"));
  }

  async function decide(submissionId, status) {
    const note = $("#decision-note") ? $("#decision-note").value : "";
    const fd = new FormData();
    fd.append("status", status);
    fd.append("decision_note", note);
    await fetch(`/api/submission/${submissionId}/decision`, { method: "POST", body: fd });
    $("#modal-root").innerHTML = "";
    loadMySubmissions();
  }

  // ---------- 센터(컨설팅) 모드 ----------
  let centerRows = [];
  let centerTenantMap = {};
  let centerFilter = "all";
  let centerSort = "latest";
  let centerSearch = "";

  function parseErrorRate(qualitySummary) {
    const m = String(qualitySummary || "").match(/오류율\s*([\d.]+)%/);
    return m ? parseFloat(m[1]) : null;
  }

  function isQualityPassed(qualitySummary) {
    const s = String(qualitySummary || "").trim();
    return s.endsWith("통과") && !s.endsWith("미통과");
  }

  const CENTER_STATUS_LABEL = { submitted: "검토대기", approved: "승인", rejected: "반려" };
  const CENTER_STATUS_BADGE = { submitted: "b-warn", approved: "b-ok", rejected: "b-na" };

  function computeAiReady(row) {
    // 휴리스틱(추정): 품질진단 통과 + 데이터 규모(30행 이상) + 설명 충실(20자 이상)을
    // 동시에 만족하면 AI 학습 활용 후보로 추정한다.
    return isQualityPassed(row.quality_summary)
      && (row.rows || 0) >= 30
      && String(row.description || "").trim().length >= 20;
  }

  function computeRecommendedAction(row) {
    const passed = isQualityPassed(row.quality_summary);
    const descLen = String(row.description || "").trim().length;
    if (row.status === "approved") return "개방포털 등록이 완료되었습니다 — 후속 활용 현황을 모니터링하세요.";
    if (row.status === "rejected") return "반려 처리되었습니다 — 필요 시 기관과 데이터 범위를 재협의하도록 안내하세요.";
    if (descLen < 10) return "설명(메타데이터)이 부족합니다 — 기관에 메타데이터 보완을 요청하세요.";
    if (!passed) return "품질 기준 미달입니다 — 품질개선계획 초안을 생성해 기관에 보완을 요청하세요.";
    return "품질진단을 통과했습니다 — 즉시 승인 가능한 개방 후보로 안내해도 좋습니다.";
  }

  function renderCenterBadges(row) {
    const chips = [];
    chips.push(`<span class="badge ${CENTER_STATUS_BADGE[row.status] || 'b-na'}">${esc(CENTER_STATUS_LABEL[row.status] || row.status)}</span>`);
    chips.push(isQualityPassed(row.quality_summary)
      ? '<span class="badge b-ok">품질 통과</span>'
      : '<span class="badge b-red">품질 개선 필요</span>');
    if (computeAiReady(row)) chips.push('<span class="badge b-ai">AI-Ready 후보</span>');
    if (row.status === "submitted" && isQualityPassed(row.quality_summary)) {
      chips.push('<span class="badge b-hv">즉시 승인 가능</span>');
    }
    if ((row.comment_count || 0) > 0) chips.push(`<span class="badge b-na">코멘트 ${row.comment_count}건</span>`);
    return chips.join(" ");
  }

  function renderCenterView() {
    const root = $("#sub-center-view");
    // 모드를 다시 열 때마다 화면은 기본값(전체/빈 검색어/최신순)으로 다시 그려지므로,
    // 보존된 상태도 함께 초기화해야 화면 표시와 실제 필터링 결과가 어긋나지 않는다.
    centerFilter = "all";
    centerSort = "latest";
    centerSearch = "";
    root.innerHTML = `
      <div class="card"><h3>전체 제출 현황</h3><div id="center-summary" class="cards c4"></div></div>
      <div class="card"><h3>평가 영역별 기여 집계</h3><div id="center-contribution"></div></div>
      <div class="card">
        <h3>검토 대기 목록</h3>
        <div class="chips" id="center-filters">
          <button data-filter="all" class="active">전체</button>
          <button data-filter="submitted">검토대기</button>
          <button data-filter="approved">승인</button>
          <button data-filter="rejected">반려</button>
        </div>
        <div class="search" style="margin:10px 0">
          <input id="center-search" placeholder="제목 · 설명 · 기관 · 품질요약 검색">
          <select id="center-sort">
            <option value="latest">최신순</option>
            <option value="quality">품질점수순(오류율 낮은 순)</option>
            <option value="status">상태순</option>
          </select>
        </div>
        <div id="center-list"></div>
      </div>
    `;
    $all("[data-filter]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        $all("[data-filter]", root).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        centerFilter = btn.dataset.filter;
        renderCenterList();
      });
    });
    $("#center-search").addEventListener("input", (e) => {
      centerSearch = e.target.value.trim().toLowerCase();
      renderCenterList();
    });
    $("#center-sort").addEventListener("change", (e) => {
      centerSort = e.target.value;
      renderCenterList();
    });
    loadCenterView();
  }

  async function loadCenterView() {
    const [subRes, tenantRes, contribRes] = await Promise.all([
      fetch("/api/submission/all"),
      fetch("/api/tenants"),
      fetch("/api/evaluation/submissions"),
    ]);
    centerRows = await subRes.json();
    const tenants = await tenantRes.json();
    const contribAgg = await contribRes.json();
    centerTenantMap = {};
    tenants.forEach((t) => { centerTenantMap[t.tenant_id] = t.name; });

    const total = centerRows.length;
    const pending = centerRows.filter((r) => r.status === "submitted").length;
    const approved = centerRows.filter((r) => r.status === "approved").length;
    const rejected = centerRows.filter((r) => r.status === "rejected").length;
    const passed = centerRows.filter((r) => isQualityPassed(r.quality_summary)).length;
    const failed = centerRows.filter((r) => r.quality_summary && !isQualityPassed(r.quality_summary)).length;
    const aiReady = centerRows.filter(computeAiReady).length;
    const comments = centerRows.reduce((sum, r) => sum + (r.comment_count || 0), 0);

    $("#center-summary").innerHTML = [
      ["전체 제출 수", total],
      ["검토 대기", pending],
      ["승인", approved],
      ["반려", rejected],
      ["품질 통과", passed],
      ["품질 개선 필요", failed],
      ["AI-Ready 추정", aiReady],
      ["컨설팅 코멘트 누적", comments],
    ].map(([lbl, num]) => `
      <div class="card stat"><div class="num">${num}</div><div class="lbl">${esc(lbl)}</div></div>
    `).join("");

    const contribTotal = contribAgg.total || 0;
    // a.color: server-side constant (AREAS in evaluation.py), not user input
    $("#center-contribution").innerHTML = (contribAgg.areas || []).map((a) => {
      const pct = contribTotal ? Math.round((a.contributing / contribTotal) * 100) : 0;
      return `
        <div class="abar">
          <div class="top"><b>${esc(a.name)}</b><span>${a.contributing}/${a.total}건 기여 (${pct}%)</span></div>
          <div class="track"><div class="fill" style="width:${pct}%;background:${a.color}"></div></div>
        </div>`;
    }).join("") || '<p class="note">집계할 제출이 없습니다.</p>';

    renderCenterList();
  }

  function renderCenterList() {
    const root = $("#center-list");
    let rows = centerRows.slice();

    if (centerFilter !== "all") rows = rows.filter((r) => r.status === centerFilter);
    if (centerSearch) {
      rows = rows.filter((r) => {
        const tenantName = centerTenantMap[r.tenant_id] || r.tenant_id;
        const haystack = [r.title, r.description, tenantName, r.quality_summary]
          .map((v) => String(v || "").toLowerCase()).join(" ");
        return haystack.includes(centerSearch);
      });
    }

    if (centerSort === "quality") {
      rows.sort((a, b) => {
        const ra = parseErrorRate(a.quality_summary);
        const rb = parseErrorRate(b.quality_summary);
        if (ra === null && rb === null) return 0;
        if (ra === null) return 1;
        if (rb === null) return -1;
        return ra - rb;
      });
    } else if (centerSort === "status") {
      const order = { submitted: 0, approved: 1, rejected: 2 };
      rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    } else {
      rows.sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
    }

    if (!rows.length) {
      root.innerHTML = '<p class="note">조건에 맞는 제출이 없습니다.</p>';
      return;
    }

    root.innerHTML = rows.map((r) => `
      <div class="ds" data-id="${r.submission_id}">
        <strong>${esc(r.title)}</strong>
        <span class="badge b-hv">${esc(centerTenantMap[r.tenant_id] || r.tenant_id)}</span>
        ${renderCenterBadges(r)}
        <p>${esc(r.quality_summary || '')} · 제출 ${esc(r.submitted_at || '')}</p>
      </div>
    `).join("");
    $all(".ds", root).forEach((el) => {
      el.addEventListener("click", () => openCenterDetail(el.dataset.id));
    });
  }

  async function openCenterDetail(submissionId) {
    const res = await fetch(`/api/submission/${submissionId}`);
    const detail = await res.json();
    const m = detail.meta;
    const q = detail.quality;
    const mAug = Object.assign({}, m, { comment_count: detail.comments.length });
    const modalRoot = $("#modal-root");
    const tenantName = centerTenantMap[m.tenant_id] || m.tenant_id;
    const recs = detail.recommendations || [];
    const recsHtml = recs.length ? `
  <h4>품질개선 권고 <button class="btn btn-o" id="btn-save-rec">코멘트로 저장</button></h4>
  <ul>${recs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '';
    const cands = detail.ontology_candidates || [];
    const candHtml = cands.length ? `
  <h4>온톨로지 연계 후보</h4>
  <div class="chips">${cands.map((c) =>
    `<span class="badge b-hv" title="${esc(c.reason)}">${esc(c.obj_type)}</span>`
  ).join(' ')}</div>
  <p class="note">${esc(cands.map((c) => `${c.obj_type}: ${c.reason}`).join(' / '))}</p>` : '';

    modalRoot.innerHTML = `
      <div class="modal">
        <div class="box">
          <h3>${esc(m.title)}</h3>
          <p class="note">제출 ID: ${esc(m.submission_id)} · 제출기관: ${esc(tenantName)} · 제출일시: ${esc(m.submitted_at || '')}</p>
          <p>${esc(m.description)}</p>
          <p>${renderCenterBadges(mAug)}</p>
          <h4>AI-Ready 체크리스트 ${(function(){const aicl=detail.ai_ready_checklist||{ai_ready:false,checklist:[]};return aicl.ai_ready?'<span class="badge b-ai">AI-Ready</span>':'<span class="badge b-warn">AI-Ready 아님</span>';})()}</h4>
          <div>${(function(){const aicl=detail.ai_ready_checklist||{ai_ready:false,checklist:[]};return aicl.checklist.map((c)=>`<div class="ind"><div class="nm">${esc(c.item)}<small>${esc(c.detail)}</small></div><div class="vl">${c.passed?'<span class="badge b-ai">충족</span>':'<span class="badge b-warn">미충족</span>'}</div></div>`).join('');})()}</div>
          <h4>평가 기여도</h4>
          <div>${renderContributionRows(detail.contribution)}</div>
          ${candHtml}
          <p><strong>권장 조치</strong> ${esc(computeRecommendedAction(mAug))}</p>
          ${recsHtml}
          ${q ? `
            <h4>품질진단 상세</h4>
            <p>오류율 ${esc(String(q.error_rate))}% (기준 ${esc(String(q.threshold))}%) · 규칙 ${esc(String(q.rule_count))}종 · 오류 ${esc(String(q.errors))}건 · ${q.passed ? '<span class="badge b-ok">통과</span>' : '<span class="badge b-red">미통과</span>'}</p>
            <ul>${q.detail.map((d) => `<li>${esc(d.rule)} — 위반 ${esc(String(d.violations))}건 (기준 ${esc(String(d.threshold))}%)</li>`).join('')}</ul>
          ` : ''}
          ${m.decision_note ? `<p><strong>결정 메모</strong> ${esc(m.decision_note)} (${esc(m.decided_at || '')})</p>` : ''}
          <h4>컨설팅 코멘트</h4>
          <div id="center-comment-list">
            ${detail.comments.length
              ? detail.comments.map((c) => `<p>- ${esc(c.comment)} <small class="note">(${esc(c.created_at)})</small></p>`).join("")
              : '<p class="note">코멘트가 없습니다.</p>'}
          </div>
          <p>
            <textarea id="center-comment-input" rows="3" style="width:100%" placeholder="컨설팅 의견을 입력하세요"></textarea>
          </p>
          <p>
            <button class="btn btn-p" id="btn-comment-submit">코멘트 등록</button>
            <button class="btn btn-o" id="btn-draft-quality">품질개선 권고문 생성</button>
            <button class="btn btn-o" id="btn-close">닫기</button>
          </p>
        </div>
      </div>
    `;
    $("#btn-close").addEventListener("click", () => { modalRoot.innerHTML = ""; });
    $("#btn-comment-submit").addEventListener("click", async () => {
      const text = $("#center-comment-input").value.trim();
      if (!text) return;
      const fd = new FormData();
      fd.append("comment", text);
      await fetch(`/api/submission/${submissionId}/comment`, { method: "POST", body: fd });
      openCenterDetail(submissionId);
      loadCenterView();
    });
    $("#btn-draft-quality").addEventListener("click", async () => {
      const res2 = await fetch(`/api/plan/draft?tenant_id=${m.tenant_id}&type=quality`);
      const data = await res2.json();
      $("#center-comment-input").value = data.draft;
    });
    const saveRecBtn = $("#btn-save-rec");
    if (saveRecBtn) {
      saveRecBtn.addEventListener("click", async () => {
        const recText = recs.join("\n");
        const fd = new FormData();
        fd.append("comment", recText);
        await fetch(`/api/submission/${submissionId}/comment`, { method: "POST", body: fd });
        modalRoot.innerHTML = "";
        loadCenterView();
      });
    }
  }

  // 기존 탭 전환 핸들러(app.js:8-17)가 호출할 수 있도록 전역에 노출한다
  window.initSubmissionTab = initSubmissionTab;
})();
