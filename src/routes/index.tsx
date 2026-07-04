import { createFileRoute } from "@tanstack/react-router";
import { ContentEditableDemo } from "../editable-lab/ContentEditableDemo";

export const Route = createFileRoute("/")({
  component: ContentEditableDemo,
});
