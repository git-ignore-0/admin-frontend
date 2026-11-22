"use client";

import { ActionIcon, Button, Flex, Group, Popover, Stack, TextInput, Tooltip } from "@mantine/core";
import {
  IconArrowRight,
  IconRefresh,
  IconSearch,
  IconAdjustments,
  IconX,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ListResultSummary } from "./pagination";
import styles from "./list-toolbar.module.css";

export { ListResultSummary } from "./pagination";

type SearchOptions = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  submitLabel?: string;
  clearLabel?: string;
  onClear?: () => void;
};

type FilterOptions = {
  label: string;
  activeCount?: number;
  clearLabel?: string;
  onClear?: () => void;
  children: ReactNode;
};

type RefreshOptions = {
  label: string;
  /** Return the pending request or drive loading while it runs. The caller owns errors. */
  onRefresh: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
};

type ToolbarProps = {
  busy?: boolean;
  search?: SearchOptions;
  filterPopover?: FilterOptions;
  refresh?: RefreshOptions;
  primaryAction?: ReactNode;
  actions?: ReactNode;
};

type LegacyToolbarProps = {
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
};

const tooltipEvents = { hover: true, focus: true, touch: false };

export function ListToolbar(props: ToolbarProps | LegacyToolbarProps) {
  if ("query" in props) return <LegacyToolbar {...props} />;

  const { busy = false, search, filterPopover, refresh, actions, primaryAction } = props;
  if (!search && !filterPopover && !refresh && !actions && !primaryAction) return null;

  return (
    <div className={styles.container}>
      <Flex gap="sm" align="center" wrap="wrap">
        {search && <ToolbarSearch search={search} busy={busy} />}
        {(filterPopover || refresh || actions || primaryAction) && (
          <Group gap="sm" wrap={actions ? "wrap" : "nowrap"} className={styles.actions}>
            {(filterPopover || refresh) && (
              <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                {filterPopover && <ToolbarFilter filter={filterPopover} busy={busy} />}
                {refresh && <ToolbarRefresh refresh={refresh} busy={busy} />}
              </Group>
            )}
            {actions}
            {primaryAction && <div className={styles.primaryAction}>{primaryAction}</div>}
          </Group>
        )}
      </Flex>
    </div>
  );
}

function ToolbarSearch({ search, busy }: { search: SearchOptions; busy: boolean }) {
  const {
    label,
    placeholder,
    value,
    onChange,
    onSubmit,
    submitLabel = label,
    clearLabel,
    onClear,
  } = search;
  const input = useRef<HTMLInputElement>(null);
  const clear = clearLabel && onClear;
  return (
    <form
      className={styles.search}
      role="search"
      aria-label={label}
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSubmit(value);
      }}
    >
      <TextInput
        aria-label={label}
        ref={input}
        classNames={clear ? { input: styles.searchWithClear } : undefined}
        disabled={busy}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        type="search"
        value={value}
        leftSection={<IconSearch size={17} aria-hidden />}
        rightSectionPointerEvents="all"
        rightSectionWidth={clear && value ? 64 : 36}
        rightSection={
          <Group gap={0} wrap="nowrap">
            {clear && value && (
              <Tooltip label={clearLabel} events={tooltipEvents}>
                <ActionIcon
                  aria-label={clearLabel}
                  disabled={busy}
                  onClick={() => {
                    clear();
                    input.current?.focus();
                  }}
                  size={28}
                  type="button"
                  variant="subtle"
                >
                  <IconX size={16} aria-hidden />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={submitLabel} events={tooltipEvents}>
              <ActionIcon
                aria-label={submitLabel}
                disabled={busy}
                size={28}
                type="submit"
                variant="subtle"
              >
                <IconArrowRight size={16} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
        }
      />
    </form>
  );
}

function ToolbarFilter({ filter, busy }: { filter: FilterOptions; busy: boolean }) {
  const { label, activeCount, clearLabel, onClear, children } = filter;
  const hasActiveFilters = (activeCount ?? 0) > 0;
  const triggerLabel = hasActiveFilters ? `${label} (${activeCount})` : label;

  return (
    <Popover position="bottom-start" returnFocus trapFocus width={320}>
      <Tooltip label={triggerLabel} events={tooltipEvents}>
        <Popover.Target>
          <Button
            aria-label={triggerLabel}
            className={styles.filterTrigger}
            disabled={busy}
            type="button"
            variant={hasActiveFilters ? "light" : "default"}
          >
            <IconAdjustments size={17} aria-hidden />
            <span className={styles.filterLabel}>{label}</span>
            {hasActiveFilters && <span>({activeCount})</span>}
          </Button>
        </Popover.Target>
      </Tooltip>
      <Popover.Dropdown className={styles.filterPanel}>
        <Stack gap="sm">
          {children}
          {clearLabel && onClear && (
            <Button
              disabled={busy || (activeCount !== undefined && !hasActiveFilters)}
              onClick={onClear}
              type="button"
              variant="default"
            >
              {clearLabel}
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function ToolbarRefresh({ refresh, busy }: { refresh: RefreshOptions; busy: boolean }) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const loading = pending || refresh.loading;
  const disabled = busy || refresh.disabled || loading;

  async function handleRefresh() {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await refresh.onRefresh();
    } catch {
      // The consumer owns the list request and its error presentation.
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <Tooltip label={refresh.label} events={tooltipEvents}>
      <ActionIcon
        aria-label={refresh.label}
        aria-busy={loading}
        disabled={disabled}
        loading={loading}
        onClick={handleRefresh}
        size={36}
        type="button"
        variant="default"
      >
        <IconRefresh size={17} aria-hidden />
      </ActionIcon>
    </Tooltip>
  );
}

function LegacyToolbar({
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
  actions,
}: LegacyToolbarProps) {
  return (
    <Stack gap="xs" className={styles.container}>
      <form role="search" aria-busy={busy} onSubmit={onSubmit}>
        <Flex gap="sm" wrap="wrap" align="flex-end">
          <TextInput
            className={styles.legacySearch}
            label={searchLabel}
            disabled={busy}
            leftSection={<IconSearch size={17} aria-hidden />}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder={placeholder}
            type="search"
            value={query}
          />
          {filter}
          <Group gap="sm">
            <Button disabled={busy} type="submit">
              {searchSubmitLabel}
            </Button>
            {actions}
            {hasFilters && (
              <Button variant="default" disabled={busy} onClick={onClear} type="button">
                {clearLabel}
              </Button>
            )}
          </Group>
        </Flex>
      </form>
      <ListResultSummary
        count={resultCount}
        label={resultCountLabel}
        singularLabel={resultCountSingularLabel}
      />
    </Stack>
  );
}
