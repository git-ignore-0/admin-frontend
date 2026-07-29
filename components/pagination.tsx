export function Pagination({
  page,
  total,
  pageSize,
  onPage,
  previousLabel,
  nextLabel,
  summary,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  summary: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav className="pagination" aria-label={summary}>
      <button className="button secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {previousLabel}
      </button>
      <span>{summary.replace("{page}", String(page)).replace("{pages}", String(pages))}</span>
      <button
        className="button secondary"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        {nextLabel}
      </button>
    </nav>
  );
}
