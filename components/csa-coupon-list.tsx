"use client";
import { Box, Button, Divider, Stack, Table, Text } from "@mantine/core";

import { IconEdit } from "@tabler/icons-react";
import { useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { FormField, FormSelect, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { formatAdminDate } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import {
  couponErrorMessage,
  couponOffer,
  couponScopeSummary,
  requireAdminCoupon,
  type AdminCoupon,
  type CouponApplicationScope,
  type CouponDiscountType,
  type CouponStatus,
} from "@/lib/csa-coupons";
import type { PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";
import styles from "./csa-coupon-list.module.css";

const filterCombobox = { withinPortal: false, floatingStrategy: "fixed" } as const;

export function CSACouponList() {
  const { locale, t } = useAdminI18n();
  const copy = t.csaCoupons;
  const [status, setStatus] = useState<CouponStatus | "">("");
  const [discountType, setDiscountType] = useState<CouponDiscountType | "">("");
  const [applicationScope, setApplicationScope] = useState<CouponApplicationScope | "">("");
  const fetchPage = useCallback(
    (page: number, signal: AbortSignal) => {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set("status", status);
      if (discountType) params.set("discount_type", discountType);
      if (applicationScope) params.set("application_scope", applicationScope);
      return apiEnvelope<AdminCoupon[], PaginationMeta>(`admin/vouchers?${params}`, { signal });
    },
    [status, discountType, applicationScope],
  );
  const getErrorMessage = useCallback((error: unknown) => couponErrorMessage(error, t), [t]);
  const { error, items, loading, meta, reload, setPage } = usePaginatedList({
    fetchPage,
    validateRecord: requireAdminCoupon,
    getErrorMessage,
  });

  const initialLoading = loading && items === null;
  const columns = [
    copy.code,
    copy.offer,
    copy.scope,
    copy.validity,
    copy.used,
    copy.status,
    copy.action,
  ];
  const filterCount =
    Number(Boolean(status)) + Number(Boolean(discountType)) + Number(Boolean(applicationScope));
  function clearFilters() {
    setStatus("");
    setDiscountType("");
    setApplicationScope("");
    setPage(1);
  }

  return (
    <Stack component="section" aria-busy={loading} gap="md" miw={0}>
      <ListToolbar
        busy={loading}
        refresh={{
          label: t.common.refreshList,
          onRefresh: reload,
          loading: loading && items !== null,
          disabled: initialLoading,
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount: filterCount,
          clearDisabled: !filterCount,
          clearLabel: t.common.clearFilters,
          onClear: clearFilters,
          children: (
            <>
              <FormField label={copy.filterScope}>
                <FormSelect
                  comboboxProps={filterCombobox}
                  disabled={loading}
                  value={applicationScope}
                  onChange={(value) => {
                    setApplicationScope((value ?? "") as CouponApplicationScope | "");
                    setPage(1);
                  }}
                  data={[
                    { value: "", label: copy.all },
                    ...(["csa", "store", "both"] as const).map((value) => ({
                      value,
                      label: copy.applicationScopes[value],
                    })),
                  ]}
                />
              </FormField>
              <FormField label={copy.filterStatus}>
                <FormSelect
                  comboboxProps={filterCombobox}
                  disabled={loading}
                  onChange={(value) => {
                    setStatus((value ?? "") as CouponStatus | "");
                    setPage(1);
                  }}
                  value={status}
                  data={[
                    { value: "", label: copy.all },
                    ...Object.entries(copy.statuses).map(([value, label]) => ({ value, label })),
                  ]}
                />
              </FormField>
              <FormField label={copy.filterType}>
                <FormSelect
                  comboboxProps={filterCombobox}
                  disabled={loading}
                  onChange={(value) => {
                    setDiscountType((value ?? "") as CouponDiscountType | "");
                    setPage(1);
                  }}
                  value={discountType}
                  data={[
                    { value: "", label: copy.all },
                    { value: "percent", label: copy.types.percent },
                    { value: "fixed", label: copy.types.fixed },
                  ]}
                />
              </FormField>
            </>
          ),
        }}
      />
      <DataListPaper>
        {Boolean(items?.length) && (
          <Table.ScrollContainer
            type="native"
            role="region"
            aria-label={copy.title}
            tabIndex={0}
            minWidth={840}
          >
            <Table
              aria-label={copy.title}
              aria-busy={loading || undefined}
              withRowBorders
              classNames={{ td: styles.cell, th: styles.cell }}
            >
              <Table.Thead>
                <Table.Tr>
                  {columns.map((label) => (
                    <Table.Th key={label} scope="col">
                      {label}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items?.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Text span fw={600}>
                        {item.code}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <span>{couponOffer(item, locale)}</span>
                    </Table.Td>
                    <Table.Td>
                      <span>{couponScopeSummary(item, t)}</span>
                    </Table.Td>
                    <Table.Td>
                      <span>
                        {formatAdminDate(item.starts_at)} –{" "}
                        {formatAdminDate(
                          new Date(new Date(item.expires_at).getTime() - 1).toISOString(),
                        )}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <span>
                        {item.used_count} / {item.usage_limit}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <Status
                        domain="voucher"
                        status={item.status}
                        label={copy.statuses[item.status]}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Button
                        component={AdminNavigationLink}
                        variant="default"
                        size="xs"
                        href={`/csa-coupons/${item.id}`}
                        leftSection={<IconEdit size={16} aria-hidden />}
                      >
                        {copy.edit}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <Box p={error && !loading ? "md" : undefined}>
          <ListState
            embedded
            empty={copy.empty}
            noResults={filterCount ? t.membershipCatalog.noMatches : undefined}
            action={
              filterCount && items?.length === 0 ? (
                <Button variant="default" onClick={clearFilters}>
                  {t.common.clearFilters}
                </Button>
              ) : undefined
            }
            error={loading ? "" : error}
            hasData={items !== null}
            isEmpty={items?.length === 0}
            loading={initialLoading}
            loadingLabel={copy.loading}
            tableColumns={columns.length}
            onRetry={reload}
            retryLabel={t.common.retry}
          />
        </Box>
        {meta && (
          <>
            <Divider />
            <Box component="footer" px="md" py="sm">
              <Pagination
                disabled={loading}
                nextLabel={t.common.next}
                onPage={setPage}
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
      </DataListPaper>
    </Stack>
  );
}
