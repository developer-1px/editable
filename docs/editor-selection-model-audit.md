# Editor selection model audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. canonical selection state가 무엇이고, render/native
selection과 어디서 갈라지는지 확정/애매함으로 분리한다.

## 목적

Selection은 editor correctness의 중심이지만, `json-document`의 low-level
`SelectionSnap`, editor public surface의 `RichSelection`, browser native
selection, visual overlay가 서로 다른 역할을 한다. 이 문서는 현재 코드와 테스트가
닫은 selection model만 확정으로 기록하고, 브라우저/제품 정책은 섞지 않는다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/richSelection.ts` | `RichSelection`을 `SelectionSnap`으로 직렬화하고, render용 selected atom pointer를 파생한다. |
| `src/editor/internal/model/editorSelection.ts` | command 입력 selection을 restore/default/normalize하고, `SelectionSnap`을 다시 `RichSelection`으로 읽는다. |
| `src/editor/internal/model/cursor.ts` | text/atom/block cursor stream, grapheme boundary, atom one-unit movement, selected atom range derivation을 정의한다. |
| `src/editor/internal/model/cursorCommands.ts` | movement/selectAll command가 canonical selectionAfter를 만든다. |
| `src/editor/internal/model/richSelection.test.ts` | caret/range/node 직렬화, range render atom derivation, adjacent text-run boundary collapse, undo 뒤 open range restore를 검증한다. |
| `cursor model split tests` | visible character cursor, grapheme, shared formatted text-run boundary, atom cursor unit을 검증한다. |
| `cursor command split tests` | horizontal/word/vertical/page/boundary movement, selectAll, selected atom render derivation을 검증한다. |
| `editorCore split tests` | `createEditor().query({ type: "selection" })`, selection-only dispatch no-history, geometry-required movement failure를 검증한다. |
| `docs/editor-visual-selection-audit.md` | visual overlay는 selection affordance이고, 최종 visual style/assistive-tech announcement는 별도 QA로 남긴다. |

## 확정 selection model

| 항목 | 확정 내용 |
| --- | --- |
| public selection type | public editor interface에서 caller가 다루는 selection type은 `RichSelection`이다. `SelectionSnap`은 internal/json-document state로 숨긴다. |
| variants | `RichSelection`은 `caret`, `range`, `node` 세 variant다. Multi-range public selection variant는 없다. |
| caret normal form | caret은 collapsed `selectionRanges`와 empty `selectedPointers`로 직렬화된다. Atom edge caret도 selected atom이 아니다. |
| range normal form | range는 anchor/focus를 가진 single primary range이고 source `selectedPointers`는 비워 둔다. |
| render atom derivation | non-collapsed range가 mention/figure atom을 덮으면 `selectionForRender`가 `selectedPointers`를 파생한다. Source selection topology에는 atom 목록을 저장하지 않는다. |
| node selection | explicit node selection만 source `selectedPointers: [target]`을 가진다. Anchor/focus는 node target의 before/after edge다. |
| collapsed boundary normalization | 같은 cursor index로 resolve되는 adjacent text-run boundary range는 caret처럼 collapse된다. |
| command input normalization | command path는 missing/invalid selection snap을 default selection으로 되돌리고, valid snap도 `RichSelection` round-trip으로 normalize한다. |
| default selection | initial/missing/invalid selection은 첫 block before edge로 수렴한다. |
| selectAll | `selectAll`은 first cursor point에서 last cursor point까지의 range를 만든다. Atom coverage는 render 단계에서 파생한다. |
| movement affinity/context | movement는 wrapped boundary에서 direction affinity와 vertical preferredX 같은 selection context를 사용한다. Horizontal movement는 vertical context를 지운다. |
| selection-only history | selection-only dispatch는 document undo entry를 만들지 않는다. Selection은 restore되지만 document mutation history를 오염시키지 않는다. |
| geometry adapter seam | line/page movement는 model이 DOM을 직접 알지 않고 `EditorViewAdapter.geometry()`가 있을 때만 동작한다. Geometry가 없으면 command capability는 실패한다. |

## 증거 강도

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| public `RichSelection` interface | source/type 확정 | `src/editor/public/index.ts`가 `RichSelection` type을 public facade로 노출하고 `createEditor` options, snapshot/query, `setSelection` command가 이 이름을 interface로 쓴다. |
| `SelectionSnap` public 비노출 | boundary test로 확정 | `scripts/verify-editor-boundaries.mjs`와 test가 headless/React facade의 `SelectionSnap` type re-export를 violation으로 막는다. |
| caret/range/node variants | source/type 확정 | `RichSelection` union은 `caret`, `range`, `node` 세 variant만 정의한다. Multi-range variant는 없다. |
| caret normal form | 실행 테스트로 확정 | `richSelection.test.ts`가 collapsed caret의 empty `selectedPointers`와 collapsed range shape를 검증한다. |
| range normal form과 render atom derivation | 실행 테스트로 확정 | `richSelection.test.ts`, cursor command split tests, inputAdapter split tests가 source range의 empty `selectedPointers`와 render 단계 mention/figure atom derivation을 검증한다. |
| node selection source pointer | 실행 테스트로 확정 | `richSelection.test.ts`가 node selection만 source `selectedPointers: [target]`를 갖고 before/after edge range를 갖는다고 검증한다. |
| adjacent text-run boundary collapse | 실행 테스트로 확정 | `richSelection.test.ts`가 같은 cursor index로 resolve되는 adjacent text-run boundary range를 collapsed selection으로 검증한다. |
| default/invalid selection normalization | 실행 테스트로 확정 | `editorCore split tests`가 missing initial selection과 invalid low-level snap이 첫 block before edge selection으로 수렴함을 검증한다. |
| selectAll과 movement context | 실행 테스트로 확정 | cursor command split tests와 inputAdapter split tests가 selectAll, range extension, preferredX, horizontal movement context clear를 검증한다. |
| selection-only no-history | 실행 테스트로 확정 | `editorCore split tests`가 selection-only dispatch가 `canUndo`를 만들지 않는다고 검증한다. |
| geometry adapter seam | 실행 테스트로 확정 | `editorCore split tests`가 geometry 없는 line movement failure와 view adapter가 있을 때의 visual movement success를 검증한다. |
| native event ordering/browser matrix | 미정 | focus/drag/composition/selectionchange 조합은 전체 브라우저 matrix로 닫지 않았다. |
| persisted/collaborative/public context selection | 미정 | session restore, remote cursor/presence, public context DTO는 current local editor selection interface 밖이다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `RichSelection` public type | 유지 확정 | `CreateEditorOptions.selection`, `EditorSnapshot.selection`, `setSelection` command가 이 이름을 interface에 노출한다. |
| `SelectionSnap` public export | 제거 확정 | low-level `selectionRanges`/`selectedPointers` 구조를 caller에게 배우게 하면 public interface가 얕아진다. 현재 `RichSelection`이 더 작은 seam이다. |
| range source `selectedPointers` 저장 | 제거 확정 | atom coverage는 render 단계에서 document+range로 파생 가능하다. source selection에 중복 저장하면 stale topology 위험이 커진다. |
| inline atom edge caret을 node selection으로 취급 | 제거 확정 | design/test 기준으로 atom edge caret은 collapsed caret이고 selected atom이 아니다. |
| visual overlay style을 selection model contract로 승격 | 제거 확정 | overlay mechanism은 필요하지만 색/선/장식은 visual audit과 browser QA 범위다. |
| multi-range selection variant 추가 | 보류 | 현재 product/editor command surface는 single primary range만 닫고 있다. 두 번째 range producer가 없다. |
| remote cursor/presence selection model 추가 | 보류 | collaboration/presence 요구가 아직 없고, current local selection/history model과 다른 data layer가 필요하다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| native selection event-ordering matrix | focus loss range preservation과 stale native range 방지는 테스트가 있지만, browser native `selectionchange`, blur/focus, pointer drag, composition이 섞인 모든 순서는 닫지 않았다. | Playwright/browser matrix로 별도 QA를 설계해야 한다. |
| multi-range/rectangular selection | `json-document`는 여러 `selectionRanges`를 표현할 수 있지만 public `RichSelection`은 single caret/range/node다. | 실제 multi-cursor나 rectangular selection 요구가 생기면 public selection variant와 command semantics를 새로 설계해야 한다. |
| persisted selection contract | document schema는 persisted content를 다루고, current selection/history는 local editor state다. Session restore용 selection serialization은 별도 product contract가 아니다. | 문서별 cursor restore가 필요해지면 persisted selection DTO와 migration을 document schema와 분리해 설계해야 한다. |
| selection context semantics | context는 active marks, pending link href, preferredX 같은 transient editor state를 담는다. Public extension bag으로 보장한 것은 아니다. | 외부 caller가 context를 직접 저장/편집해야 한다면 좁은 typed context contract를 따로 문서화해야 한다. |
| collaboration/presence | current selection model은 local user selection/history 기준이다. Remote user cursor, awareness, conflict resolution은 없다. | collaboration 요구가 생기면 remote selection identity, document version binding, conflict behavior를 별도 data layer에서 설계해야 한다. |
| accessibility announcement | visual overlay는 selection affordance를 제공하지만, assistive-tech announcement가 충분한지는 현재 gate로 닫지 않았다. | 보조 기술별 QA 기준을 별도로 정해야 한다. |

## 현재 결론

뺄 수 없는 확정은 `RichSelection`을 public selection interface로 두고,
`SelectionSnap`은 internal/json-document state로 숨기는 구조다. Caret/range/node
세 variant, source range의 empty `selectedPointers`, render 단계 atom derivation,
node selection의 explicit `selectedPointers`, command input normalization,
selection-only no-history behavior는 테스트로 닫혀 있다.

아직 확정하면 안 되는 것은 browser native selection matrix, multi-range selection,
persisted selection serialization, public context semantics, collaboration/presence,
assistive-tech announcement다. 이들은 현재 selection model이 아니라 제품/플랫폼
정책이다.
