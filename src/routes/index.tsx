import { createFileRoute } from "@tanstack/react-router";
import { BlockEditor } from "../editor/components/BlockEditor";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <BlockEditor />;
}
