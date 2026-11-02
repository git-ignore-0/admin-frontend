import { Button } from "@/components/nfv-controls";

export function Pagination({
  page,
  total,
  pageSize,
  onPage,
  previousLabel,
  nextLabel,
  summary,
  disabled = false,
  controls = "default",
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  summary: string;
  disabled?: boolean;
  controls?: "default" | "nfv";
}) {
  const PageButton = controls === "nfv" ? Button : "button";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav aria-busy={disabled} className="pagination" aria-label={summary}>
      <PageButton
        {...(controls === "nfv"
          ? { variant: "outline" as const }
          : { className: "button secondary" })}
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
        type="button"
      >
        {previousLabel}
      </PageButton>
      <span>{summary.replace("{page}", String(page)).replace("{pages}", String(pages))}</span>
      <PageButton
        {...(controls === "nfv"
          ? { variant: "outline" as const }
          : { className: "button secondary" })}
        disabled={disabled || page >= pages}
        onClick={() => onPage(page + 1)}
        type="button"
      >
        {nextLabel}
      </PageButton>
    </nav>
  );
}
