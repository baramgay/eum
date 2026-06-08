/* 이음(EUM) 플랫폼 프론트엔드 - 의존성 없는 바닐라 JS (공공망 친화) */
const $ = (s) => document.querySelector(s);
const api = (p) => fetch(p).then(r => r.json());
const apiPost = (p) => fetch(p, {method:'POST'}).then(r => r.json());
const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

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
  const rows = await api('/api/catalog' + (q ? '?q=' + encodeURIComponent(q) : ''));
  $('#catalog').innerHTML = rows.length ? rows.map(d => `
    <div class="ds" onclick="openDataset('${d.dataset_id}')">
      <h4>${esc(d.title)}</h4>
      <div class="meta">${esc(d.theme)} · ${Number(d.rows).toLocaleString()}행 · ${esc(d.format)}</div>
      <div class="tags">
        ${d.is_open ? '<span class="badge b-ok">개방</span>' : ''}
        ${d.ai_ready ? '<span class="badge b-ai">AI-Ready</span>' : ''}
        ${d.high_value ? '<span class="badge b-hv">고가치</span>' : ''}
      </div></div>`).join('') : '<div class="loading">검색 결과가 없습니다.</div>';
}

async function openDataset(id) {
  const d = await api('/api/dataset/' + id);
  const cols = d.preview.length ? Object.keys(d.preview[0]) : [];
  const q = d.quality;
  $('#modal-root').innerHTML = `<div class="modal" onclick="if(event.target===this)closeModal()">
    <div class="box">
      <button class="x" onclick="closeModal()">&times;</button>
      <h2>${esc(d.meta.title)}</h2>
      <div class="page-sub">${esc(d.meta.description)} · 라이선스 ${esc(d.meta.license)}</div>
      ${q ? `<div class="note">품질진단: 규칙 ${q.rule_count}개 · 오류 ${q.errors}건 · 오류율 ${q.error_rate}% ·
        ${q.passed ? '<span class="badge b-ok">기준 충족</span>' : '<span class="badge b-red">기준 미달(0.001%)</span>'}</div>` : ''}
      <h3>데이터 미리보기 (상위 ${d.preview.length}행)</h3>
      <div style="overflow:auto;max-height:360px"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${d.preview.map(r => `<tr>${cols.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
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
      t.filter(x => x.onboarded).slice(0, 9).map(x => `<button onclick="drawGraph('${x.sgg_cd}')">${esc(x.name)}</button>`).join('');
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
  const samples = ['창원시 청년 순유입 보여줘', '진주 사업체 현황', '거창군 청년센터', '양산 일자리', '김해 청년 인구'];
  $('#nlq-samples').innerHTML = samples.map(s => `<button onclick="$('#nlq').value='${s}';runNL()">${s}</button>`).join('');
}
async function runNL() {
  const q = $('#nlq').value.trim();
  if (!q) return;
  $('#nlresult').innerHTML = '<div class="loading">질의 중...</div>';
  const r = await api('/api/nlquery?q=' + encodeURIComponent(q));
  if (!r.intent) {
    $('#nlresult').innerHTML = `<div class="note">의도를 해석하지 못했습니다. ${esc(r.hint || '')}</div>`;
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
        `<p class="note">등록 완료 — 자동 진단 결과: ${data.quality_summary}</p>`;
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

  async function openSubmissionDetail(submissionId) {
    const res = await fetch(`/api/submission/${submissionId}`);
    const detail = await res.json();
    const m = detail.meta;
    const modalRoot = $("#modal-root");
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
          <h4>센터 코멘트</h4>
          ${detail.comments.length
            ? detail.comments.map((c) => `<p>- ${esc(c.comment)} (${c.created_at})</p>`).join("")
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

  function renderCenterView() {
    const root = $("#sub-center-view");
    root.innerHTML = `<p class="note">센터(컨설팅) 모드는 다음 단계에서 구현됩니다.</p>`;
  }

  // 기존 탭 전환 핸들러(app.js:8-17)가 호출할 수 있도록 전역에 노출한다
  window.initSubmissionTab = initSubmissionTab;
})();
