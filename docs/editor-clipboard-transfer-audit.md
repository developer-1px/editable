# Editor Clipboard Transfer Audit

작성일: 2026-06-21

범위: 현재 dirty workspace 기준. clipboard transfer가 빼면 안 되는 현재 기능인지,
아니면 future rich paste를 위해 미리 담긴 metadata인지 분리한다.

## 판정

현재 clipboard transfer seam은 **문자열 중심으로 확정**이다.

- 확정: copy/cut은 `text/plain`, `text/markdown`, editor custom MIME을 쓴다.
- 확정: paste/drop/beforeinput paste는 transfer에서 문자열을 읽어 command layer로
  넘긴다.
- 확정: custom MIME은 same-app text transfer envelope다. 현재 payload는
  `schema`, `plainText`, `markdown`만 담는다. paste reader는 custom MIME을 먼저
  읽고, `markdown`이 있으면 markdown format으로, 없으면 `plainText`를 plain
  format으로 넘긴다.
- 확정: 외부 `text/markdown` fallback은 markdown format으로 command layer에
  전달되며, supported markdown fragment는 bold/italic/code/link mark, mention,
  figure, multi-block fragment로 복원될 수 있다.
- 확정: 외부 `text/uri-list` fallback은 comments/blank lines를 제거하고 plain
  text URL list로 command layer에 전달한다.
- source behavior: custom MIME이 없고 외부 `text/plain`과 `text/markdown`이 둘 다
  있으면 현재 reader는 `text/plain`을 먼저 읽는다. 이것을 rich external paste
  product policy로 닫았다고 말하지는 않는다.
- 확정: custom MIME `markdown`도 same-app deterministic markdown fallback으로
  읽히며, supported marks/link/mention/figure/multi-block fragment를 복원할 수
  있다.
- 확정: custom MIME에 `selectedPointers`, `nodes` 같은 extra metadata가 들어와도
  paste reader contract는 `markdown` 또는 `plainText` 문자열만 반환한다.
- 제거 확정: `selectedPointers`, anchor/focus 같은 selection topology는 current
  payload에서 뺐다.
- 애매: custom MIME에 별도 node graph payload를 추가해 markdown fallback보다 더
  강한 rich restore source로 쓸지는 아직 제품 범위가 아니다.

## 왜 selection topology를 뺐나

`selectedPointers`, anchor/focus는 copy 시점의 selection topology다. 하지만 현재
paste reader가 custom MIME에서 읽는 것은 `markdown`/`plainText` 문자열뿐이다.
custom MIME `markdown`은 deterministic text fallback이라 command layer의 markdown
importer를 재사용할 수 있지만, selection topology나 model node graph를 그대로
복원하는 importer는 없다. topology를 넣어 두면 node graph restore가 이미 current
contract처럼 보이지만 실제 importer는 없다. reader도 extra topology/node metadata를
paste contract로 승격하지 않고 문자열 fallback만 반환한다.

따라서 현재 확정 contract는 versioned text/markdown envelope다. rich node graph
restore가 제품 범위로 결정되면 그때 node payload, migration, trust policy를 따로
설계해야 한다.

## 확정 근거

| 근거 | 의미 |
| --- | --- |
| `serializeSelectionForClipboard` | collapsed selection은 null이고, range/atom selection은 plain text와 markdown fallback을 만든다. |
| `readClipboardTextFromTransfer` | custom `markdown`은 markdown format, custom `plainText`와 `text/plain`은 plain format, `text/markdown`은 markdown format, `text/uri-list`는 plain format으로 읽는다. Current external fallback order is custom MIME, external `text/plain`, external `text/markdown`, then external `text/uri-list`. |
| `BlockEditor` paste/drop handlers | 읽은 text/format을 paste input으로 넘긴다. custom MIME node graph importer를 호출하지 않는다. |
| inputAdapter split tests | plain paste는 문자열 삽입이고, markdown-format paste는 supported marks/link/mention/figure/multi-block fragment를 복원한다. |
| `clipboard split tests` | custom envelope가 `{ schema, plainText, markdown }`만 담고, extra `selectedPointers`/`nodes` metadata를 읽어도 paste result는 text/markdown contract에 머무는 것을 고정한다. |
| BlockEditor split tests, contentEditable view split tests | custom MIME markdown/plain fallback과 paste command path를 검증한다. |

## 증거 강도

| 강도 | 해당 항목 | 현재 의미 |
| --- | --- | --- |
| transfer interface 확정 | `EditorClipboardData` keys, `ClipboardText` `{ text, format }`, `ClipboardFormat` `"plain" | "markdown"`, `editable-clipboard@1` envelope | clipboard module의 좁은 interface는 string plus format이다. Node graph, selection topology, identity restore interface가 아니다. |
| 실행 테스트로 닫힘 | collapsed selection null, text/mark/grapheme/block/atom serialization, custom envelope shape, custom metadata ignore, malformed/wrong schema fallback, beforeinput paste/drop transfer reader, React paste/drop/copy/cut command path, markdown mention/multi-block restore | 현재 regression gate가 직접 잡는 transfer 기준선이다. |
| source behavior로 확인 | external fallback order가 custom MIME -> `text/plain` -> `text/markdown` -> `text/uri-list`인 점, BlockEditor drop handler의 coordinate-based drop point 선택 | 코드 경로는 명확하지만, 모든 browser clipboard 조합이나 product rich external paste preference를 닫은 것은 아니다. |
| adapter complement | `inputAdapter`는 `format: "markdown"`일 때 markdown importer를 시도하고 실패/비-markdown format은 plain text insertion으로 수렴한다. | rich restore는 clipboard payload가 아니라 markdown adapter가 표현할 수 있는 fragment 범위에 묶인다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `text/plain` fallback | 유지 확정 | 브라우저/외부 앱 interop 기본값이다. 제거하면 paste/copy tests와 실제 clipboard interop이 깨진다. |
| `text/markdown` fallback | 유지 확정 | marks/link/mention/figure/multi-block fragment의 deterministic rich-ish fallback이다. 외부 앱으로 나갈 때도 의미가 있다. |
| custom MIME 자체 | 유지 확정 | same-app text/markdown transfer에서 app-owned payload를 우선 읽는 현재 경로가 있다. |
| custom MIME의 `markdown` | 유지 확정 | same-app marks/link/mention/figure/multi-block paste를 markdown importer 경로로 복원하는 현재 contract다. |
| custom MIME의 selection topology | 제거 확정 | 현재 paste implementation이 읽지 않고, extra metadata가 들어와도 reader는 문자열 fallback만 반환한다. rich node restore contract처럼 보이는 불필요한 미래 metadata다. |
| custom MIME rich paste importer | 보류 | node graph 복원, trust boundary, schema migration, merge behavior를 설계해야 한다. |
| external `text/markdown` vs `text/plain` precedence 변경 | 보류 | 현재 source는 plain을 먼저 읽지만, 외부 앱 rich paste UX를 제품 정책으로 검토한 근거는 없다. |

## 현재 결론

clipboard는 “custom MIME node graph paste 완료”가 아니다. 지금 빼면 안 되는 것은
문자열 transfer seam, fallback 순서, 외부/custom MIME markdown fallback의 supported
marks/link/mention/figure/multi-block fragment 복원이다. custom MIME은 versioned
text/markdown envelope로 남기고, reader가 extra node/topology metadata를 받아도
text/markdown result로만 처리한다. markdown으로 표현하지 못하는 selection topology나
model node graph 복원은 명시적인 제품/API 결정 전까지 애매 항목으로 둔다. 또한 외부
`text/plain`과 `text/markdown`이 동시에 있는 paste에서 rich external format을 우선할지
여부도 아직 제품 UX 결정으로 둔다.
