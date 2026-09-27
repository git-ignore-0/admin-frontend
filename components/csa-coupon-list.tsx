"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { Pagination } from "@/components/pagination";
import { formatAdminDate } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import {
  couponErrorMessage,
  couponOffer,
  couponScopeSummary,
  type AdminCoupon,
  type CouponDiscountType,
  type CouponStatus,
} from "@/lib/csa-coupons";
import type { PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function CSACouponList() {
  const { locale, t } = useAdminI18n();
  const copy = t.csaCoupons;
  const [status, setStatus] = useState<CouponStatus | "">("");
  const [discountType, setDiscountType] = useState<CouponDiscountType | "">("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set("status", status);
      if (discountType) params.set("discount_type", discountType);
      return apiEnvelope<AdminCoupon[], PaginationMeta>(`admin/csa-coupons?${params}`);
    },
    [status, discountType],
  );
  const getErrorMessage = useCallback((error: unknown) => couponErrorMessage(error, t), [t]);
  const { error, items, loading, meta, reload, setPage } = usePaginatedList({
    fetchPage,
    getErrorMessage,
  });

  return (
    <section aria-busy={loading} className="admin-list-section csa-coupon-list">
      <div className="list-toolbar-row">
        <div className="list-toolbar csa-coupon-filters">
          <label className="field">
            <span>{copy.filterStatus}</span>
            <select
              className="input"
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
            </select>
          </label>
          <label className="field">
            <span>{copy.filterType}</span>
            <select
              className="input"
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
            </select>
          </label>
        </div>
      </div>
      <ListState
        empty={copy.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={copy.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <div className="table-wrap admin-list-wrap">
          <table className="table admin-list-table csa-coupon-table">
            <thead>
              <tr>
                <th>{copy.code}</th>
                <th>{copy.offer}</th>
                <th>{copy.scope}</th>
                <th>{copy.validity}</th>
                <th>{copy.used}</th>
                <th>{copy.status}</th>
                <th>{copy.action}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label={copy.code}>
                    <strong className="csa-coupon-code">{item.code}</strong>
                  </td>
                  <td data-label={copy.offer}>{couponOffer(item, locale)}</td>
                  <td data-label={copy.scope} className="csa-coupon-scope">
                    {couponScopeSummary(item, t)}
                  </td>
                  <td data-label={copy.validity}>
                    {formatAdminDate(item.starts_at)} –{" "}
                    {formatAdminDate(
                      new Date(new Date(item.expires_at).getTime() - 1).toISOString(),
                    )}
                  </td>
                  <td data-label={copy.used}>
                    {item.used_count} / {item.usage_limit}
                  </td>
                  <td data-label={copy.status}>
                    <span className={`badge csa-coupon-status ${item.status}`}>
                      {copy.statuses[item.status]}
                    </span>
                  </td>
                  <td data-label={copy.action}>
                    <Link className="button secondary" href={`/csa-coupons/${item.id}`}>
                      {copy.edit}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && (
        <Pagination
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
