import { createFileRoute } from "@tanstack/react-router";
import { ContentEditableDemo } from "../contenteditable-demo/ContentEditableDemo";
import { SelectionLab } from "../selection-lab/SelectionLab";

type RootSearch = {
  surface: "demo" | "selection-lab";
};

export const Route = createFileRoute("/")({
  component: Home,
  validateSearch: (search): RootSearch => ({
    surface: search.surface === "selection-lab" ? "selection-lab" : "demo",
  }),
});

function Home() {
  const { surface } = Route.useSearch();
  return surface === "selection-lab" ? (
    <SelectionLab />
  ) : (
    <ContentEditableDemo />
  );
}
