"use client";

import {
  Badge,
  Box,
  Button,
  Divider,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { openRecordFromRow } from "@/components/record-row-navigation";
import type { AdminDictionary, AdminLocale } from "@/lib/admin-i18n";
import { requireResponseEntity, requireResponseList } from "@/lib/api-response";
import { apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject, requestErrorMessage } from "@/lib/client-error";
import { legacyPackageItemView } from "@/lib/membership-catalog-adapter";
import {
  catalogHref,
  readCatalogListContext,
  type CatalogResource,
} from "@/lib/membership-catalog-navigation";
import { formatMembershipMoney } from "@/lib/membership-format";
import {
  hasCompleteCatalogTranslations,
  localizedCatalogTranslation,
} from "@/lib/membership-translations";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { MembershipPackage, MembershipProduct, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

function validateNamedTranslation(translation: unknown) {
  if (!isApiObject(translation) || typeof translation.name !== "string") {
    throw invalidApiResponse();
  }
}

function validateMembershipProduct(item: MembershipProduct) {
  requireResponseEntity(item);
  requireResponseList(item.translations, validateNamedTranslation);
  if (typeof item.unit_size !== "string") throw invalidApiResponse();
}

function validateMembershipPackage(item: MembershipPackage) {
  requireResponseEntity(item);
  requireResponseList(item.translations, validateNamedTranslation);
  requireResponseList(item.items, (line) => {
    if (!isApiObject(line) || typeof line.product_id !== "string") throw invalidApiResponse();
    if (line.product_translations != null) {
      requireResponseList(line.product_translations, validateNamedTranslation);
    }
  });
  requireResponseList(item.price_options, requireResponseEntity);
}

type CatalogItem = MembershipProduct | MembershipPackage;
type CatalogRow = { subtitle: string; value: ReactNode };
type Props<T extends CatalogItem> = {
  resource: CatalogResource;
  validate: (record: T) => void;
  renderRow: (record: T, locale: AdminLocale, t: AdminDictionary) => CatalogRow;
};

function CatalogList<T extends CatalogItem>({ resource, validate, renderRow }: Props<T>) {
  const { locale, t } = useAdminI18n();
  const copy = t.membershipCatalog;
  const context = readCatalogListContext(useSearchParams());
  const { search, active, page } = context;
  const [draftSearch, setDraftSearch] = useState(search);
  const [draftActive, setDraftActive] = useState(active);
  const products = resource === "products";
  const title = products ? copy.products : copy.packages;
  const labels = [
    products ? copy.product : copy.package,
    products ? copy.unitConversion : copy.priceOptions,
    copy.status,
  ];
  const empty = products ? copy.emptyProducts : copy.emptyPackages;

  const fetchPage = useCallback(
    (nextPage: number, signal: AbortSignal) => {
      const query = new URLSearchParams({ page: String(nextPage) });
      if (search) query.set("search", search);
      if (active) query.set("active", active);
      return apiEnvelope<T[], PaginationMeta>(`admin/membership-${resource}?${query}`, { signal });
    },
    [active, resource, search],
  );
  const getErrorMessage = useCallback((error: unknown) => requestErrorMessage(error, t), [t]);
  const { items, meta, error, loading, reload } = usePaginatedList({
    controlledPage: page,
    fetchPage,
    validateRecord: validate,
    getErrorMessage,
  });
  const initialLoading = items === null && loading;

  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => {
    if (!meta || loading || error) return;
    const lastPage = Math.max(1, Math.ceil(meta.total / meta.page_size));
    if (page > lastPage) {
      window.history.replaceState(
        null,
        "",
        catalogHref(resource, { search, active, page: lastPage }),
      );
    }
  }, [active, error, loading, meta, page, resource, search]);

  function navigateList(next: typeof context) {
    const href = catalogHref(resource, next);
    if (href !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", href);
    }
  }

  function updateStatus(value: typeof active) {
    setDraftActive(value);
    navigateList({ search, active: value, page: 1 });
  }

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={520}
      aria-label={title}
      aria-hidden={initialLoading || undefined}
      role="region"
      tabIndex={initialLoading ? undefined : 0}
      style={{ outlineOffset: -2 }}
    >
      <Table aria-label={title} aria-busy={loading || undefined} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            {labels.map((label) => (
              <Table.Th key={label} scope="col">
                {label}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading
            ? Array.from({ length: 5 }, (_, row) => (
                <Table.Tr key={row}>
                  <Table.Td>
                    <Skeleton height={34} width="80%" />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={12} width="65%" />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={12} width="65%" />
                  </Table.Td>
                </Table.Tr>
              ))
            : items?.map((item) => {
                const translation = localizedCatalogTranslation<{
                  locale: AdminLocale;
                  name: string;
                }>(item.translations, locale);
                const { subtitle, value } = renderRow(item, locale, t);
                return (
                  <Table.Tr key={item.id} onClick={openRecordFromRow} style={{ cursor: "pointer" }}>
                    <Table.Td>
                      <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                        <DataListRecordLink
                          component={AdminNavigationLink}
                          href={catalogHref(resource, context, item.id)}
                          data-record-link
                        >
                          {translation?.name || item.name}
                        </DataListRecordLink>
                        {!hasCompleteCatalogTranslations(item.translations) && (
                          <Badge color="warning" w="fit-content">
                            {copy.translationNeedsReview}
                          </Badge>
                        )}
                        <Text size="sm" c="dimmed">
                          {subtitle || "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{value}</Table.Td>
                    <Table.Td>
                      <Status
                        domain="availability"
                        status={item.is_active ? "active" : "inactive"}
                        label={item.is_active ? copy.active : copy.inactive}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack gap="md" miw={0}>
      <ListToolbar
        busy={loading}
        search={{
          label: products ? copy.searchLabel : copy.packageSearchLabel,
          placeholder: products ? copy.searchPlaceholder : copy.packageSearchPlaceholder,
          value: draftSearch,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: setDraftSearch,
          onSubmit: (value) => {
            const trimmed = value.trim();
            if (trimmed === search && page === 1) reload();
            else navigateList({ search: trimmed, active, page: 1 });
          },
          submitLabel: copy.search,
          clearLabel: t.common.clearFilters,
          onClear: () => {
            setDraftSearch("");
            navigateList({ search: "", active, page: 1 });
          },
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount: Number(Boolean(active)),
          onOpen: () => setDraftActive(active),
          onDismiss: () => setDraftActive(active),
          clearLabel: t.common.clearFilters,
          clearDisabled: !draftActive && !active,
          onClear: () => updateStatus(""),
          apply: {
            label: t.users.applyFilters,
            disabled: draftActive === active,
            onApply: () => updateStatus(draftActive),
          },
          children: (
            <Select
              label={copy.filterStatus}
              placeholder={copy.allStatuses}
              value={draftActive || null}
              onChange={(value) =>
                setDraftActive(value === "true" || value === "false" ? value : "")
              }
              data={[
                { value: "true", label: copy.active },
                { value: "false", label: copy.inactive },
              ]}
              comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
              clearable
            />
          ),
        }}
        refresh={{
          label: products ? copy.refreshProducts : copy.refreshPackages,
          onRefresh: reload,
        }}
        primaryAction={
          <Button
            component={AdminNavigationLink}
            href={catalogHref(resource, context, "new")}
            leftSection={<IconPlus size={16} aria-hidden />}
          >
            {products ? copy.addProduct : copy.addPackage}
          </Button>
        }
      />
      <Paper component="section" miw={0} style={{ overflow: "hidden" }}>
        {Boolean(items?.length) && table}
        <Box p={error ? "md" : undefined}>
          <ListState
            embedded
            empty={empty}
            noResults={search || active ? copy.noMatches : undefined}
            error={error}
            hasData={items !== null}
            isEmpty={items?.length === 0}
            loading={initialLoading}
            loadingLabel={products ? copy.loadingProductList : copy.loadingPackageList}
            loadingPlaceholder={table}
            onRetry={reload}
            retryLabel={t.common.retry}
          />
        </Box>
        {meta && (
          <>
            <Divider />
            <Box px="md" py="sm">
              <Pagination
                disabled={loading}
                nextLabel={t.common.next}
                onPage={(next) => navigateList({ ...context, page: next })}
                page={meta.page}
                pageSize={meta.page_size}
                previousLabel={t.common.previous}
                resultCountLabel={t.common.resultCount}
                resultCountSingularLabel={t.common.resultCountSingular}
                summary={t.common.pagination}
                total={meta.total}
              />
            </Box>
          </>
        )}
      </Paper>
    </Stack>
  );
}

export function MembershipProductList() {
  return (
    <CatalogList
      resource="products"
      validate={validateMembershipProduct}
      renderRow={(item, locale) => ({
        subtitle:
          localizedCatalogTranslation(item.translations, locale)?.short_description ||
          item.short_description,
        value: `${formatDecimalInput(item.unit_size)} ${item.unit_label_vi} / ${item.unit_label_en}`,
      })}
    />
  );
}

export function MembershipPackageList() {
  return (
    <CatalogList
      resource="packages"
      validate={validateMembershipPackage}
      renderRow={(item, locale, t) => {
        const activeOptions = item.price_options.filter((option) => option.is_active);
        return {
          subtitle: item.items
            .map((raw) => {
              const line = legacyPackageItemView(raw);
              const name =
                localizedCatalogTranslation(line.translations, locale)?.name || line.name;
              return `${name}: ${line.quotaUnits}`;
            })
            .join(" · "),
          value: activeOptions.length ? (
            <Stack gap={4}>
              {activeOptions.map((option) => (
                <Text size="sm" key={option.id}>
                  {t.membershipCatalog.priceOptionSummary
                    .replace("{months}", String(option.duration_months))
                    .replace("{price}", formatMembershipMoney(option.monthly_price_vnd, locale))}
                </Text>
              ))}
            </Stack>
          ) : (
            "—"
          ),
        };
      }}
    />
  );
}
