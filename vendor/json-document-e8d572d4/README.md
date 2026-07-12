# json-document dogfood artifacts

These packages were built from merged `json-document` commit
`e8d572d4af1d6570dde2783972e40b9f914236c2` (PR #232). They keep this
integration tracer independent from an npm release and make the exact upstream
code under test reviewable.

## Rebuild

From a clean checkout of that commit in `../json-document`:

```sh
npm ci
npm run build
npm pack --pack-destination ../editable/vendor/json-document-e8d572d4 ./labs/extensions/causal-patch-inbox
npm pack --pack-destination ../editable/vendor/json-document-e8d572d4 ./packages/id-resolver
npm pack --pack-destination ../editable/vendor/json-document-e8d572d4 ./labs/extensions/patch-rebase
npm pack --pack-destination ../editable/vendor/json-document-e8d572d4 ./labs/extensions/stable-id-rebase
```

## SHA-256

```text
7fae978a0449b6d7e705be959703edad17c16b4d67868ee8d18498302daecf04  interactive-os-json-document-causal-patch-inbox-0.1.0.tgz
d0787346d5a566fbbf4847343f519f761ba25e9a79762663167eaba7413ce8bf  interactive-os-json-document-id-resolver-0.1.0.tgz
88a20dd7d755b2befb365e74fffce860573abcc392eb74c9aa44976fb9578b64  interactive-os-json-document-patch-rebase-0.1.0.tgz
5e246ee1b82c06598b1a89ac0f85cea9e826d1730577c04f264519aa93d8512a  interactive-os-json-document-stable-id-rebase-0.1.0.tgz
```
