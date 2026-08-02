import type { FormEvent, ReactNode } from "react";

export function ListToolbar({
  busy,
  clearLabel,
  filter,
  hasFilters,
  onClear,
  onQueryChange,
  onSubmit,
  placeholder,
  query,
  resultCount,
  resultCountLabel,
  resultCountSingularLabel,
  searchLabel,
  searchSubmitLabel,
}: {
  busy: boolean;
  clearLabel: string;
  filter?: ReactNode;
  hasFilters: boolean;
  onClear: () => void;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  query: string;
  resultCount?: number;
  resultCountLabel: string;
  resultCountSingularLabel: string;
  searchLabel: string;
  searchSubmitLabel: string;
}) {
  return (
    <div className="list-toolbar-row">
      <form
        aria-busy={busy}
        className={`list-toolbar${filter ? "" : " list-toolbar-search-only"}`}
        onSubmit={onSubmit}
        role="search"
      >
        <label className="field list-toolbar-search">
          <span>{searchLabel}</span>
          <input
            className="input"
            disabled={busy}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            type="search"
            value={query}
          />
        </label>
        {filter}
        <div className="list-toolbar-actions">
          <button className="button" disabled={busy} type="submit">
            {searchSubmitLabel}
          </button>
          {hasFilters && (
            <button className="button secondary" disabled={busy} onClick={onClear} type="button">
              {clearLabel}
            </button>
          )}
        </div>
      </form>
      <ListResultSummary
        count={resultCount}
        label={resultCountLabel}
        singularLabel={resultCountSingularLabel}
      />
    </div>
  );
}

export function ListResultSummary({
  count,
  label,
  singularLabel,
}: {
  count?: number;
  label: string;
  singularLabel: string;
}) {
  if (count === undefined) return null;
  return (
    <p aria-atomic="true" aria-live="polite" className="list-result-summary">
      {(count === 1 ? singularLabel : label).replace("{count}", String(count))}
    </p>
  );
}
