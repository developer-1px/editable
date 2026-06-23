import { createGeneratedBlockId, type NoteBlock } from "../noteDocument";

export function withFreshBlockIds(blocks: NoteBlock[]): NoteBlock[] {
  return blocks.map((block) => ({
    ...block,
    id: createGeneratedBlockId(),
  }));
}

export function ensureUniqueBlockIds(blocks: NoteBlock[]): NoteBlock[] {
  const seen = new Set<string>();

  return blocks.map((block) => {
    if (!seen.has(block.id)) {
      seen.add(block.id);
      return block;
    }

    const id = nextUnusedBlockId(seen);
    seen.add(id);
    return { ...block, id };
  });
}

function nextUnusedBlockId(seen: Set<string>): string {
  let id = createGeneratedBlockId();
  while (seen.has(id)) {
    id = createGeneratedBlockId();
  }

  return id;
}
