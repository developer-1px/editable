# Editor Static Assets Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `public/`에 포함되어 Vite build output으로
복사되는 정적 asset이 현재 editor app의 확정 surface인지, starter 잔여물인지,
또는 제품 정책으로 아직 닫히지 않은 영역인지 구분한다.

## 판정

현재 확정 public asset은 `public/sample-figure.svg` 하나다. 이 파일은 app
branding이나 product illustration이 아니라, default document와 toolbar figure
insert가 참조하는 deterministic sample figure fixture다.

반대로 React/TanStack starter public files는 제거 확정이다. `manifest.json`은
root route에서 링크되지 않고, 내용도 `Create TanStack App Sample`/`TanStack App`
이라 현재 app identity와 맞지 않았다. `logo192.png`, `logo512.png`,
`favicon.ico`는 React starter artwork였고, `robots.txt`는 explicit crawl policy
없이 allow-all default만 반복했다.

## 확정 근거

| Surface | 확정 범위 | 근거 |
| --- | --- | --- |
| public directory inventory | 현재 `public/`의 top-level file은 `sample-figure.svg` 하나다. Starter manifest/icon/robots files는 현재 트리에 없다. | `find public -maxdepth 2 -type f`, `rg manifest/favicon/logo/robots` |
| sample figure asset | `public/sample-figure.svg`는 default document figure와 toolbar figure insert가 쓰는 fixture image다. | `src/editor/internal/model/noteDocument.ts`, `src/editor/internal/react/block-editor/BlockEditor.tsx` |
| build copy behavior | Vite build output에는 `dist/client/sample-figure.svg`가 생기고, 현재 파일 내용은 `public/sample-figure.svg`와 동일하다. | `find dist/client`, `cmp public/sample-figure.svg dist/client/sample-figure.svg` |
| figure serialization | figure src가 markdown/copy/static rendering tests에서 `/sample-figure.svg`로 고정된다. | markdown split tests, `clipboard split tests`, `DocumentRenderer split tests`, `note document split tests` |
| no linked web manifest | root head는 stylesheet만 링크한다. web app manifest를 product surface로 노출하지 않는다. | `src/routes/__root.tsx` |

## 제거 확정 근거

| 제거 항목 | 왜 제거했는가 | 검증 근거 |
| --- | --- | --- |
| `public/manifest.json` | root head에서 링크하지 않고, 이름이 TanStack starter app이었다. 유지하면 배포 artifact가 app identity를 잘못 말한다. | `rg`, `src/routes/__root.tsx`, removed file |
| `public/logo192.png` | React logo였지만 default figure fixture로 쓰이고 있었다. fixture 역할은 `sample-figure.svg`로 대체하고 starter artwork는 제거했다. | `rg /logo192.png`, updated tests |
| `public/logo512.png` | manifest에서만 참조되던 React starter icon이었다. manifest 제거 후 사용처가 없다. | `rg logo512.png`, removed file |
| `public/favicon.ico` | explicit root head link가 없고 React starter icon이었다. 제품 favicon policy 없이 잘못된 brand icon을 배포하지 않는다. | `file`, removed file |
| `public/robots.txt` | allow-all default만 반복하고, 현재 app에 crawl/indexing policy가 없다. 없을 때와 의미 차이가 거의 없어 public surface만 늘린다. | file content, removed file |

## 아직 애매하거나 제품 결정으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| product favicon | React starter favicon은 제거했지만, Editable product favicon을 만들지는 않았다. | 제품 brand/icon direction이 생기면 root head link와 asset을 같이 추가한다. |
| PWA/web manifest | 현재 app은 installable PWA contract를 선언하지 않는다. | install/start_url/display/theme color가 제품 요구가 되면 manifest를 새로 설계한다. |
| crawl policy | `robots.txt` allow-all은 제거했지만, indexing을 막거나 sitemap을 제공하는 정책은 없다. | public deployment SEO/indexing policy가 필요할 때 추가한다. |
| sample figure final visual | `sample-figure.svg`는 fixture image지 최종 product illustration이 아니다. | default document content를 제품 onboarding/demo로 삼을지 결정하면 asset도 다시 평가한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| React/TanStack starter manifest/icons | 제거 확정 | 현재 app identity와 맞지 않고, source/root head에서 product surface로 요구되지 않는다. |
| `sample-figure.svg` | 유지 확정 | figure block의 default/example path를 테스트 가능한 local asset으로 유지한다. |
| product favicon/PWA manifest/robots policy 추가 | 보류 | 새 제품 정책과 brand surface를 만드는 일이다. 현재 결함을 고치는 축소가 아니다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| public directory inventory | 확정 | `find public -maxdepth 1 -type f` 기준 current public top-level file은 `public/sample-figure.svg` 하나다. | Future product favicon/PWA/crawl asset을 금지한다는 뜻은 아니다. |
| removed starter asset absence | 확정 | Current tree에서 `public/manifest.json`, `favicon.ico`, `logo192.png`, `logo512.png`, `robots.txt`는 삭제 상태이고, `rg`는 runtime source에서 해당 starter asset 참조를 찾지 않는다. | 과거 starter 파일 내용의 모든 배포 이력을 증명하는 것은 아니다. |
| sample figure fixture role | 확정 | `initialNoteDocument`와 `BlockEditor` toolbar insertion이 `/sample-figure.svg`와 `alt: "Figure"`를 사용하고, BlockEditor split tests가 toolbar figure insertion src를 고정한다. | Product media picker/upload/default onboarding visual contract가 아니다. |
| figure render/serialization path | 확정 | `DocumentRenderer split tests`, markdown split tests, `clipboard split tests`, `note document split tests`가 `/sample-figure.svg` figure render, markdown fallback/export, clipboard markdown fallback, initial rich document seed를 검증한다. | User-provided remote image trust, SVG sanitization, broken-media UX는 별도 media policy다. |
| build copy behavior | 확정 | `pnpm build` 뒤 Vite static copy가 `dist/client/sample-figure.svg`를 생성하고, `cmp public/sample-figure.svg dist/client/sample-figure.svg`로 source와 build output 동일성을 확인할 수 있다. | `verify:internal`은 build success와 route tree stability를 보장하지만 asset byte equality는 이 audit의 별도 확인이다. |
| no linked web manifest | 확정 | `src/routes/__root.tsx` root head links는 stylesheet뿐이며 web app manifest link가 없다. | Installable PWA를 제품 범위에서 배제한다는 결정은 아니다. |
| starter favicon/logo restoration | 제거 확정 | Current app identity와 맞지 않는 starter brand surface이고, remaining source/tests는 `/sample-figure.svg` fixture로 닫혀 있다. | Editable product favicon/logo 요구가 생기면 새 asset으로 설계해야 한다. |
| allow-all robots restoration | 제거 확정 | Current route/head/deployment policy에는 crawl/indexing contract가 없고 allow-all starter file은 별도 의미 없이 public surface를 늘린다. | SEO/indexing 차단이나 sitemap policy는 아직 정하지 않았다. |
| product favicon and PWA manifest | 미정 | Current source는 favicon/manifest를 link하지 않고 product icon/install metadata 요구도 없다. | Brand/PWA 요구가 생기면 root head link, manifest content, icon sizes, theme color를 함께 설계한다. |
| crawl policy and final demo visual | 미정 | `robots.txt`와 final default figure visual은 current fixture tests의 범위 밖이다. | Public deployment SEO와 onboarding/demo visual direction이 정해질 때 별도 asset policy로 추가한다. |

## 현재 결론

static asset surface에서 빼면 안 되는 확정은 deterministic figure fixture인
`public/sample-figure.svg`뿐이다. React/TanStack starter public assets는 제거했다.
아직 확정하면 안 되는 것은 제품 favicon, PWA manifest, crawl policy, final demo
figure visual direction이다.
