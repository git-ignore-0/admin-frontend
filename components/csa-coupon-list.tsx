"use client";
import { Table } from "@mantine/core";

import { useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import {
  ActionLink,
  DataState,
  FormField,
  FormSelect,
  Icon,
  Status,
} from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { formatAdminDate } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import {
  couponErrorMessage,
  couponOffer,
  couponScopeSummary,
  type AdminCoupon,
  type CouponApplicationScope,
  type CouponDiscountType,
  type CouponStatus,
} from "@/lib/csa-coupons";
import type { PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";
import styles from "./csa-coupon-list.module.css";

export function CSACouponList() {
  const { locale, t } = useAdminI18n();
  const copy = t.csaCoupons;
  const [status, setStatus] = useState<CouponStatus | "">("");
  const [discountType, setDiscountType] = useState<CouponDiscountType | "">("");
  const [applicationScope, setApplicationScope] = useState<CouponApplicationScope | "">("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set("status", status);
      if (discountType) params.set("discount_type", discountType);
      if (applicationScope) params.set("application_scope", applicationScope);
      return apiEnvelope<AdminCoupon[], PaginationMeta>(`admin/vouchers?${params}`);
    },
    [status, discountType, applicationScope],
  );
  const getErrorMessage = useCallback((error: unknown) => couponErrorMessage(error, t), [t]);
  const { error, items, loading, meta, reload, setPage } = usePaginatedList({
    fetchPage,
    getErrorMessage,
  });

  return (
    <section aria-busy={loading} className={styles.list}>
      <div className={styles.filters}>
        <FormField label={copy.filterScope}>
          <FormSelect
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
      </div>
      {error ? (
        <DataState kind="error" title={error} action={{ label: t.common.retry, onClick: reload }} />
      ) : loading ? (
        <DataState kind="loading" title={copy.loading} compact={items !== null} />
      ) : items?.length === 0 ? (
        <DataState kind="empty" title={copy.empty} />
      ) : null}
      {items && items.length > 0 && (
        <div className={styles.tableWrap}>
          <Table aria-label={copy.title} className={styles.table} layout="fixed" role="table">
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th scope="col" role="columnheader">
                  {copy.code}
                </Table.Th>
                <Table.Th scope="col" role="columnheader">
                  {copy.offer}
                </Table.Th>
                <Table.Th scope="col" role="columnheader">
                  {copy.scope}
                </Table.Th>
                <Table.Th scope="col" role="columnheader">
                  {copy.validity}
                </Table.Th>
                <Table.Th scope="col" role="columnheader">
                  {copy.used}
                </Table.Th>
                <Table.Th scope="col" role="columnheader">
                  {copy.status}
                </Table.Th>
                <Table.Th scope="col" role="columnheader">
                  {copy.action}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => (
                <Table.Tr key={item.id} role="row">
                  <Table.Td role="cell" data-label={copy.code}>
                    <strong className={styles.code}>{item.code}</strong>
                  </Table.Td>
                  <Table.Td role="cell" data-label={copy.offer}>
                    <span>{couponOffer(item, locale)}</span>
                  </Table.Td>
                  <Table.Td role="cell" data-label={copy.scope}>
                    <span>{couponScopeSummary(item, t)}</span>
                  </Table.Td>
                  <Table.Td role="cell" data-label={copy.validity}>
                    <span>
                      {formatAdminDate(item.starts_at)} –{" "}
                      {formatAdminDate(
                        new Date(new Date(item.expires_at).getTime() - 1).toISOString(),
                      )}
                    </span>
                  </Table.Td>
                  <Table.Td role="cell" data-label={copy.used}>
                    <span>
                      {item.used_count} / {item.usage_limit}
                    </span>
                  </Table.Td>
                  <Table.Td role="cell" data-label={copy.status}>
                    <Status
                      domain="voucher"
                      status={item.status}
                      label={copy.statuses[item.status]}
                    />
                  </Table.Td>
                  <Table.Td role="cell" data-label={copy.action}>
                    <ActionLink variant="outline" href={`/csa-coupons/${item.id}`}>
                      <Icon name="edit" />
                      {copy.edit}
                    </ActionLink>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
      {meta && (
        <Pagination
          controls="nfv"
          disabled={loading}
          nextLabel={t.common.next}
          onPage={setPage}
          page={meta.page}
          pageSize={meta.page_size}
          previousLabel={t.common.previous}
          summary={t.common.pagination}
          total={meta.total}
        />
      )}
    </section>
  );
}
