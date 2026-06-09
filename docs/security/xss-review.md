# XSS 보안 리뷰 — web/app.js innerHTML 사용 지점

## 리뷰 범위

`web/app.js` 전체의 `innerHTML` 사용 지점을 대상으로, XSS 방어 적용 여부를 검토한다.
이 파일에는 서버에서 받은 데이터와 사용자가 직접 입력한 데이터 양쪽이 `innerHTML`을 통해
DOM에 삽입되므로, 각 삽입 지점의 신뢰 수준과 이스케이프 처리 여부를 구분하여 기록한다.

---

## 핵심 방어 패턴

`web/app.js` 5행에 전역 이스케이프 헬퍼가 정의되어 있다:

```js
const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
```

- `&`, `<`, `>` 세 문자를 HTML 엔터티로 치환한다.
- `null`/`undefined` 입력을 `String(s ?? '')` 패턴으로 안전하게 처리한다.
- 텍스트 노드 컨텍스트(속성이 아닌 태그 내부 텍스트)에서의 삽입에 충분한 방어이다.
- 이 함수는 초기 구현 시점부터 있었으며, 공급자 워크플로우 구현 이전에 이미 28회 사용되고 있었다.

---

## 저장형 XSS 위험 지점 및 방어 확인

### 사용자 입력 경로 (가장 중요)

기관 담당자가 `#meta-form`에 입력한 값(제목, 설명)과 센터 담당자가 입력한 코멘트는
백엔드에 저장된 후 기관 모드·센터 모드 양쪽에서 `innerHTML`로 표시된다.
이는 코드베이스에서 **권한 경계를 넘는 저장형 XSS**가 발생 가능한 유일한 경로이다.

아래 지점들에서 `esc()` 적용을 확인한다.

#### 기관 모드 — 내 제출 목록 (`loadMySubmissions`, app.js ~444행)

```js
root.innerHTML = rows.map((r) => `
  <div class="ds" data-id="${r.submission_id}">
    <strong>${esc(r.title)}</strong>
    <span class="badge ...">${r.status}</span>
    <p>${esc(r.quality_summary || '')}</p>
  </div>
`).join("");
```

- `r.title` — 기관 담당자 입력값: `esc()` 적용됨
- `r.quality_summary` — 서버 생성(`summarize_quality()`): `esc()` 적용됨 (불필요하지만 무해)
- `r.submission_id` — 서버 생성 UUID(32자 16진수): `data-id` 속성에 삽입, 아래 "비위험 패턴" 참고
- `r.status` — 고정 열거형 (`submitted` / `approved` / `rejected`): `===` 비교로만 분기

#### 기관 모드 — 제출 상세 모달 (`openSubmissionDetail`, app.js ~480행)

```js
modalRoot.innerHTML = `
  <div class="modal">
    <div class="box">
      <h3>${esc(m.title)}</h3>
      <p>${esc(m.description)}</p>
      <p>... ${esc(m.quality_summary || '')} ...</p>
      ...
      ${detail.comments.map((c) => `<p>- ${esc(c.comment)} (${esc(c.created_at)})</p>`).join("")}
    </div>
  </div>
`;
```

- `m.title` — 기관 담당자 입력값: `esc()` 적용됨
- `m.description` — 기관 담당자 입력값: `esc()` 적용됨
- `m.quality_summary` — 서버 생성: `esc()` 적용됨
- `c.comment` — 센터 담당자 입력값(권한 경계 센터→기관): `esc()` 적용됨
- `c.created_at` — 서버 생성 타임스탬프: `esc()` 적용됨

#### 센터 모드 — 검토 목록 (`renderCenterList`, app.js ~706행)

```js
root.innerHTML = rows.map((r) => `
  <div class="ds" data-id="${r.submission_id}">
    <strong>${esc(r.title)}</strong>
    <span class="badge b-hv">${esc(centerTenantMap[r.tenant_id] || r.tenant_id)}</span>
    ${renderCenterBadges(r)}
    <p>${esc(r.quality_summary || '')} · 제출 ${esc(r.submitted_at || '')}</p>
  </div>
`).join("");
```

- `r.title` — 기관 담당자 입력값(권한 경계 기관→센터): `esc()` 적용됨
- `centerTenantMap[...]` — 서버의 `tenants` 테이블에서 조회한 기관명: `esc()` 적용됨
- `r.quality_summary` — 서버 생성: `esc()` 적용됨

#### 센터 모드 — 상세 모달 (`openCenterDetail`, app.js ~739행)

```js
modalRoot.innerHTML = `
  <div class="modal">
    <div class="box">
      <h3>${esc(m.title)}</h3>
      <p class="note">제출 ID: ${esc(m.submission_id)} · 제출기관: ${esc(tenantName)} · ...</p>
      <p>${esc(m.description)}</p>
      ...
      ${detail.comments.map((c) =>
        `<p>- ${esc(c.comment)} <small class="note">(${esc(c.created_at)})</small></p>`
      ).join("")}
      ...
      ${m.decision_note ? `<p><strong>결정 메모</strong> ${esc(m.decision_note)} ...</p>` : ''}
    </div>
  </div>
`;
```

- `m.title` — 기관 담당자 입력값: `esc()` 적용됨
- `m.description` — 기관 담당자 입력값: `esc()` 적용됨
- `c.comment` — 센터 담당자 입력값: `esc()` 적용됨
- `m.decision_note` — 기관 담당자 입력값: `esc()` 적용됨
- `tenantName` — `tenants` 테이블 조회값: `esc()` 적용됨

#### 온톨로지 후보 `reason` 필드 및 AI-Ready `detail` 필드

```js
// 온톨로지 후보 (기관 및 센터 양쪽 모달)
`<span class="badge b-hv" title="${esc(c.reason)}">${esc(c.obj_type)}</span>`
`<p class="note">${esc(cands.map((c) => `${c.obj_type}: ${c.reason}`).join(' / '))}</p>`

// AI-Ready 체크리스트 항목
`<div class="nm">${esc(c.item)}<small>${esc(c.detail)}</small></div>`
```

- 두 필드 모두 서버 로직(`app/ontology.py`, `app/evaluation.py`)이 생성하는 값이지만
  `esc()` 가 적용되어 있다. 서버 생성 값이라도 향후 DB 오염이나 설정 변경으로 악의적 문자열이
  섞일 수 있으므로, 이스케이프를 유지하는 것이 타당하다.

---

## 알려진 비위험 패턴

아래 값들은 사용자 자유 입력이 아니므로 `esc()` 없이 `innerHTML`에 삽입되어도 안전하다.

### 서버 생성 UUID (submission_id, comment_id)

`submission_id`와 `comment_id`는 `app/submission.py`의 `uuid.uuid4().hex`가 생성하는
32자 16진수 소문자 문자열이다. HTML 특수문자(`&`, `<`, `>`)를 포함할 수 없다.

```js
// 예: data-id 속성에 직접 삽입
`<div class="ds" data-id="${r.submission_id}">`
```

이 값이 임의로 변조된다면 데이터베이스 조회 실패(404)만 발생하며, XSS로는 이어지지 않는다.

### 정수 카운터 (rows, comment_count 등)

```js
`${Number(d.rows).toLocaleString()}행`
```

`Number()` 강제 변환으로 숫자가 아닌 값은 `NaN`이 되고, `NaN.toLocaleString()`은
`"NaN"` 문자열을 반환한다. 어느 경우에도 HTML 특수문자가 포함되지 않는다.

### 열거형 배지 상태 (approved / rejected / submitted)

```js
r.status === 'approved' ? 'b-ok' : r.status === 'rejected' ? 'b-na' : 'b-warn'
```

`r.status`는 CSS 클래스 선택에만 사용되며, `innerHTML`에 직접 삽입되지 않는다.

---

## E2E XSS 교차 검증 실측 결과

Task 11 및 Task 13 검증 단계에서 실제 페이로드로 양방향 교차 검증을 수행했다.

**기관 → 센터 방향**:
- 제목 `<script>alert('agency-title')</script>제목텍스트` 등록
- 센터 모드 목록 및 상세 모달에서 `&lt;script&gt;alert('agency-title')&lt;/script&gt;제목텍스트` 로 이스케이프 렌더링 확인
- `window.alert` 후킹 결과 `window.__xssFired: []` — 알럿 미발생

**센터 → 기관 방향**:
- 코멘트 `<script>alert('center-comment')</script>코멘트텍스트<img src=x onerror=alert(2)>` 등록
- 기관 모드 상세 "센터 코멘트" 섹션에서 동일하게 이스케이프 렌더링 확인
- 알럿 미발생

---

## 현재 알려진 제약 사항

### HTTPS / CSP 헤더 미적용

현재 공공클라우드에 배포되지 않았으며, 개발 서버(`uvicorn`, HTTP)로만 운영 중이다.

- HTTPS(TLS) 미적용
- Content-Security-Policy(CSP) 헤더 미적용

**운영 배포 시 HTTPS 및 CSP 헤더를 설정해야 한다** — 특히 `default-src 'self'`,
`script-src 'self'` 등의 정책이 `esc()` 기반 방어의 심층 방어(Defense in Depth)로 기능한다.

### innerHTML → createElement/textContent 전환 미완료

현재 구현은 `esc()` 헬퍼 기반의 문자열 템플릿 + `innerHTML` 방식이다.
브라우저 DOM API를 직접 사용하는 `createElement` + `textContent` 방식은 이스케이프 누락
위험이 구조적으로 없어 더 안전하다.

`innerHTML` 사용 지점 전체를 `createElement` 방식으로 전환하는 것은 **장기 개선 사항**이다.
현재 규모(단일 파일 약 800행)에서는 `esc()` 일관 적용으로 동등한 보안을 달성하고 있지만,
컴포넌트 수가 늘어나면 전환을 검토해야 한다.

### 속성 컨텍스트 주의

현재 `esc()`는 `&`, `<`, `>` 세 문자만 치환한다. HTML 속성값(`href`, `onclick` 등)에 삽입 시에는
큰따옴표(`"`)도 이스케이프해야 한다.

현재 코드에서 사용자 입력이 `href` 또는 이벤트 핸들러 속성에 삽입되는 지점은 없다.
향후 이런 패턴이 추가될 경우 `esc()` 함수의 치환 대상에 `"`를 추가해야 한다.
