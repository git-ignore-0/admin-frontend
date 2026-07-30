"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Pagination } from "@/components/pagination";
import { formatAdminDateTime } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { PaginationMeta, RedemptionListItem, RedemptionStatus } from "@/lib/types";

export function RedemptionList() {
  const { locale, t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RedemptionStatus | "">("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RedemptionListItem[] | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const currentRequest = ++requestId.current;
    setItems(null);
    setError("");
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), search, status });
    apiEnvelope<RedemptionListItem[], PaginationMeta>(`admin/redemptions?${params}`)
      .then((payload) => {
        if (currentRequest !== requestId.current) return;
        setItems(payload.data);
        setMeta(payload.meta ?? null);
      })
      .catch((caught) => {
        if (currentRequest === requestId.current) setError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  }, [page, search, status, t]);

  useEffect(load, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setPage(1);
    setSearch(query.trim());
  }

  const statusLabels: Record<RedemptionStatus, string> = t.redemptions.statuses;
  return (
    <section>
      <form className="redemption-filters" onSubmit={submit} role="search">
        <label className="field">
          <span>{t.redemptions.searchLabel}</span>
          <input
            className="input"
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value.trim() && search) {
                setPage(1);
                setSearch("");
              }
            }}
            placeholder={t.users.searchPlaceholder}
            type="search"
            value={query}
          />
        </label>
        <label className="field">
          <span>{t.redemptions.filterStatus}</span>
          <select
            className="input"
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as RedemptionStatus | "");
            }}
            value={status}
          >
            <option value="">{t.redemptions.allStatuses}</option>
            {(Object.keys(statusLabels) as RedemptionStatus[]).map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <button className="button" disabled={loading} type="submit">
          {loading ? t.users.searching : t.users.search}
        </button>
      </form>

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {!items ? (
        <div className="panel">{t.redemptions.loading}</div>
      ) : items.length === 0 ? (
        <div className="empty">{t.redemptions.empty}</div>
      ) : (
        <div className="table-wrap">
          <table className="table redemption-table">
            <thead>
              <tr>
                <th>{t.redemptions.member}</th>
                <th>{t.redemptions.reward}</th>
                <th>{t.redemptions.points}</th>
                <th>{t.redemptions.requestedAt}</th>
                <th>{t.redemptions.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.user.name}</strong>
                    <small className="table-secondary">{item.user.email}</small>
                    {item.user.phone && (
                      <small className="table-secondary">{item.user.phone}</small>
                    )}
                  </td>
                  <td>
                    <Link className="user-name-link" href={`/redemptions/${item.id}`}>
                      {locale === "en"
                        ? item.reward_name_en_snapshot
                        : item.reward_name_vi_snapshot}
                    </Link>
                  </td>
                  <td>{item.point_cost_snapshot}</td>
                  <td>{formatAdminDateTime(item.created_at, locale)}</td>
                  <td>
                    <span className={`badge redemption-status ${item.status}`}>
                      {statusLabels[item.status]}
                    </span>
                  </td>
                  <td>
                    <Link className="button secondary" href={`/redemptions/${item.id}`}>
                      {t.redemptions.view}
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
