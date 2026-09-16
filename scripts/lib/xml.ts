// Minimal recursive-descent XML parser, scoped to the small, well-formed
// MathML documents College Board embeds in equation images. Not a general
// XML parser — no CDATA, comments, processing instructions, or namespaces
// beyond the bare `xmlns` attribute (ignored). Good enough for this corpus's
// actual tag vocabulary; anything it can't parse throws, so a conversion
// failure here is loud, not silently wrong.

import { decodeHtmlEntities } from "./html";

export interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | string;

export function isElement(node: XmlNode): node is XmlElement {
  return typeof node !== "string";
}

const TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[^<>]*)?\/?>/g;

export function parseXml(xml: string): XmlElement {
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let lastIndex = 0;

  const pushText = (text: string, parent: XmlElement | undefined) => {
    const decoded = decodeHtmlEntities(text);
    if (decoded.length > 0 && parent) parent.children.push(decoded);
  };

  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(xml))) {
    const tagText = match[0];
    const textBefore = xml.slice(lastIndex, match.index);
    pushText(textBefore, stack[stack.length - 1]);
    lastIndex = TAG_RE.lastIndex;

    if (tagText.startsWith("</")) {
      const tag = tagText.slice(2, -1).trim();
      const closed = stack.pop();
      if (!closed || closed.tag !== tag) {
        throw new Error(`xml mismatch: expected </${closed?.tag}>, got </${tag}>`);
      }
      if (stack.length === 0) {
        root = closed;
      } else {
        stack[stack.length - 1].children.push(closed);
      }
    } else {
      const selfClosing = tagText.endsWith("/>");
      const inner = tagText.slice(1, selfClosing ? -2 : -1).trim();
      const spaceIdx = inner.search(/\s/);
      const tag = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
      const attrs: Record<string, string> = {};
      if (spaceIdx !== -1) {
        const attrText = inner.slice(spaceIdx + 1);
        for (const m of attrText.matchAll(/([a-zA-Z0-9:_-]+)\s*=\s*"([^"]*)"/g)) {
          attrs[m[1]] = decodeHtmlEntities(m[2]);
        }
      }
      const element: XmlElement = { tag, attrs, children: [] };
      if (selfClosing) {
        if (stack.length === 0) {
          root = element;
        } else {
          stack[stack.length - 1].children.push(element);
        }
      } else {
        stack.push(element);
      }
    }
  }

  if (stack.length > 0) throw new Error(`xml unclosed tag(s): ${stack.map((e) => e.tag).join(", ")}`);
  if (!root) throw new Error("xml: no root element found");
  return root;
}
