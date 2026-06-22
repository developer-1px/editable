import { createFileRoute } from "@tanstack/react-router";
import { BlockEditor } from "../editor/react";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <BlockEditor />;
}
