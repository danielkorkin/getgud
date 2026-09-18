// Renders a Learn guide's block content.
//
// Server component, necessarily: `renderGuideLatex` comes from
// src/lib/content/render.ts, which is "server-only" (it pulls in jsdom via
// isomorphic-dompurify and node:crypto via scripts/lib/html.ts). Making
// this a client component would break the build rather than degrade, which
// is the good failure mode.
//
// The switch over `block.kind` is exhaustive with no default branch, so
// adding a block type to GuideBlock in src/resources/spec.ts is a
// type error here until it's handled — a new block type can't silently
// render as nothing.

import { renderGuideLatex } from "@/lib/content/render";
import { LightbulbIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { GuideBlock, GuideSection } from "@/resources";

function Block({ block }: { block: GuideBlock }): React.ReactElement {
  switch (block.kind) {
    case "text":
      return <p className="text-sm leading-relaxed text-foreground/90">{block.content}</p>;

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={
            block.ordered
              ? "flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground/90"
              : "flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground/90"
          }
        >
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              {item}
            </li>
          ))}
        </Tag>
      );
    }

    case "rules":
      return (
        <div className="flex flex-col gap-2">
          {block.items.map((item, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-xl border border-border p-4">
              <span className="text-sm font-medium tracking-tight">{item.rule}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{item.detail}</span>
              {item.example && (
                <span className="mt-1 border-l-2 border-border pl-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {item.example}
                </span>
              )}
            </div>
          ))}
        </div>
      );

    case "formulas":
      return (
        <div className="flex flex-col gap-1.5">
          {block.items.map((item, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">{item.name}</span>
                {item.note && <span className="text-xs leading-relaxed text-muted-foreground">{item.note}</span>}
              </div>
              <span
                className="shrink-0 text-base sm:text-right"
                // Author-written LaTeX from this repo's own source, rendered
                // by the same KaTeX path as question content. Not user input.
                dangerouslySetInnerHTML={{ __html: renderGuideLatex(item.latex, item.name) }}
              />
            </div>
          ))}
        </div>
      );

    case "table":
      return (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {block.columns.map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2.5 align-top leading-relaxed">{row[0]}</td>
                  <td className="px-3 py-2.5 align-top leading-relaxed text-muted-foreground">{row[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "callout": {
      const tip = block.tone === "tip";
      const Icon = tip ? LightbulbIcon : WarningCircleIcon;
      return (
        <div
          className={
            tip
              ? "flex gap-3 rounded-xl border border-border bg-tag-blue/40 p-4"
              : "flex gap-3 rounded-xl border border-border bg-tag-yellow/40 p-4"
          }
        >
          <Icon
            weight="fill"
            className={tip ? "mt-0.5 size-4 shrink-0 text-tag-blue-foreground" : "mt-0.5 size-4 shrink-0 text-tag-yellow-foreground"}
          />
          <p className="text-sm leading-relaxed text-foreground/90">{block.content}</p>
        </div>
      );
    }
  }

  // Unreachable while the switch covers every GuideBlock variant. Adding a
  // variant without a case above makes `block` a non-never type here, so
  // this assignment is the thing that turns a missed block type into a
  // compile error rather than a silently blank section.
  const exhaustive: never = block;
  return exhaustive;
}

function GuideBody({ sections }: { sections: readonly GuideSection[] }) {
  return (
    <div className="flex flex-col gap-12">
      {sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-4">
          <h2 className="text-2xl font-medium tracking-tight">{section.heading}</h2>
          {section.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </section>
      ))}
    </div>
  );
}

export { GuideBody };
