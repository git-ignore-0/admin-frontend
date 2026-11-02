import type { FormEvent, ReactNode } from "react";
import { Button, FormInput } from "@/components/nfv-controls";

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
  controls = "default",
  actions,
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
  controls?: "default" | "nfv";
  actions?: ReactNode;
}) {
  const SearchInput = controls === "nfv" ? FormInput : "input";
  const ActionButton = controls === "nfv" ? Button : "button";
  return (
    <div className="list-toolbar-row">
      <form
        aria-busy={busy}
        className={`list-toolbar${filter ? "" : " list-toolbar-search-only"}`}
        onSubmit={onSubmit}
        role="search"
      >
        <label className={`${controls === "nfv" ? "nfv-field" : "field"} list-toolbar-search`}>
          <span className={controls === "nfv" ? "nfv-field-label" : undefined}>{searchLabel}</span>
          <SearchInput
            className={controls === "nfv" ? undefined : "input"}
            disabled={busy}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            type="search"
            value={query}
          />
        </label>
        {filter}
        <div className="list-toolbar-actions">
          <ActionButton
            className={controls === "nfv" ? undefined : "button"}
            disabled={busy}
            type="submit"
          >
            {searchSubmitLabel}
          </ActionButton>
          {actions}
          {hasFilters && (
            <ActionButton
              {...(controls === "nfv"
                ? { variant: "outline" as const }
                : { className: "button secondary" })}
              disabled={busy}
              onClick={onClear}
              type="button"
            >
              {clearLabel}
            </ActionButton>
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
