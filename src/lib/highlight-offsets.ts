// Converts between a DOM Range (from a live text selection) and plain
// character offsets into a container's `textContent`. Offsets, not DOM
// paths, are what gets persisted — the rendered markup is deterministic
// today, but a future KaTeX/DOMPurify upgrade changing span nesting would
// invalidate stored DOM paths; text offsets survive that.

function collectTextNodes(container: Node): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

export function offsetsFromRange(container: Node, range: Range): { start: number; end: number } {
  const textNodes = collectTextNodes(container);
  let start = -1;
  let end = -1;
  let pos = 0;
  for (const node of textNodes) {
    const length = node.textContent?.length ?? 0;
    if (node === range.startContainer) start = pos + range.startOffset;
    if (node === range.endContainer) end = pos + range.endOffset;
    pos += length;
  }
  return { start: Math.max(start, 0), end: Math.max(end, 0) };
}

/** The inverse — reconstruct a Range from previously-stored offsets, or null if the container's content no longer fits them. */
export function rangeFromOffsets(container: Node, start: number, end: number): Range | null {
  if (end <= start) return null;
  const textNodes = collectTextNodes(container);
  let pos = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (const node of textNodes) {
    const length = node.textContent?.length ?? 0;
    if (startNode === null && start <= pos + length) {
      startNode = node;
      startOffset = start - pos;
    }
    if (endNode === null && end <= pos + length) {
      endNode = node;
      endOffset = end - pos;
    }
    pos += length;
    if (startNode && endNode) break;
  }

  if (!startNode || !endNode) return null;
  const range = document.createRange();
  try {
    range.setStart(startNode, Math.max(0, Math.min(startOffset, startNode.textContent?.length ?? 0)));
    range.setEnd(endNode, Math.max(0, Math.min(endOffset, endNode.textContent?.length ?? 0)));
  } catch {
    return null;
  }
  return range;
}
