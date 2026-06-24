# Editor nested editable handoff policy audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `figure` caption, iframe/embed, nested editor,
`contenteditable=false` wrapper 안 editable island가 생길 때 outer editor와 inner
owner 사이 focus, selection, clipboard, keyboard ownership을 어떻게 나눌지 정한다.

## 판정

현재 editor는 nested editable을 지원하지 않는다. `figure`는 non-editable block atom이고
`mention`도 inline atom이다. 지금 renderer에 `contenteditable=false` wrapper 안
`contenteditable=true` island, iframe 내부 editor, React decorator selection owner를
추가하지 않는다.

Editable caption이 필요하면 기본 방향은 nested editor가 아니라 같은 canonical document
안의 container block이다. 별도 nested editor는 inner document state, inner selection,
inner clipboard/history가 outer document와 독립이어야 할 때만 허용한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `docs/rich-model-design.md` | editable caption이 필요한 figure는 block atom이 아니라 future container block이어야 한다고 적는다. |
| `src/editor/internal/react/DocumentRenderer.tsx` | 현재 `figure`는 `contentEditable={false}` block atom으로 렌더되고 caption DOM이 없다. `mention`도 `contentEditable={false}` inline atom이다. |
| `docs/editor-figure-media-trust-audit.md` | current figure schema는 `src`/`alt` 중심의 non-editable media atom이며 caption/metadata model은 제품 범위 밖이다. |
| `docs/editor-event-ownership-audit.md` | future nested editor/input은 inner owner가 key/composition/selection을 소유하고 outer root는 focus/handoff boundary만 처리해야 한다. |
| `docs/editor-custom-selection-handoff-audit.md` | 현재 custom selection owner 후보는 없고, future nested editable island가 생길 때만 `setSelection` 같은 hook을 허용한다. |
| `docs/editor-contenteditable-buffer-audit.md` | native browser editing 권한은 active text leaf 안으로 제한된다. |
| `docs/editor-native-selection-bridge-audit.md` | DOM selection bridge는 root-contained text-run adapter이며 canonical document truth가 아니다. |
| Lexical issue #3143 | Firefox는 `contenteditable=false` wrapper 안 nested editable 사이 arrow movement가 Chrome처럼 동작하지 않는다고 보고됐다. |
| Lexical PR #3177 | nested editor에서 cut할 때 non-active editor가 event를 처리하지 않도록 수정했다. |
| Lexical PR #5784 | iframe이 load 후 focus를 훔치며 scroll/focus UX를 깨는 문제를 막는 수정이다. |
| Lexical changelog | nested editor cut/event duplication/collab, iframe focus stealing, image caption import/export, decorator node cursor/selection 수정 이력이 반복된다. |

## Current support boundary

| surface | 현재 상태 | policy |
| --- | --- | --- |
| figure media | non-editable block atom | before/after cursor edge와 explicit node selection만 가진다. |
| mention | non-editable inline atom | inline cursor stream의 before/after edge만 가진다. |
| editable figure caption | 없음 | future container block으로 설계한다. 기본값은 nested editor가 아니다. |
| iframe/embed 내부 focus | 없음 | 현재는 editor selection owner가 아니다. future iframe은 focus 진입 전 outer active leaf를 flush해야 한다. |
| nested editor | 없음 | inner root가 key/composition/selection/clipboard를 소유하는 별도 owner일 때만 허용한다. |
| `contenteditable=false` 안 editable island | 없음 | current renderer에서는 금지한다. browser trace와 owner contract 없이는 지원하지 않는다. |

## Decision matrix

| 요구 | 설계 선택 | 이유 |
| --- | --- | --- |
| 단순 이미지 | block atom `figure` | 내부 cursor가 없고 media만 한 단위로 선택/삭제하면 충분하다. |
| 이미지와 짧은 caption | container block | caption은 outer document의 inline children으로 두면 selection, history, clipboard가 같은 canonical model에 남는다. |
| 복잡한 embed 설정 UI | non-editable atom + widget event owner | document content selection과 UI button/resize/focus event를 섞지 않는다. |
| 독립 문서 편집기 | nested editor owner | inner state/history/selection이 독립이면 outer root event handler가 처리하면 안 된다. |
| third-party iframe | non-editable atom 또는 external focus owner | iframe DOM selection은 outer document position으로 안정적으로 매핑하지 않는다. |
| `contenteditable=false` wrapper 안 editable child | 금지 | Firefox nested editable arrow 차이처럼 browser native movement 자체가 일관되지 않다. |

## Focus and selection handoff policy

| 전환 | policy |
| --- | --- |
| outer text leaf -> inner owner | 먼저 outer active text leaf를 flush한다. Composition 중이면 inner focus를 editor command로 처리하지 않는다. |
| inner owner active | outer root는 inner에서 bubble된 keydown, beforeinput, input, composition, copy, cut, paste를 document command로 처리하지 않는다. |
| inner selection 존재 | outer canonical selection은 inner DOM selection을 그대로 저장하지 않는다. Future state는 `suspended outer selection` 또는 explicit node selection 중 하나로 분리해야 한다. |
| inner boundary Backspace/Arrow | browser native crossing에 맡기지 않는다. inner owner가 boundary command를 명시적으로 outer handoff command로 넘길 때만 outer selection으로 이동한다. |
| iframe focus 진입 | outer active leaf flush 후 outer selection을 보존하거나 iframe atom node selection으로 고정한다. iframe 내부 selection은 canonical point가 아니다. |
| outer 복귀 | inner owner가 committed selection/exit edge를 제공하지 않으면 outer는 마지막 valid canonical selection 또는 node edge로 복귀한다. |

## Clipboard and keyboard ownership

| scenario | owner | policy |
| --- | --- | --- |
| outer node/range selection copy | outer editor | canonical document slice를 serialize한다. |
| inner text selection copy/cut | inner owner | outer root는 non-active editor clipboard event를 처리하지 않는다. |
| outer selected atom cut | outer editor | selected atom을 canonical command로 삭제한다. |
| inner selection cut | inner owner | Lexical #3177 같은 non-active editor cut 중복을 막아야 한다. |
| paste while outer atom selected | outer editor | selected atom/range replacement command로 처리한다. |
| paste inside inner owner | inner owner | outer paste reader가 clipboard를 훔치지 않는다. |
| Arrow/Backspace at inner boundary | inner owner -> explicit handoff | native bubbling이나 browser nested editable movement에 의존하지 않는다. |

## Required trace scenarios

| id | scenario | 기대 판정 |
| --- | --- | --- |
| NE-01 | selected figure에서 caption 진입 | outer active leaf flush, figure node selection 해제, caption caret 진입이 분리되어야 한다. |
| NE-02 | caption 시작점에서 Backspace | native deletion이 아니라 inner boundary command가 outer figure edge 또는 previous block으로 handoff한다. |
| NE-03 | caption 끝점에서 ArrowRight | browser native crossing에 맡기지 않고 explicit exit edge로 처리한다. |
| NE-04 | inner selection cut | outer document cut handler가 동시에 실행되지 않아야 한다. |
| NE-05 | outer figure node selection copy/cut | inner caption selection이 없으면 outer atom/range selection이 clipboard source다. |
| NE-06 | iframe click/focus after active IME text leaf | outer composition/native leaf가 먼저 flush되거나 focus 이동이 보류되어야 한다. |
| NE-07 | `contenteditable=false` wrapper 안 editable child ArrowUp/Down | Firefox/Chrome/WebKit 차이를 trace로 보관하고 current renderer 지원에서 제외한다. |
| NE-08 | inner owner blur 후 outer click | inner selection을 canonical outer text point로 오해하지 않는다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| current nested editable 부재 | source 확정 | `DocumentRenderer.tsx`는 `figure`/`mention` atom만 렌더하고 caption/iframe/nested root가 없다. | future product scope가 생기면 확장해야 한다. |
| caption은 container block 우선 | 설계 확정 | `docs/rich-model-design.md`가 `FigureWithCaption`을 future container block으로 제시한다. | 실제 schema/commands는 아직 없다. #75에서 설계한다. |
| `contenteditable=false` 안 editable island 금지 | 정책 확정 | Lexical #3143은 Firefox native arrow movement 차이를 최소 HTML로 보고했고, current repo에는 browser trace가 없다. | 실기기/browser matrix는 #76에서 수집해야 한다. |
| non-active nested editor event 처리 금지 | 외부 사례 확정 | Lexical #3177은 nested editor cut에서 non-active editor 처리를 막은 수정이다. | current repo에는 nested editor fixture가 없다. |
| iframe focus stealing 위험 | 외부 사례 확정 | Lexical #5784는 iframe load 후 focus stealing과 scroll 이동을 막았다. | current repo에는 iframe embed가 없다. |
| decorator/caption/selection 장기 위험 | 외부 사례 부분확정 | Lexical changelog에는 decorator node cursor, image caption import/export, nested editor event/collab 수정이 반복된다. | 개별 구현 세부를 current editor에 그대로 적용한다는 뜻은 아니다. |
| outer active leaf flush 필요 | 정책 확정 | current contenteditable buffer는 command/focus 전 flush를 전제로 하고 iframe/nested focus도 같은 boundary다. | 실제 iframe focus event ordering은 #76 trace가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| current renderer에 generic nested selection owner 추가 | 제거 확정 | 실제 nested editor producer가 없어서 죽은 abstraction이 된다. |
| current figure atom에 editable caption DOM 추가 | 제거 확정 | block atom은 내부 cursor가 없다. caption은 atom을 깨고 container block으로 설계해야 한다. |
| `contenteditable=false` wrapper 안 editable child 지원 | 제거 확정 | browser native arrow/focus behavior가 불안정하고 현재 trace가 없다. |
| iframe 내부 selection을 outer canonical point로 매핑 | 제거 확정 | iframe selection은 다른 document/window owner다. |
| future container caption 설계 | 유지 | 같은 document model 안에 두면 selection/history/clipboard를 outer model로 처리할 수 있다. |
| future true nested editor owner | 보류 | inner state/history/selection이 독립인 제품 요구가 생길 때만 추가한다. |

## 후속 이슈

| issue | 목적 |
| --- | --- |
| #75 | figure caption을 같은 canonical document의 container block으로 설계한다. |
| #76 | nested editable과 iframe focus/selection handoff를 실제 브라우저 trace로 수집한다. |

## 현재 결론

현재는 nested editable을 구현하지 않는다. Figure는 계속 non-editable block atom이고,
editable caption은 nested editor가 아니라 future container block으로 설계한다.

진짜 nested editor나 iframe embed가 필요해지면 먼저 owner boundary를 만든다. Inner
owner가 key/composition/selection/clipboard를 소유하고, outer root는 active text leaf
flush와 explicit boundary handoff만 담당해야 한다.
