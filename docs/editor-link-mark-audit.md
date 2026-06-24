# Editor Link Mark Audit

작성일: 2026-06-21

범위: 현재 dirty workspace 기준. link mark command가 제품 URL 입력 없이도 link를
만들어야 하는지, 아니면 href가 명시될 때만 link를 추가해야 하는지 판정한다.

## 판정

link mark의 model representation과 command seam은 확정이다. 하지만 no-prompt
`https://example.com` fallback은 제거 확정이다.

- 확정: `Mark`의 `link` variant는 `href`를 가진다.
- 확정: markdown import/export와 renderer는 safe link href/title을 보존한다.
- 확정: persisted document parse는 link mark href를 검증한다. non-empty safe
  `href`는 schema-valid link mark이고, empty 또는 unsafe `href`는 generic parse
  failure로 거절된다.
- 확정: renderer는 `http:`, `https:`, `mailto:`, `tel:`, relative URL만 clickable
  `href`로 내보내고, unsafe scheme은 canonical href를 보존하더라도 DOM `href`로
  렌더링하지 않는다.
- 확정: markdown import/paste도 같은 allowlist를 통과한 href만 link mark로
  쓴다. unsafe markdown link는 label text만 보존하고 link mark를 만들지 않는다.
- 확정: `toggleLink`는 `selection.context.pendingLinkHref`가 있을 때 link를
  추가한다.
- 확정: command-created link href는 trim 후 renderer와 같은 allowlist를 통과해야
  한다. `http:`, `https:`, `mailto:`, `tel:`, relative URL만 새 link mark로 쓸 수
  있고, unsafe scheme은 document mutation 전에 거절한다.
- 확정: 이미 link가 걸린 selected range나 collapsed active link는 pending href
  없이도 link 제거가 가능하다.
- 확정: selection context에 들어온 active link mark도 같은 href 정규화를 통과하지
  못하면 insertion active mark에서 제외된다.
- 제거 확정: pending href 없이 새 link를 만들 때 `https://example.com`을 넣지
  않는다.
- 애매: 사용자가 href를 입력하는 UI와 unsafe href가 있는 legacy document를
  migrate/drop할 별도 policy는 아직 제품 결정이다.
- 애매: relative URL을 어떤 route/trust boundary로 볼지, protocol-relative URL을
  제품상 허용할지 같은 compatibility/security matrix는 아직 별도 결정이다.

## 왜 fallback을 뺐나

`https://example.com`은 demo/no-prompt 편의일 뿐 실제 사용자 의도를 표현하지
않는다. 제품 URL 입력 UX가 없는 상태에서 임의 외부 URL을 canonical document에
저장하면, 테스트 통과와 실제 올바름이 어긋난다.

현재 올바른 축소는 command layer가 link href를 요구하고, command-created href를
trim/allowlist로 정규화하게 하는 것이다. URL 입력 UI가 생기면 그 UI가
`pendingLinkHref`를 세팅하거나 별도 command payload를 제공해야 한다.

## 확정 근거

| 근거 | 의미 |
| --- | --- |
| `MarkSchema` link variant | link mark에는 non-empty `href`가 필요하다. |
| `toggleLink` | pending href가 있을 때 range/active link를 만든다. 없으면 새 link 추가는 실패한다. |
| `linkHref.ts` | command write-time과 renderer가 같은 href trim/allowlist 정책을 쓴다. |
| `mark command split tests` | pending href로 link 추가/제거가 되고, href 없는 새 link 추가와 unsafe pending href는 실패함을 확인한다. |
| inputAdapter split tests | `Cmd/Ctrl+K`도 pending href 없거나 unsafe하면 새 link를 만들지 않는다. |
| markdown split tests, inputAdapter split tests unsafe markdown href case | markdown import/paste는 unsafe href를 link mark로 쓰지 않고 label text만 보존한다. |
| `src/editor/public/index.test.ts` | persisted document parse가 link mark href를 검증하고, empty/unsafe href를 generic failure로 거절한다. |
| markdown split tests, `DocumentRenderer split tests` | safe link href/title은 import/export/render에서 보존된다. |
| `DocumentRenderer split tests` unsafe href case | `javascript:` 같은 unsafe scheme은 clickable anchor href로 렌더링하지 않는다. |

## 증거 강도

| 범위 | 판정 | 근거 |
| --- | --- | --- |
| link mark model/schema interface | 확정 | `MarkSchema`의 link variant는 `href`를 required field로 갖고, persisted parse는 empty/unsafe href를 거절한다. |
| shared href normalization seam | 확정 | `normalizeLinkHref`/`renderableLinkHref`가 schema, command, selection context, markdown import, renderer에서 재사용된다. 이 함수는 현재 link href policy의 작은 interface다. |
| command-created link behavior | 실행 테스트로 확정 | `toggleLink`와 `Cmd/Ctrl+K`는 `pendingLinkHref`가 있을 때만 새 link를 만들고, trim 후 safe href만 document mutation에 쓴다. missing/unsafe pending href는 실패한다. |
| selected/collapsed link removal | 실행 테스트로 확정 | 이미 link가 걸린 selected range나 collapsed active link는 pending href 없이도 제거할 수 있다. |
| active mark sanitization | 실행 테스트로 확정 | selection context의 unsafe active link mark는 insertion 전에 drop되고 다른 safe active mark만 유지된다. |
| markdown import/paste href handling | 실행 테스트로 확정 | markdown import와 markdown-format paste는 safe href만 link mark로 만들고, unsafe markdown link는 label text만 보존한다. `/docs/editor` relative link case도 테스트로 닫혀 있다. |
| renderer href safety | 실행 테스트로 확정 | renderer는 unsafe legacy/trusted link mark를 `<a>`로 렌더링하더라도 clickable DOM `href`를 내보내지 않는다. `http`, `https`, `mailto`, `tel`, `/docs/editor`는 clickable href로 렌더링된다. |
| link title preservation | 실행 테스트로 확정 | markdown export/import는 escaped quote가 포함된 link title을 round-trip한다. 다만 title 편집 UX는 아직 별도 제품 결정이다. |
| relative URL allow behavior | source behavior 확정, 제품 policy 미정 | current source는 `new URL(href, "https://editable.invalid")` 기준으로 base-origin relative input을 trim 후 허용하고, allowlisted absolute protocol도 허용한다. 이것은 현재 코드 사실이지만, 앱 route trust boundary나 compatibility/security matrix까지 닫은 것은 아니다. |
| link input UX | 미정 | toolbar/prompt/form, validation message, `pendingLinkHref` 설정 주체는 아직 제품 UX로 닫히지 않았다. |
| legacy unsafe URL migration/drop | 미정 | renderer safety와 persisted parse rejection은 확정이지만, 이미 존재하는 unsafe legacy document를 migrate/drop할지에 대한 별도 migration policy는 없다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| link mark schema | 유지 확정 | rich text model과 markdown/rendering이 link href를 구조화해서 보존한다. |
| `pendingLinkHref` context | 유지 확정 | 현재 command layer에 href를 전달하는 유일한 explicit seam이다. |
| persisted link mark href validation | 유지 확정 | `parseNoteDocument`가 untrusted JSON을 schema-valid safe `NoteDocument`로 좁히는 public seam이다. |
| command write-time href allowlist | 유지 확정 | 새 link mark를 만드는 경로에서 unsafe href를 canonical document에 쓰지 않는다. |
| markdown import/paste href allowlist | 유지 확정 | markdown으로 새로 들어오는 link mark도 command-created href와 같은 allowlist를 통과해야 한다. |
| renderer href safety layer | 유지 확정 | legacy/trusted document와 별개로 DOM anchor가 unsafe scheme을 실행 가능한 href로 노출하면 안 된다. |
| no-prompt `https://example.com` fallback | 제거 확정 | 제품 의도 없는 외부 URL을 canonical state에 저장한다. |
| link 입력 toolbar/prompt | 보류 | UX와 legacy document URL migration policy를 같이 결정해야 한다. |
| relative URL compatibility/security matrix | 보류 | 현재 source/test는 relative href 허용을 보여주지만 route trust boundary까지 확정하지는 않는다. |

## 현재 결론

link mark는 빼면 안 되는 rich text 기능이다. 다만 link href는 반드시 사용자 입력
또는 명시적 command context에서 와야 한다. fallback URL은 확정 기능이 아니라 demo
편의였으므로 제거했다. command-created href는 trim/allowlist를 통과해야 하고,
markdown import/paste도 같은 allowlist를 통과한 href만 link mark로 쓴다.
renderer는 추가로 legacy/trusted unsafe scheme을 clickable `href`로 노출하지
않는 안전 계층을 가진다. persisted parse는 unsafe link href를 거절하지만, 이미
존재하는 legacy document의 unsafe href를 migrate/drop하는 policy는 아직 별도 제품/API
결정이다. relative URL 허용은 현재 source/test behavior로는 확정이지만, 앱 라우팅과
보안 신뢰 경계의 제품 policy까지 확정한 것은 아니다.
