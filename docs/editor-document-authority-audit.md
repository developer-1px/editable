# Editor Document Authority Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. 에디터 문서들이 서로 다른 질문에 답하고
있으므로, 어느 문서를 확정 근거로 써도 되는지와 아직 애매한 문서 정책을
분리한다.

## 판정

문서 권위는 다음처럼 나뉜다.

| 문서 | 현재 권위 | 판정 |
| --- | --- | --- |
| `docs/rich-model-design.md` | rich model의 방향, module 책임, cursor/selection/contenteditable 불변식 | 유지 확정. 구현 상태 tracker나 exact persisted schema contract가 아니다. |
| `src/editor/internal/model/noteDocument.ts` | 현재 canonical document schema와 persisted parse rule | 유지 확정. schema field의 최종 source of truth다. |
| `docs/editor-issues.md` | ED-001~ED-029 구현 issue history와 accepted work | 유지 확정. 완료 표시는 실행 테스트 근거와 같이 읽어야 한다. |
| `docs/editor-required-feature-list.md` | product/QA 기대 목록 | 유지 확정. 구현 완료 문서가 아니다. |
| `docs/editor-feature-coverage-audit.md` | required feature list와 ED/test coverage의 gap map | 유지 확정. product 완료 여부가 아니라 coverage 분류 문서다. |
| `docs/repo-analysis-report.md` | 현재 확정/애매 판단의 누적 synthesis | 유지 확정. 개별 주제의 원자료는 topic audit 문서와 코드/테스트다. |
| `docs/editor-*-audit.md` | 각 주제별 좁은 certainty audit | 유지 확정. 주제 밖 결정까지 대표하지 않는다. |

## 확정 근거

| 근거 | 내용 |
| --- | --- |
| `docs/rich-model-design.md` | `Architecture Rule`이 implementation status를 design document에 넣지 말라고 명시한다. |
| `src/editor/internal/model/noteDocument.ts` | Zod schema가 mark, inline node, block, document root, `schemaVersion: 1`, safe link href validation을 실제로 정의한다. |
| `src/editor/public/index.ts` | public schema 객체가 아니라 `parseNoteDocument` validation seam만 노출한다. |
| `docs/editor-issues.md` | ED-001~ED-029 acceptance criteria가 모두 checked 상태이고 keyboard mapping status도 이 파일로 모였다. |
| `docs/editor-feature-coverage-audit.md` | required feature list를 implemented/done으로 승격하지 않고 confirmed, partially confirmed, ambiguous 영역으로 분리한다. |
| `README.md` | Docs 섹션이 design, issue history, product/QA checklist, repo analysis, topic audits를 서로 다른 문서로 설명한다. |
| docs inventory/evidence check | 현재 top-level `docs/*.md`는 47개이고, README Docs 섹션도 같은 47개를 모두 참조한다. `docs/editor-*.md` 45개도 모두 `## 증거 강도` 섹션을 가진다. 누락되거나 존재하지 않는 extra docs link, duplicate link, editor evidence section 누락은 없다. `pnpm run verify:docs`가 file/link inventory와 editor evidence-section presence를 검증하고, script test가 missing/stale/duplicate inventory와 missing evidence reporting을 고정한다. README bullet description이나 문서 본문 의미의 최신성은 이 gate의 판정 대상이 아니다. |
| docs inventory verifier scope | verifier는 `docs/` 바로 아래의 `.md` 파일만 세고, README `## Docs` 섹션 안에서 `- ` bullet line에 있는 backtick path 또는 markdown link path만 추출한다. 현재 nested `docs/**/*.md`는 0개다. | `scripts/verify-docs-inventory.mjs`, `scripts/verify-docs-inventory.test.mjs`, `find docs -mindepth 2 -type f -name '*.md'` |
| `rg` 확인 | `docs/keyboard-mapping-tbd.md`는 현재 트리에 없고, keyboard status는 `docs/editor-issues.md`로 통합되어 있다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `docs/rich-model-design.md`에 구현 상태를 추가 | 제거 확정 | design module의 interface/invariant 설명과 status ledger를 섞으면 문서가 얕아진다. |
| `docs/rich-model-design.md`의 schema snippet을 exact schema로 취급 | 제거 확정 | 실제 schema는 `noteDocument.ts`다. 예를 들어 현재 `CodeBlockSchema`에는 compatibility `children` field가 있지만 design snippet은 방향성 shape만 보여준다. |
| `docs/editor-required-feature-list.md`를 완료 체크리스트로 취급 | 제거 확정 | 이 문서는 product/QA 기대 목록이다. 완료/부분확정/미확정은 feature coverage audit과 tests가 판단한다. |
| `docs/keyboard-mapping-tbd.md` 복구 | 제거 확정 | status가 `docs/editor-issues.md`의 ED-010, ED-021~ED-029와 실행 테스트로 통합되어 중복 문서가 된다. |
| topic audit 문서들 | 유지 확정 | 각 audit은 넓은 리포트보다 좁은 근거와 남은 애매함을 보존한다. 단, 주제 밖 authority로 쓰면 안 된다. |
| README Docs inventory and editor evidence verifier | 유지 확정 | 분석 문서가 늘어날수록 README index가 stale해지기 쉽고, topic audit이 증거 강도 없이 추가되면 확정/미정 분류가 흐려진다. 대표 stale inventory와 missing evidence 경로는 script test로 고정했고, file/link 존재와 heading presence만 확인하므로 새 문서 포맷 정책을 만들지 않는다. |
| README Docs description을 semantic authority로 취급 | 제거 확정 | README Docs bullet은 문서 위치와 한 줄 역할 안내다. `verify:docs`는 이 설명이 구현 상태나 topic audit 본문과 의미적으로 일치하는지 검증하지 않는다. |
| nested docs나 non-bullet docs link를 현재 inventory contract로 취급 | 제거 확정 | 현재 verifier는 top-level `docs/*.md`와 README Docs bullet-line link inventory만 본다. nested docs 구조나 본문 중간 링크까지 gate로 올리려면 별도 정책과 parser가 필요하다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| document role taxonomy | 확정 | README Docs 섹션과 이 audit이 design, issue ledger, product/QA checklist, coverage map, repo synthesis, topic audit의 역할을 분리한다. | README 한 줄 설명 자체가 각 문서 본문 의미의 최신성을 보장하지는 않는다. |
| design document authority | 확정 | `docs/rich-model-design.md`의 Architecture Rule이 implementation status를 design 문서에 넣지 말고 coverage audit/issues/tests로 보내라고 명시한다. | Design snippet은 exact persisted schema나 current implementation status가 아니다. |
| schema authority | 확정 | `src/editor/internal/model/noteDocument.ts`가 `NoteDocumentSchema`, block/inline/mark schema, `schemaVersion: 1`, safe link validation을 정의한다. | External/generated public schema docs나 future migration matrix는 아직 없다. |
| public schema seam | 확정 | `src/editor/public/index.ts`는 `parseNoteDocument`를 노출하고, public facade tests가 `NoteDocumentSchema`, demo constructor, Markdown adapter, React component runtime 노출 부재를 검증한다. | Field-level diagnostics나 ergonomic untrusted initial option은 public import policy로 남아 있다. |
| issue ledger authority | 확정 | `docs/editor-issues.md`가 ED-010, ED-021~ED-029 등 keyboard/input implementation status를 모으고 removed `keyboard-mapping-tbd.md`의 중복 이유를 설명한다. | 외부 issue tracker, PR, close-date linkage는 현재 없다. |
| required feature list authority | 확정 | `docs/editor-required-feature-list.md`는 product/QA expectation list이고, `docs/editor-feature-coverage-audit.md`가 required list를 confirmed/partially confirmed/ambiguous coverage로 분리한다. | Required list만으로 구현 완료를 증명하지 않는다. |
| repo analysis and topic audits | 확정 | `docs/repo-analysis-report.md`는 누적 synthesis이고, 각 `docs/editor-*-audit.md`는 좁은 주제의 근거/한계를 보존한다. | Topic 밖 결정이나 product-wide completion claim의 단독 authority가 아니다. |
| README docs inventory and editor evidence gate | 확정 | `verify:docs`는 현재 README Docs가 top-level `docs/*.md` 47개를 모두 참조하고 `docs/editor-*.md` 45개가 모두 `## 증거 강도` 섹션을 가진다고 확인했다. `verify-docs-inventory.test.mjs`가 matching/missing/stale/duplicate README entry, missing `## Docs`, missing editor evidence reporting을 고정한다. | README bullet description, 문서 본문 의미, non-bullet links는 검증하지 않는다. |
| docs inventory scope | 확정 | `scripts/verify-docs-inventory.mjs`는 top-level `docs/*.md`와 README `## Docs` 섹션의 `- ` bullet line path만 추출하며, 현재 nested markdown 파일은 없다. | Nested docs를 도입하면 recursive inventory 여부를 새로 결정해야 한다. |
| removed keyboard mapping doc | 확정 | `docs/keyboard-mapping-tbd.md`는 현재 트리에 없고, keyboard status는 `docs/editor-issues.md`와 실행 테스트로 통합되어 있다. | Product-facing shortcut customization이나 OS/browser matrix는 별도 audit/policy 영역이다. |
| semantic stale review | 미정 | Current gates는 file/link inventory, editor evidence-section presence, whitespace를 확인하지만, 문서 본문 의미가 구현 변경 뒤 stale해졌는지는 자동 판별하지 않는다. | PR checklist나 owner review 규칙으로 둘지 결정해야 한다. |
| docs formatting and external docs contract | 미정 | Biome 대상에 docs markdown/README가 포함되지 않고, generated public schema docs도 없다. | Markdown lint, generated schema docs, external issue linkage가 필요하면 별도 gate/contract를 설계해야 한다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| docs formatting gate | `verify:internal`은 `git diff --check`는 돌리지만 Markdown formatter/linter를 별도 보장하지 않는다. `biome.json`의 include도 현재 `docs/*.md`와 `README.md`를 Biome 대상으로 삼지 않는다. | docs lint/format을 release gate로 둘지 결정해야 한다. |
| ED ledger와 외부 issue tracker 관계 | `docs/editor-issues.md`는 현재 repo-local history지만, 외부 issue ID/close date/source PR과 연결되어 있지는 않다. | release 운영상 필요한 경우 issue tracker/ADR linkage 규칙을 정해야 한다. |
| generated public schema docs | persisted document의 exact schema authority는 `noteDocument.ts`지만, 외부 소비자용 generated schema 문서는 없다. | public import/migration 정책이 필요해지면 schema export가 아니라 generated docs 또는 좁은 DTO 문서를 설계해야 한다. |
| audit 문서 수명 | README Docs inventory의 file/link stale check와 editor audit의 evidence-section presence check는 `verify:docs`로 닫았다. 하지만 README Docs description과 topic audits의 본문이 구현 변경 뒤 의미적으로 stale해지는지는 자동으로 판별하지 않는다. | semantic stale review를 PR checklist로 둘지, 주제별 owner/review 규칙을 둘지 정해야 한다. |
| nested docs expansion | 현재 docs tree에는 nested markdown이 없고 verifier도 top-level docs만 본다. | nested docs를 도입할 때 README inventory contract를 유지할지 recursive inventory로 넓힐지 결정해야 한다. |

## 현재 결론

문서 구조 자체는 유지할 이유가 있다. `rich-model-design.md`는 깊은 module
interface와 invariant를 설명하는 design authority이고, `noteDocument.ts`는 현재
schema authority다. `editor-issues.md`는 accepted implementation work ledger,
`editor-required-feature-list.md`는 product/QA expectation list,
`editor-feature-coverage-audit.md`는 그 둘 사이의 coverage map이다.

따라서 지금 빼야 하는 것은 문서가 아니라 문서의 과한 해석이다. design document를
status tracker나 exact schema contract로 쓰지 않고, required feature list를 완료
문서로 쓰지 않는 것이 현재 확정 정책이다. README Docs inventory는 현재 top-level
47개 docs 파일과 file/link level에서 일치하고, 45개 editor docs의 `## 증거 강도`
섹션도 `verify:docs`로 보장한다. 대표 stale inventory와 missing evidence failure는
script test가 고정한다. 이 보장은 top-level docs, README Docs bullet-line links,
editor docs heading presence에 한정된다. 아직 운영 정책으로 남은 것은 README
description과 문서 내용 자체의 semantic stale review 방식, nested docs를 도입할 때
inventory contract를 넓힐지 여부다.
