# Editor DOM position equivalence audit

작성일: 2026-06-22

범위: browser native selection의 DOM node/offset이 canonical model cursor point로
왕복될 때, equivalent DOM position, bias, `contenteditable=false` atom 경계를 어떻게
수렴시킬지 정리한다.

## 목적

브라우저는 같은 시각적 caret을 여러 DOM position으로 표현할 수 있다. 예를 들어 text
node 끝, text-run element의 child boundary, parent block의 child boundary는 같은
위치를 가리킬 수 있다. 반대로 `contenteditable=false` atom 앞뒤는 시각적으로 가깝지만
같은 text position이 아니다.

이 문서는 native DOM selection bridge가 어떤 위치를 model text point로 받아들이고,
어떤 위치를 atom/pointer selection path에 맡길지 고정한다.

## ProseMirror-view 근거

| 근거 | 원문 | 의미 |
| --- | --- | --- |
| `isEquivalentPosition`은 text node 끝과 다음 sibling 앞 같은 DOM 위치를 양방향 scan으로 비교한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/dom.ts#L36-L69 | browser DOM position은 1:1 cursor point가 아니다. |
| scan은 atom element와 `contentEditable == "false"`에서 멈춘다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/dom.ts#L44-L60 | atom을 넘어 text 위치를 합치면 안 된다. |
| `localPosFromDOM`은 contentDOM 내부/외부를 나누고 bias로 start/end를 결정한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/viewdesc.ts#L211-L255 | DOM -> model 변환은 edge ambiguity를 명시적으로 다뤄야 한다. |
| `domFromPos`도 side와 zero-length widget을 고려해 DOM node/offset을 만든다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/viewdesc.ts#L308-L338 | model -> DOM 변환도 side/bias가 필요할 수 있다. |

## 현재 규칙

| 입력 DOM position | model 수렴 |
| --- | --- |
| `.text-run[data-path]` 내부 text node offset | 같은 text path와 snapped offset |
| text-run element child boundary | 같은 text path의 start/end offset |
| parent text block child boundary before first text-run | 다음 text-run start |
| parent text block child boundary after text-run | 이전 text-run end |
| parent text block child boundary before `contenteditable=false` atom | 이전 text-run end가 있으면 거기로 수렴 |
| parent text block child boundary after `contenteditable=false` atom | 다음 text-run start가 있으면 거기로 수렴 |
| `contenteditable=false` atom 내부 position | text point로 매핑하지 않음 |
| atom만 있고 인접 text-run이 없는 boundary | text point로 매핑하지 않음 |

핵심은 immediate sibling만 보는 것이다. Atom을 건너 반대편 text-run으로 넘어가면
mention/figure 같은 atom selection과 text insertion position이 섞인다.

## DOM position equivalence table

`contentEditableViewEngine.test.ts`는 아래 table을 실행한다.

| DOM 입력 | 기대 |
| --- | --- |
| first text node offset 5 | first text path offset 5 |
| first text-run element child offset 1 | first text path offset 5 |
| block child offset 0 | first text path offset 0 |
| block child offset 1, atom 앞 | first text path offset 5 |
| block child offset 2, atom 뒤 | second text path offset 0 |
| block child offset 3 | second text path offset 4 |
| second text-run element child offset 0 | second text path offset 0 |
| mention chip `contenteditable=false` 내부 offset | `null` |

## Bias 정책

| API | bias 노출 여부 | 이유 |
| --- | --- | --- |
| `readContentEditableSelection` | 숨김 | browser native selection을 command source로 읽는 narrow adapter다. immediate previous text-run, 없으면 immediate next text-run 순서로 수렴한다. |
| `setContentEditableSelection` | 숨김 | canonical text point를 text node offset으로 복구한다. Atom edge는 text backing point가 있는 block/code path만 처리한다. |
| pointer/coordinate hit testing | 내부 bias 필요 | 좌표는 atom midpoint, line rect, before/after edge를 결정해야 하므로 geometry adapter가 bias를 가진다. |
| future `getComposedRanges`/native Range adapter | 명시 bias 필요 | StaticRange나 browser DOM Range를 general model position으로 바꾸면 start/end side와 atom boundary policy를 interface에 드러내야 한다. |
| public selection API | 노출하지 않음 | public surface는 `RichSelection` caret/range/node이고 DOM bias를 caller에게 배우게 하지 않는다. |

## Hard break와 zero-width widget

현재 schema에는 별도 inline hard-break node나 zero-length widget node가 없다.

| 항목 | 현재 처리 |
| --- | --- |
| code block newline | code text path offset으로 처리하며 geometry audit/test가 줄바꿈 hit testing을 맡는다. |
| empty text-run | `setContentEditableSelection`이 empty text node를 만들어 native caret target을 확보한다. |
| future hard-break inline atom | `contenteditable=false` atom처럼 crossing 금지 또는 별도 text offset policy가 필요하다. |
| future zero-width widget | DOM selection bridge에 넣기 전에 widget identity와 bias를 별도 view adapter로 설계해야 한다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| text-run 내부 offset mapping | 확정 | 기존 `contentEditableViewEngine.test.ts`가 grapheme snapping, mark element boundary, native range를 검증한다. | browser별 Range boundary 차이는 별도 QA다. |
| parent boundary equivalence | 실행 테스트로 확정 | DOM position equivalence table test가 text node, text-run boundary, block child boundary를 비교한다. | jsdom DOM Range 기반이며 real browser selection UI matrix는 아니다. |
| `contenteditable=false` atom barrier | 실행 테스트로 확정 | mention chip 내부 DOM position을 text point로 매핑하지 않는 test가 있다. | atom-only block/inline edge UX는 pointer/model selection path가 담당한다. |
| bias hiding | source 정책으로 확정 | `readContentEditableSelection`/`setContentEditableSelection` public signature에 bias parameter가 없다. | future generic Range adapter에는 명시 bias가 필요할 수 있다. |
| hard break/zero-width widget | 미정 | current schema에 producer가 없다. | producer가 생기면 DOM equivalence table을 확장해야 한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| DOM position general normalizer public API | 보류 | 현재 필요한 것은 contenteditable selection adapter 내부의 수렴 규칙이다. Public API로 빼면 browser DOM detail을 노출한다. |
| atom을 건너 nearest text-run으로 매핑 | 제거 확정 | atom 앞과 뒤는 다른 cursor unit이다. Crossing하면 replacement/copy/delete source가 오염된다. |
| `contenteditable=false` 내부 selection을 text로 해석 | 제거 확정 | atom selection은 pointer/model path가 소유한다. |
| read/write adapter에 bias parameter 추가 | 보류 | 현재 hidden previous-then-next rule과 canonical point restore로 충분하다. |
| hard-break/zero-width widget 선구현 | 보류 | schema producer와 renderer surface가 없으므로 죽은 분기가 된다. |

## 현재 결론

현재 정석은 browser DOM node/offset을 그대로 믿지 않고, renderer의 `.text-run[data-path]`
surface와 immediate sibling equivalence만 사용해 canonical text point로 수렴시키는
것이다. `contenteditable=false` atom은 equivalence scan의 stop marker다.

Bias는 contenteditable selection bridge 내부에서 숨기고, 좌표 기반 hit testing이나
future generic Range adapter처럼 실제 side 선택이 필요한 곳에서만 드러낸다.
