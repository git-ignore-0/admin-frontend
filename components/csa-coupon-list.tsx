"use client";

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
            onChange={(event) => {
              setApplicationScope(event.target.value as CouponApplicationScope | "");
              setPage(1);
            }}
          >
            <option value="">{copy.all}</option>
            {(["csa", "store", "both"] as const).map((scope) => (
              <option key={scope} value={scope}>
                {copy.applicationScopes[scope]}
              </option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label={copy.filterStatus}>
          <FormSelect
            disabled={loading}
            onChange={(event) => {
              setStatus(event.target.value as CouponStatus | "");
              setPage(1);
            }}
            value={status}
          >
            <option value="">{copy.all}</option>
            {(Object.keys(copy.statuses) as CouponStatus[]).map((key) => (
              <option key={key} value={key}>
                {copy.statuses[key]}
              </option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label={copy.filterType}>
          <FormSelect
            disabled={loading}
            onChange={(event) => {
              setDiscountType(event.target.value as CouponDiscountType | "");
              setPage(1);
            }}
            value={discountType}
          >
            <option value="">{copy.all}</option>
            <option value="percent">{copy.types.percent}</option>
            <option value="fixed">{copy.types.fixed}</option>
          </FormSelect>
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
          <table aria-label={copy.title} className={styles.table} role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  {copy.code}
                </th>
                <th scope="col" role="columnheader">
                  {copy.offer}
                </th>
                <th scope="col" role="columnheader">
                  {copy.scope}
                </th>
                <th scope="col" role="columnheader">
                  {copy.validity}
                </th>
                <th scope="col" role="columnheader">
                  {copy.used}
                </th>
                <th scope="col" role="columnheader">
                  {copy.status}
                </th>
                <th scope="col" role="columnheader">
                  {copy.action}
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {items.map((item) => (
                <tr key={item.id} role="row">
                  <td role="cell" data-label={copy.code}>
                    <strong className={styles.code}>{item.code}</strong>
                  </td>
                  <td role="cell" data-label={copy.offer}>
                    <span>{couponOffer(item, locale)}</span>
                  </td>
                  <td role="cell" data-label={copy.scope}>
                    <span>{couponScopeSummary(item, t)}</span>
                  </td>
                  <td role="cell" data-label={copy.validity}>
                    <span>
                      {formatAdminDate(item.starts_at)} –{" "}
                      {formatAdminDate(
                        new Date(new Date(item.expires_at).getTime() - 1).toISOString(),
                      )}
                    </span>
                  </td>
                  <td role="cell" data-label={copy.used}>
                    <span>
                      {item.used_count} / {item.usage_limit}
                    </span>
                  </td>
                  <td role="cell" data-label={copy.status}>
                    <Status
                      status={
                        item.status === "scheduled"
                          ? "upcoming"
                          : item.status === "exhausted"
                            ? "inactive"
                            : item.status
                      }
                      label={copy.statuses[item.status]}
                    />
                  </td>
                  <td role="cell" data-label={copy.action}>
                    <ActionLink variant="outline" href={`/csa-coupons/${item.id}`}>
                      <Icon name="edit" />
                      {copy.edit}
                    </ActionLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
