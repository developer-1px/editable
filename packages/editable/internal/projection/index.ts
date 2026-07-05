export type {
  RichProjection,
  RichProjectionBlock,
  RichProjectionPolicy,
  RichProjectionSpan,
  RichProjectionTextChange,
} from "../kernel";
export {
  applyRichProjectionTextChange,
  canonicalEditableAtomAttributes,
  canonicalEditableBlockAttributes,
  canonicalEditableDocumentAttributes,
  canonicalEditableMarkAttributes,
  createRichProjection,
  richModelOffsetToProjectionOffset,
  richProjectionBlockForTextPath,
  richProjectionOffsetToModelOffset,
  richProjectionTextToModelText,
} from "../kernel";
