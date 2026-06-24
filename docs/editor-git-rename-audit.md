# Editor Git Rename Audit

작성일: 2026-06-21
갱신일: 2026-06-22

범위: 현재 dirty workspace 기준. 이 문서는 editor tree 재배치가 accidental
deletion인지, 의도된 boundary refactor인지 구분한다. git staging 전이므로
`git status`가 rename으로 보여 준다고 가정하지 않는다.

## 현재 git 상태

`git status --short` 기준으로 legacy editor tree는 삭제로 보이고, 새 tree는
untracked로 보인다.

| 항목 | 수 | 판정 |
| --- | ---: | --- |
| tracked legacy editor files under `src/editor/components`, `model`, `fixtures`, `testing` | 39 | 삭제로 표시된다. |
| current files under `src/editor/internal`, `public`, `react` | 75 | untracked 새 tree로 표시된다. 현재 분포는 `internal` 70개, `public` 3개, `react` 2개다. |
| legacy basename이 새 tree에 그대로 존재하는 파일 | 37 / 39 | rename/refactor 근거다. |
| legacy basename이 새 tree에 없는 파일 | 2 / 39 | 이름이 바뀐 대체로 봐야 한다. |
| unstaged temp-tree rename detection | 32 rename / 43 create / 7 delete | index를 건드리지 않고 HEAD legacy tree와 current new tree를 `/tmp`에 복사한 뒤 `git diff --no-index --find-renames=35% --summary`로 2026-06-22 재확인했다. |
| unstaged plain git diff | 39 delete only | 현재 새 tree는 untracked라서 `git diff --summary --find-renames -- src/editor`는 새 파일을 보지 못한다. staging 전 rename 근거로 쓰면 안 된다. |

basename 기준으로 대응되지 않는 legacy 파일은 둘이다.

- `src/editor/components/editingHostInputSession.ts`
- `src/editor/components/editingHostInputSession.test.ts`

현재 대응 implementation은 `src/editor/internal/view/contenteditable/contentEditableViewEngine.ts`와
`contentEditable view split tests`다. 단순 rename이 아니라
contenteditable transfer, reset/restore, composition start offset, DOM selection
helper export까지 들어간 view module 확장이다.

## 확정으로 말할 수 있는 것

- 기존 `components`, `model`, `fixtures`, `testing` public-ish path는 현재
  verifier에서 legacy import로 차단된다.
- 새 public entrypoint는 `src/editor/public`과 `src/editor/react`다.
- implementation은 `src/editor/internal` 아래 model/view/react/debug/testing으로
  나뉜다.
- `pnpm run verify:boundaries`가 현재 import 경계를 통과한다.
- README와 `docs/editor-public-surface-audit.md`가 새 import seam을 문서화한다.
- legacy basename 39개 중 37개가 새 tree에 남아 있고, 나머지 2개는
  `contentEditableViewEngine`으로 대체된 근거가 있다.
- 임시 old/new tree 비교에서 Git similarity detection도 32개 rename을 잡는다.
  Korean IME fixtures, model command/test files, renderer/selection files,
  `DebugRecordingInspector`, `editorTraceReplay`, `cursorGeometry`,
  `editingHostInputSession.ts` -> `contentEditableViewEngine.ts`가 rename으로 잡혔다.
- 현재 plain unstaged diff가 delete-only로 보이는 것은 새 tree가 untracked라서 생기는
  git presentation 문제다. 이 사실만으로 editor implementation이 빠졌다고 판단할
  근거는 아니다.

이 범위에서는 accidental deletion보다 intentional boundary refactor라는 증거가
강하다.

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| legacy delete presentation | 확정 현재 상태 | `git status --short`와 plain `git diff --summary --find-renames -- src/editor`는 tracked legacy tree 39개를 delete-only로 보여준다. 새 tree가 아직 untracked이기 때문에 이 출력만으로 rename 여부를 판단하면 안 된다. |
| current new tree inventory | 확정 현재 상태 | 현재 `src/editor/internal`, `src/editor/public`, `src/editor/react` 아래 file inventory는 75개이고 분포는 internal 70, public 3, react 2다. |
| basename continuity | 확정 근거 | tracked legacy file 39개 중 37개는 새 tree에 같은 basename이 남아 있다. basename이 없는 2개 `editingHostInputSession.*`는 `contentEditableViewEngine.*`으로 확장 대체된 근거가 있다. |
| temp-tree similarity evidence | 확정 snapshot | staging을 건드리지 않고 HEAD legacy tree와 current new tree를 임시 디렉터리에 복사해 비교하면 `git diff --no-index --find-renames=35% --summary`가 32 rename, 43 create, 7 delete를 잡는다. 이것은 boundary refactor 근거이지 PR presentation 보장은 아니다. |
| public/react/internal seam preservation | 확정 | README, public surface audit, internal module audit, boundary verifier가 external import seam을 `src/editor/public`과 `src/editor/react`로 제한하고 hidden implementation을 `src/editor/internal`로 둔다. |
| accidental deletion interpretation | 제거 확정 | delete-only unstaged diff만 보고 editor implementation 삭제라고 해석하면 untracked new tree, basename continuity, temp-tree similarity, passing boundary/internal verification을 누락한다. |
| pure rename interpretation | 제거 확정 | 새 tree가 legacy 39개보다 훨씬 많은 75개이고 facade/debug/view/model split과 새 verifier/test files가 포함된다. 따라서 단순 rename이라고 설명하면 실제 변경을 축소한다. |
| PR/commit rename presentation | 미정 | git index에는 old delete와 new add가 함께 stage되어 있지 않다. 실제 리뷰에서 rename으로 보일지는 staging 방식과 `git diff --cached --summary --find-renames` 결과를 봐야 한다. |

## 아직 애매한 것

- git index에는 아직 rename으로 stage되어 있지 않다. 따라서 PR/commit 리뷰에서
  rename으로 보일지, delete/add로 보일지는 staging 방식과 git similarity
  detection에 달려 있다.
- 새 tree는 75개 파일이라 legacy 39개보다 많다. 추가 파일에는 facade,
  boundary verifier, debug split, view split, clipboard, command strategy,
  selection helper가 포함된다. 그러므로 전체 변경을 pure rename이라고 부르면
  틀리다.
- 임시 no-index 비교는 staging 없이 similarity 근거를 만들지만, 실제 PR/commit
  presentation을 보장하지는 않는다. 현재처럼 새 tree가 untracked인 동안 plain
  `git diff --summary --find-renames -- src/editor`는 삭제만 보여 준다.
  PR/commit presentation은 old delete와 new add를 같이 stage한 뒤
  `git diff --cached --summary --find-renames`로 확인해야 한다. rename similarity가
  낮게 잡히더라도 현재 결론은 pure rename이 아니라 intentional boundary refactor로
  설명해야 한다.

## 스테이징 전 확인 규칙

이 refactor를 stage/commit하기 전에는 아래를 같이 확인해야 한다.

- `pnpm run verify:boundaries`
- `pnpm run verify:internal -- --repeat=1`
- `git status --short`
- 필요하면 HEAD legacy tree와 current new tree를 임시 디렉터리에 복사해
  `git diff --no-index --find-renames=35% --summary`로 similarity evidence를 다시 만든다.
- old delete와 new add를 같이 stage한 뒤
  `git diff --cached --summary --find-renames`로 PR/commit presentation을 확인한다.

리뷰 설명은 "old editor tree deleted"가 아니라 "legacy editor paths moved behind
`src/editor/internal`, with `src/editor/public` and `src/editor/react` facades"로
적는 것이 맞다.
