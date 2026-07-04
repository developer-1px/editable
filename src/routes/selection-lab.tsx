import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/selection-lab")({
  beforeLoad: () => {
    throw redirect({ search: { surface: "selection-lab" }, to: "/" });
  },
});
