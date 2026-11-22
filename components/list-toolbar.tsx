"use client";

import {
  ActionIcon,
  Button,
  Fieldset,
  Flex,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconAdjustments, IconRefresh, IconSearch, IconX } from "@tabler/icons-react";
import { useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
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
} & (
  | { appliedValue?: undefined; formatAppliedValue?: never }
  | { appliedValue: string; formatAppliedValue: (value: string) => string }
);

type FilterOptions = {
  label: string;
  title?: string;
  activeCount?: number;
  clearLabel?: string;
  clearDisabled?: boolean;
  onClear?: () => void;
  onDismiss?: () => void;
  apply?: { label: string; onApply: () => void; disabled?: boolean };
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

export function ListToolbar(props: ToolbarProps | LegacyToolbarProps) {
  if ("query" in props) return <LegacyToolbar {...props} />;

  const { busy = false, search, filterPopover, refresh, primaryAction } = props;
  if (!search && !filterPopover && !refresh && !primaryAction) return null;

  return (
    <div className={styles.container}>
      <Flex gap="xs" align="flex-start" wrap="wrap">
        {search && <ToolbarSearch search={search} busy={busy} />}
        {(filterPopover || refresh || primaryAction) && (
          <Group gap="sm" className={styles.actions}>
            {(filterPopover || refresh) && (
              <Group gap="xs" miw={0}>
                {filterPopover && <ToolbarFilter filter={filterPopover} busy={busy} />}
                {refresh && <ToolbarRefresh refresh={refresh} busy={busy} />}
              </Group>
            )}
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
    appliedValue,
    formatAppliedValue,
  } = search;
  const input = useRef<HTMLInputElement>(null);
  const canClear = clearLabel && onClear;
  const showClear = canClear && (value || appliedValue);
  const appliedDescription =
    appliedValue && appliedValue !== value ? formatAppliedValue(appliedValue) : undefined;
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
        classNames={{
          input: canClear ? styles.searchWithClear : undefined,
          description: styles.searchDescription,
        }}
        description={appliedDescription}
        inputWrapperOrder={["input", "description", "error"]}
        disabled={busy}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        type="search"
        value={value}
        rightSectionPointerEvents="all"
        rightSectionWidth={showClear ? 64 : 36}
        rightSection={
          <Group gap={0} wrap="nowrap">
            {showClear && (
              <Tooltip label={clearLabel}>
                <ActionIcon
                  aria-label={clearLabel}
                  color="gray"
                  disabled={busy}
                  onClick={() => {
                    onClear();
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
            <Tooltip label={submitLabel}>
              <ActionIcon
                aria-label={submitLabel}
                color="gray"
                disabled={busy}
                size={28}
                type="submit"
                variant="subtle"
              >
                <IconSearch size={17} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
        }
      />
    </form>
  );
}

function ToolbarFilter({ filter, busy }: { filter: FilterOptions; busy: boolean }) {
  const {
    label,
    title,
    activeCount,
    clearLabel,
    clearDisabled,
    onClear,
    onDismiss,
    apply,
    children,
  } = filter;
  const [opened, setOpened] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const hasActiveFilters = (activeCount ?? 0) > 0;
  const triggerLabel = hasActiveFilters ? `${label} (${activeCount})` : label;
  const clear = clearLabel && onClear;

  function changeOpened(next: boolean) {
    setOpened(next);
    if (!next) onDismiss?.();
  }

  function dismissOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (!opened || event.key !== "Escape" || event.nativeEvent.isComposing) return;
    // Mantine marks an open Combobox target so the nested listbox owns the first Escape.
    if (
      event.target instanceof Element &&
      event.target.closest('[data-mantine-stop-propagation="true"]')
    ) {
      return;
    }
    event.stopPropagation();
    changeOpened(false);
    trigger.current?.focus();
  }

  return (
    <Popover
      opened={opened}
      onChange={changeOpened}
      closeOnEscape={false}
      position="bottom-start"
      trapFocus
      width={320}
      shadow="sm"
      middlewares={{ size: { padding: 8 } }}
    >
      <Tooltip label={triggerLabel}>
        <Popover.Target>
          <Button
            aria-label={triggerLabel}
            className={styles.filterTrigger}
            disabled={busy}
            onClick={() => changeOpened(!opened)}
            onKeyDown={dismissOnEscape}
            ref={trigger}
            type="button"
            variant={hasActiveFilters ? "light" : "default"}
          >
            <IconAdjustments size={17} aria-hidden />
            <span className={styles.filterLabel}>{label}</span>
            {hasActiveFilters && <span>({activeCount})</span>}
          </Button>
        </Popover.Target>
      </Tooltip>
      <Popover.Dropdown className={styles.filterPanel} onKeyDownCapture={dismissOnEscape}>
        {title && <Text fw={600}>{title}</Text>}
        <Fieldset unstyled disabled={busy} className={styles.filterFields}>
          <Stack gap="sm">{children}</Stack>
        </Fieldset>
        {(clear || apply) && (
          <Group gap="xs" justify="flex-end">
            {clear && (
              <Button
                disabled={
                  busy || (clearDisabled ?? (activeCount !== undefined && !hasActiveFilters))
                }
                onClick={onClear}
                type="button"
                variant="default"
              >
                {clearLabel}
              </Button>
            )}
            {apply && (
              <Button
                disabled={busy || apply.disabled}
                onClick={() => {
                  apply.onApply();
                  setOpened(false);
                  trigger.current?.focus();
                }}
                type="button"
              >
                {apply.label}
              </Button>
            )}
          </Group>
        )}
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
    <Tooltip label={refresh.label}>
      <ActionIcon
        aria-label={refresh.label}
        aria-busy={loading}
        disabled={disabled}
        loading={loading}
        onClick={handleRefresh}
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
