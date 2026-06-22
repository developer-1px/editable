# Editor custom selection handoff audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. ProseMirror `NodeView.setSelection` 사례를
근거로, 우리 editor에서 custom DOM selection owner를 언제 허용할지와 실패 시
fallback을 정한다.

## 목적

현재 editor의 canonical selection은 `RichSelection`이고, native DOM selection은
`contentEditableSelection` adapter가 읽고 복원한다. 하지만 caption, embedded code
editor, math field처럼 노드 내부가 자체 DOM selection을 소유하는 순간에는 outer
editor가 내부 Range를 직접 만들 수 없다.

이 문서는 지금 당장 public selection API를 넓히지 않고, custom selection owner가
생길 때 필요한 handoff 경계와 fixture spec만 고정한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| ProseMirror `NodeView.setSelection` | custom node view가 자기 내부 selection 설정을 override할 수 있는 hook이다. |
| ProseMirror `ViewDesc.setSelection` | selection이 한 child 안에 완전히 들어가면 child에게 위임하고, custom node에서 밖으로 나가는 selection은 best effort로 DOM position을 찾는다. |
| ProseMirror DOM selection path | 실제 native selection 설정은 `Selection.extend`, BR/contenteditable=false kludge, Range fallback에 따라 갈린다. |
| `src/editor/internal/view/contentEditableSelection.ts` | 현재 DOM selection bridge는 `.text-run[data-path]`와 block backing leaf만 canonical cursor point로 변환한다. Custom owner protocol은 없다. |
| `src/editor/internal/react/DocumentRenderer.tsx` | 현재 mention과 figure는 `contentEditable={false}` atom으로 렌더된다. 내부 editable selection을 소유하지 않는다. |
| `docs/editor-selection-model-audit.md` | public selection type은 `RichSelection`이고 `caret`/`range`/`node` 세 variant만 확정한다. |
| `docs/editor-native-selection-bridge-audit.md` | native selection bridge는 internal view adapter이며 document truth가 아니다. |
| `docs/editor-figure-media-trust-audit.md` | current figure는 block atom이고 caption/metadata/editor sub-tree는 schema 밖이다. |

## 현재 custom selection owner 판정

| node/surface | 현재 판정 | 이유 |
| --- | --- | --- |
| mention inline atom | owner 아님 | `contentEditable=false` inline atom이다. Selection은 before/after edge 또는 node/range render derivation으로 충분하다. |
| figure block atom | owner 아님 | 현재 figure는 image-only block atom이다. Caption이나 nested editable DOM이 없다. |
| codeBlock | owner 아님 | 현재 code block은 document text leaf가 canonical source다. CodeMirror/Monaco 같은 별도 editor가 아니다. |
| figure caption | 후보 | caption이 schema에 들어오고 caption DOM이 outer text-run과 다르게 selection을 소유하면 handoff가 필요하다. 현재는 schema 밖이다. |
| embedded code editor | 강한 후보 | CodeMirror/Monaco 등은 자체 selection, IME, scroll, bidi policy를 가진다. Outer editor가 내부 DOM Range를 직접 만들면 안 된다. |
| math block/inline math field | 강한 후보 | MathLive 같은 내부 field는 linear text offset과 visual caret topology가 다를 수 있다. |
| nested text input/form control | 후보 | input/textarea는 browser-native selection owner다. Outer document selection과 focus ownership을 분리해야 한다. |
| iframe/embed | 내부 selection owner 아님 | iframe 안 selection은 same-document DOM Range가 아니다. Outer editor에서는 atom focus/selection handoff만 가능하다. |

현재 결론: 실행 가능한 custom owner node type은 없다. 지금 public API나 runtime
selection state에 owner DTO를 추가하면 가짜 추상화가 된다.

## Handoff policy

| 상황 | 정책 |
| --- | --- |
| selection이 custom owner 내부에 완전히 있음 | outer editor는 owner에게 internal selection 설정을 위임한다. Owner가 성공/실패를 명시해야 한다. |
| selection이 custom owner 내부에서 시작해 밖으로 확장됨 | 내부 임의 DOM Range를 만들지 않는다. Owner 쪽 endpoint는 owner start/end boundary로 clamp하고, outer endpoint만 canonical cursor point로 둔다. |
| selection이 밖에서 시작해 custom owner 내부로 확장됨 | 위와 동일하게 owner boundary를 range endpoint로 사용한다. 내부 field의 중간 offset을 outer range endpoint로 노출하지 않는다. |
| owner가 hidden/offscreen/unmounted 상태 | native selection 설정 실패로 취급한다. Canonical selection은 유지하되 DOM selection은 유효한 outer edge로 복원하거나 clear한다. |
| owner `setSelection` 실패 | document를 mutate하지 않는다. Stale native selection을 버리고 atom before/after edge 또는 selected-node affordance로 fallback한다. |
| browser `Selection.extend` 미지원 | Range fallback은 outer DOM selection에만 사용한다. Owner 내부 selection은 owner protocol 없이 Range로 강제하지 않는다. |

## Future internal handoff shape

아래 shape는 public API가 아니다. Custom owner node type이 생기기 전에는 코드로
추가하지 않는다.

```ts
type CustomSelectionHandoff =
  | { kind: "none" }
  | {
      kind: "node-internal";
      nodePath: string;
      owner: string;
      anchor: unknown;
      focus: unknown;
      direction?: "forward" | "backward";
    }
  | {
      kind: "cross-boundary";
      nodePath: string;
      nodeEdge: "before" | "after";
      externalPoint: unknown;
      internalBoundary?: "start" | "end";
    };
```

`anchor`/`focus`는 owner-local DTO여야 한다. Outer editor의
`/root/children/.../text@offset`처럼 위장하면 안 된다.

## Fixture spec

현재 실행 fixture는 만들지 않는다. 실행 가능한 custom owner node가 없기 때문이다.
대신 custom owner가 추가될 때 그대로 테스트로 승격할 spec을 고정한다.

| fixture | 문서 | 조작 | 기대 |
| --- | --- | --- | --- |
| `custom-node-internal-selection-owner` | paragraph, custom owner node, paragraph | owner 내부에서 drag 또는 Shift+Arrow로 내부 range 선택 | outer `RichSelection`은 내부 text path를 invent하지 않는다. Owner handoff state만 갱신하고 native selection 설정은 owner가 담당한다. |
| `custom-node-cross-boundary-range-forward` | paragraph A, custom owner node, paragraph B | owner 내부 중간에서 paragraph B 쪽으로 Shift+Arrow 확장 | owner endpoint는 `after` boundary로 clamp된다. Paragraph B endpoint는 canonical cursor point다. |
| `custom-node-cross-boundary-range-backward` | paragraph A, custom owner node, paragraph B | paragraph B에서 owner 내부 쪽으로 Shift+Arrow 확장 | owner endpoint는 `after` 또는 `before` boundary 중 movement 방향에 맞춰 clamp된다. 내부 중간 offset을 outer range로 저장하지 않는다. |
| `custom-node-set-selection-failure` | custom owner node가 hidden/offscreen 상태 | stored selection restore | document mutation 없음. Canonical selection 유지. DOM selection은 outer valid edge로 복원하거나 clear. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| 현재 custom owner 부재 | source/docs 확정 | renderer와 schema에서 mention/figure/codeBlock은 atom 또는 canonical text leaf다. Caption/embed/math nested editor는 없다. | future schema 확장 시 다시 판정해야 한다. |
| public `RichSelection` 유지 | 확정 | selection audit과 public facade가 `caret`/`range`/`node`만 노출한다. | custom owner가 product requirement가 되면 별도 internal DTO가 필요할 수 있다. |
| 내부 native selection bridge 한계 | 확정 | `contentEditableSelection`은 text-run/block backing leaf 변환만 책임진다. | custom owner protocol은 아직 구현되지 않았다. |
| ProseMirror handoff 필요성 | source 조사 확정 | `NodeView.setSelection`과 `ViewDesc.setSelection`은 custom node 내부 selection 위임과 cross-node best-effort를 분리한다. | ProseMirror의 구현을 그대로 복제한다는 뜻은 아니다. |
| fixture spec | 정책 확정 | owner 내부-only, cross-boundary, failure case를 분리했다. | 현재 실행 가능한 node type이 없어 runtime fixture는 보류한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| current runtime custom owner abstraction | 제거/보류 | 실제 producer가 없다. 지금 만들면 pass-through 또는 dead code가 된다. |
| public selection union 확장 | 제거/보류 | current public surface는 local document selection만 다룬다. Owner-local DTO를 public으로 노출할 근거가 없다. |
| owner 내부 DOM Range 강제 설정 | 금지 | custom owner가 own selection policy를 가진다는 전제와 충돌한다. |
| owner boundary fallback | 유지 | cross-boundary range를 outer document selection으로 표현하려면 owner 내부 중간점 대신 before/after edge가 필요하다. |
| fixture spec 문서화 | 유지 | future caption/embed/math editor가 들어올 때 어떤 테스트가 P0인지 미리 고정한다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| owner-local DTO shape | 실제 owner가 없다. CodeMirror, MathLive, caption text-run은 서로 다른 selection shape를 가진다. | 첫 custom owner node type을 정한 뒤 internal DTO를 좁게 만든다. |
| cross-boundary visual affordance | boundary clamp만으로 UX가 충분한지, selected-node overlay가 필요한지 current product requirement가 없다. | custom owner 구현 시 visual selection audit과 함께 결정한다. |
| focus handoff | iframe/input/editor widget은 focus ownership과 keyboard routing이 selection handoff와 결합된다. | owner node type별 `stopEvent`/keymap/focus policy를 같이 정한다. |
| offscreen/virtualized owner restore | 현재 renderer virtualization이 없다. | virtualization이 생기면 owner mount lifecycle과 selection restore queue를 설계한다. |

## 현재 결론

지금 구현해야 할 것은 없다. 현재 editor에는 custom DOM selection owner가 없고,
mention/figure/codeBlock은 existing `RichSelection`과 native selection bridge로
충분하다.

나중에 custom owner가 생기면 outer editor는 내부 DOM Range를 직접 만들지 않고,
내부-only selection은 owner에게 위임하며, cross-boundary selection은 owner
before/after edge로 clamp한다. 실패 시 document mutation 없이 canonical selection을
유지하고 stale native selection만 정리한다.
