// Plain server component — no shadcn `pagination` primitive is installed
// (or needed) for a simple prev/next + "Page X of Y".
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { browseParamsToQuery, type BrowseFilters } from "@/lib/query/browse-filters";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";

export function PaginationBar({
  filters,
  totalPages,
  activeSetId,
}: {
  filters: BrowseFilters;
  totalPages: number;
  activeSetId: string | null;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(page: number): string {
    const qs = browseParamsToQuery(filters, { page });
    return activeSetId ? `/problems?${qs}&set=${encodeURIComponent(activeSetId)}` : `/problems?${qs}`;
  }

  const page = filters.page;
  return (
    <nav className="flex items-center justify-between gap-4" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} render={<Link href={hrefFor(page - 1)} />} nativeButton={false}>
        <ArrowLeftIcon data-icon="inline-start" />
        Previous
      </Button>
      <span className="font-mono text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        render={<Link href={hrefFor(page + 1)} />}
        nativeButton={false}
      >
        Next
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </nav>
  );
}
