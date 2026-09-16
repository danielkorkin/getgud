// lib.dom.d.ts types `HighlightRegistry` (the CSS Custom Highlight API's
// `CSS.highlights`) without its Map methods, even though the real API
// extends `Map<string, Highlight>`. Augment it here once rather than
// casting at every call site.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional declaration merge with lib.dom.d.ts's HighlightRegistry, which contributes its own `forEach` member
interface HighlightRegistry extends Map<string, Highlight> {}
