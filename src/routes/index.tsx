import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="contenteditable-shell">
      <a className="home-link" href="/demo">
        Open contenteditable demo
      </a>
      <a className="home-link" href="/selection-lab">
        Open headless cursor lab
      </a>
    </main>
  );
}
