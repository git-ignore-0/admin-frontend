export function Pagination({
  page,
  total,
  pageSize,
  onPage,
  previousLabel,
  nextLabel,
  summary,
  disabled = false,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  summary: string;
  disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav aria-busy={disabled} className="pagination" aria-label={summary}>
      <button
        className="button secondary"
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
        type="button"
      >
        {previousLabel}
      </button>
      <span>{summary.replace("{page}", String(page)).replace("{pages}", String(pages))}</span>
      <button
        className="button secondary"
        disabled={disabled || page >= pages}
        onClick={() => onPage(page + 1)}
        type="button"
      >
        {nextLabel}
      </button>
    </nav>
  );
}
