# Editor IME signal policy audit

작성일: 2026-06-22

범위: IME composition 중 `KeyboardEvent.isComposing`,
`InputEvent.isComposing`, legacy `keyCode === 229`, `compositionend.data`,
`beforeinput.inputType`을 어느 정도 신뢰할지 정리한다.

## 목적

IME 중 editor command를 막는 기준은 단일 browser event field가 아니다. Browser/OS/IME
조합은 event order, `isComposing`, final commit data, Enter confirmation sequence를
다르게 낸다. 이 문서는 runtime 판단 기준과 debug trace에 남길 evidence를 분리한다.

## 외부 근거

| 근거 | 관찰 | 결론 |
| --- | --- | --- |
| UI Events `isComposing`: https://www.w3.org/TR/uievents/#dom-keyboardevent-iscomposing | `isComposing`은 composition session 안에서 true여야 한다. | spec상 정상 신호지만 browser divergence를 대비해야 한다. |
| UI Events legacy key model: https://www.w3.org/TR/uievents/#keys-legacy | IME가 key input을 처리 중인 keydown이면 legacy `keyCode`는 229가 될 수 있다. 동시에 `keyCode` 값은 implementation-dependent legacy model이다. | `keyCode 229`는 useful diagnostic/fallback hint이지 modern primary API가 아니다. |
| Input Events composition order: https://w3c.github.io/input-events/#input-event-order-during-composition | `insertCompositionText`는 IME composition 일부이고 cancelable이 아니며, data는 compositionupdate와 같고 DOM은 beforeinput 뒤 input 전에 갱신된다. | composition preedit은 preventDefault로 소유하지 않고 native leaf buffer/reconcile로 다룬다. |
| WebKit bug 165004: https://bugs.webkit.org/show_bug.cgi?id=165004 | Safari가 `compositionend` 뒤에 `keydown`/`input`을 보내 Enter confirmation이 `isComposing === false`로 보일 수 있다고 보고됐다. | `isComposing === false`인 Enter도 internal composition phase 안이면 editor command로 즉시 처리하면 안 된다. |
| React #10217: https://github.com/facebook/react/issues/10217 | IE11 Korean IME에서 React `compositionend.data`가 잘못된 값을 낸 사례가 보고됐다. | `compositionend.data`를 model update source로 쓰면 안 된다. |
| ProseMirror-view changelog: https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | Safari composition Enter 오판, compositionend 직후 keydown, mark/non-inclusive boundary, final changes timing 관련 수정이 반복된다. | mature editor도 composition 신호를 내부 상태와 DOM reconciliation으로 보완한다. |
| Lexical changelog: https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | Safari IME, Korean iOS IME, Japanese IME, Firefox emoji composition, Android deletion 등 IME 관련 수정이 반복된다. | OS/browser별 IME matrix는 fixture/trace로 축적해야 한다. |

## Signal matrix

| 신호 | 신뢰도 | 사용처 | 금지 |
| --- | --- | --- | --- |
| internal composition phase | primary runtime state | command suppression, native caret ownership, final commit 기다림 | browser field 없이도 phase를 유지해야 한다. |
| `compositionstart` | phase 시작 trigger | active selection/path capture, native buffer begin | model text commit source로 사용 금지 |
| `compositionupdate.data` | preedit diagnostic | trace evidence, Input Events data 비교 | canonical model source로 사용 금지 |
| `compositionend.data` | unreliable diagnostic | trace evidence | model update source로 사용 금지 |
| `KeyboardEvent.isComposing` | secondary hint | composing 중 keydown pass-through/no-op 보조 | false라고 해서 composition 종료로 단정 금지 |
| `InputEvent.isComposing` | secondary hint | beforeinput/input trace와 adapter no-op 보조 | false final commit을 일반 text input으로 단정 금지 |
| `beforeinput.inputType === "insertCompositionText"` | strong preedit hint | native composition text leaf defer | cancel/preventDefault source로 사용 금지 |
| final `insertText`/`insertFromComposition` data | commit candidate | observed DOM text와 함께 duplicate/final commit normalization | 단독으로 DOM/model truth로 채택 금지 |
| `keyCode === 229` | legacy diagnostic/fallback hint | Safari/WebKit Enter confirmation 조사, debug trace | primary command suppression 조건으로 단독 사용 금지 |

## 현재 runtime policy

| 경로 | 정책 |
| --- | --- |
| `compositionstart` | `contentEditableViewEngine.beginComposition`으로 active text path, start text, start offset을 잡고 React `isComposing` UI state를 켠다. |
| composing 중 `keydown` | `contentEditableEngine.shouldIgnoreKeyDown()`이 true면 command path로 보내지 않고 prevent한다. Plain Enter는 `compositionEnterKeyRef`에 저장한다. |
| composing 중 `beforeinput insertCompositionText` | native contenteditable buffer에 맡긴다. `isComposing`은 보조 신호다. |
| `compositionend` | phase를 `awaitingCommit`으로 넘기고 final commit beforeinput/input 또는 flush를 기다린다. `compositionend.data`로 직접 commit하지 않는다. |
| final commit beforeinput | `commitComposition` decision에서 native leaf flush 또는 active-mark command commit으로 처리한다. |
| Enter confirmation | composition phase에서 잡은 Enter flag가 있으면 final commit 뒤 `Enter` command를 지연 실행한다. |
| stale compositionend | 새 composition이 시작되면 이전 compositionend release를 적용하지 않는다. |

## `compositionend.data` fallback

`compositionend.data`는 diagnostic field다. Model update fallback은 아래 순서다.

1. Active text leaf DOM `textContent`를 읽는다.
2. DOM selection offset을 같은 leaf 안에서 읽고 grapheme boundary로 snap한다.
3. final commit `beforeinput` data가 있으면 duplicate commit 제거나 preedit replacement
   normalization에만 사용한다.
4. DOM text가 관측되지 않았을 때만 final commit candidate를 composition start offset에
   적용하는 engine-level fallback을 쓴다.
5. 그래도 path/DOM/selection을 얻지 못하면 flush 실패로 남기고 canonical renderer reset에
   맡긴다.

## Safari Enter confirmation fixture

Fixture id: `korean-hangul-enter-confirm`

현재 `src/editor/internal/fixtures/ime/koreanHangulEnterConfirmTrace.ts`는 아래 위험 조합을
고정한다.

```text
compositionstart
compositionupdate data="안"
beforeinput insertCompositionText data="안" isComposing=true
input insertCompositionText data="안" isComposing=true
compositionend data="안"
keydown Enter keyCode=229
beforeinput insertText data="안" isComposing=false
```

기대:

- Enter keydown은 즉시 paragraph split으로 새지 않고 prevented된다.
- final composition text가 먼저 commit된다.
- 저장된 Enter confirmation이 final commit 뒤 paragraph split으로 실행된다.
- 최종 caret은 새 paragraph 시작에 collapsed 된다.

## Debug trace policy

Compact debug trace에는 아래 필드를 남긴다.

| 이벤트 | 필드 |
| --- | --- |
| `keydown`/`keyup` | `key`, `code`, `isComposing`, `keyCode`, modifiers |
| `beforeinput`/`input` | `inputType`, `data`, `isComposing` |
| `compositionstart/update/end` | `data` |

`keyCode`와 composition data는 runtime authority가 아니라 evidence다. 특히
`keyCode=229`와 `isComposing=false`가 같이 보이는 Enter는 Safari/WebKit류 ordering
문제를 의심하게 하는 trace marker다.

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| internal phase primary policy | 실행 테스트로 확정 | `BlockEditor.imeTrace.test.tsx`, contentEditable view split tests | 모든 OS/browser IME matrix를 닫지는 않는다. |
| `isComposing` 보조 신호 정책 | source/test로 확정 | `translateEditorInput` no-op guard, React composition guard, WebKit bug evidence | Safari/WebKit fixed 여부와 구버전 지원 범위는 별도 browser QA다. |
| `compositionend.data` non-authority | source/test로 확정 | final commit fallback/duplicate normalization tests, React #10217 evidence | IE11 자체 지원을 선언한다는 뜻은 아니다. |
| Safari Enter confirmation fixture | 실행 테스트로 확정 | `koreanHangulEnterConfirmTrace.ts`, `BlockEditor.imeTrace.test.tsx` | jsdom replay fixture이며 real Safari matrix는 아니다. |
| debug trace IME fields | 실행 테스트로 확정 | `debug interaction split tests`가 keyCode, composing, composition data timeline을 검증한다. | Compact trace는 raw browser event object 전체를 보존하지 않는다. |

## 현재 결론

정석은 `isComposing`, `keyCode 229`, `compositionend.data` 중 하나를 고르는 것이 아니다.
Runtime은 internal composition phase와 active text leaf flush를 기준으로 삼고, browser
fields는 intent/evidence로만 쓴다. Debug trace에는 모든 신호를 남기되, model mutation은
canonical document/selection과 native leaf reconciliation 결과만 반영한다.
