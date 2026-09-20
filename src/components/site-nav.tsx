"use client";

// The shared top-level navigation, and the thing that makes the app's
// sections ("Learn", "Practice", "Stats") legible from every page.
//
// Why this exists at all: until now every page rendered its own inline
// <header> with hand-written cross-links, which meant a new top-level
// route was invisible until someone remembered to link it from every other
// page (CLAUDE.md calls this out explicitly as a hazard). A pathname-driven
// nav fixes that permanently — adding a route to SECTIONS below surfaces it
// everywhere at once.
//
// Client component only because of `usePathname`. The alternative was an
// `active` prop passed down from every page, which reintroduces exactly the
// per-page bookkeeping this component is meant to remove.
//
// Deliberately NOT rendered by the runners (/sets/[id] and
// /tests/[sessionId]). Those are focused test-taking surfaces, and in exam
// mode especially the UI must not offer navigation out of a timed module —
// the module-scoped timer keeps running and `getOwnedItem`'s 'exam-write'
// policy would reject the writes anyway, so a visible link out would be
// offering something the server refuses.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  BooksIcon,
  ChartLineIcon,
  ExamIcon,
  GraduationCapIcon,
  LightbulbIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StackIcon,
} from "@phosphor-icons/react";

type Half = "learn" | "practice" | "stats";

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "data-icon"?: string }>;
}

const SECTIONS: Record<Half, { label: string; href: string; blurb: string; links: NavLink[] }> = {
  learn: {
    label: "Learn",
    href: "/learn",
    blurb: "Guides, cheat sheets, and vetted resources",
    links: [
      { href: "/learn", label: "Overview", icon: GraduationCapIcon },
      { href: "/learn/guides", label: "Guides", icon: LightbulbIcon },
      { href: "/learn/resources", label: "Resources", icon: StackIcon },
    ],
  },
  practice: {
    label: "Practice",
    href: "/sets",
    blurb: "Drill sets and full-length adaptive tests",
    links: [
      { href: "/new", label: "New set", icon: PlusIcon },
      { href: "/sets", label: "Library", icon: BooksIcon },
      { href: "/tests", label: "Practice tests", icon: ExamIcon },
      { href: "/problems", label: "Question bank", icon: MagnifyingGlassIcon },
    ],
  },
  stats: {
    label: "Stats",
    href: "/stats",
    blurb: "Trends, weak skills, and AI-generated recommendations",
    links: [{ href: "/stats", label: "Overview", icon: ChartLineIcon }],
  },
};

/** Which section a path belongs to. `/` is intentionally none of them — home is the shared entry point and presents the sections in its body. */
function halfForPath(pathname: string): Half | null {
  if (pathname.startsWith("/learn")) return "learn";
  if (pathname.startsWith("/stats")) return "stats";
  if (pathname === "/new" || pathname.startsWith("/sets") || pathname.startsWith("/tests") || pathname.startsWith("/problems")) {
    return "practice";
  }
  return null;
}

function SiteNav() {
  const pathname = usePathname();
  const activeHalf = halfForPath(pathname);
  const activeSection = activeHalf ? SECTIONS[activeHalf] : null;

  return (
    <nav aria-label="Main" className="border-b border-border/60">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-0 px-6">
        <div className="flex h-14 items-center justify-between gap-4">
          <Link href="/" className="text-lg font-medium tracking-tight transition-opacity hover:opacity-70">
            Getgud
          </Link>

          <div className="flex items-center gap-1" role="group" aria-label="Sections">
            {(Object.keys(SECTIONS) as Half[]).map((half) => {
              const section = SECTIONS[half];
              const active = activeHalf === half;
              return (
                <Link
                  key={half}
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-[min(var(--radius-md),12px)] px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {section.label}
                </Link>
              );
            })}
          </div>

          <ThemeToggle />
        </div>

        {activeSection && (
          <div className="flex items-center gap-1 overflow-x-auto pb-2.5">
            {activeSection.links.map((link) => {
              // Exact match, not prefix: /learn would otherwise stay
              // highlighted on /learn/guides, marking two links active.
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-[min(var(--radius-md),12px)] px-2.5 py-1 text-[0.8rem] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}

export { SiteNav };
