# json-document dogfood artifacts

These packages were built from merged `json-document` commit
`218aa475970c922af976b0a66f45539bbe9e5f15` (PR #233). They keep this
integration tracer independent from an npm release and make the exact upstream
code under test reviewable.

## Rebuild

From a clean checkout of that commit in `../json-document`:

```sh
npm ci
npm run build
npm run build -w @interactive-os/json-document-id-resolver
npm run build -w @interactive-os/json-document-patch-rebase
npm run build -w @interactive-os/json-document-stable-id-rebase
npm run build -w @interactive-os/json-document-causal-patch-inbox

npm pack --pack-destination ../editable/vendor/json-document-218aa475 ./labs/extensions/causal-patch-inbox
npm pack --pack-destination ../editable/vendor/json-document-218aa475 ./packages/id-resolver
npm pack --pack-destination ../editable/vendor/json-document-218aa475 ./labs/extensions/patch-rebase
npm pack --pack-destination ../editable/vendor/json-document-218aa475 ./labs/extensions/stable-id-rebase
```

## SHA-256

```text
0a91749463db39ced22213224bc4d6a378c3b021ac8401c00c2b3e243e0fece5  interactive-os-json-document-causal-patch-inbox-0.1.0.tgz
df2efc7daaecb8ceabcd8c7b1af3c299948dc015118edd9d556a7b6abacdd550  interactive-os-json-document-id-resolver-0.1.0.tgz
88a20dd7d755b2befb365e74fffce860573abcc392eb74c9aa44976fb9578b64  interactive-os-json-document-patch-rebase-0.1.0.tgz
ea2139eb6f783a5b5916ec18e7fa7ca87c935e5a4ee0dad137e9412761e77a20  interactive-os-json-document-stable-id-rebase-0.1.0.tgz
```
