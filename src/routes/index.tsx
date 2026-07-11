import { createFileRoute } from "@tanstack/react-router";
import { JsonEditableDemo } from "../editable-lab/JsonEditableDemo";

export const Route = createFileRoute("/")({
  component: JsonEditableDemo,
});
