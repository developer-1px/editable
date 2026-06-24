import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="contenteditable-shell">
      <a className="home-link" href="/codex">
        Open JSON contenteditable core demo
      </a>
    </main>
  );
}
