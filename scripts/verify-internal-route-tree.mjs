import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCommand } from "./verify-internal-command-runner.mjs";

const ROUTE_TREE_PATH = join(process.cwd(), "src", "routeTree.gen.ts");

export async function runBuildWithRouteTreeCheck(iteration, options = {}) {
  const routeTreePath = options.routeTreePath ?? ROUTE_TREE_PATH;
  const run = options.runCommand ?? runCommand;
  const before = readFileSync(routeTreePath, "utf8");

  await run("pnpm", ["build"], iteration);

  const after = readFileSync(routeTreePath, "utf8");
  if (after === before) {
    return;
  }

  writeFileSync(routeTreePath, before);
  throw new Error(
    "[verify-internal] pnpm build regenerated src/routeTree.gen.ts. Run `pnpm build` and commit the generated output.",
  );
}
