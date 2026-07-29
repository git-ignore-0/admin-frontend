"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Pagination } from "@/components/pagination";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { AdminUserListItem, PaginationMeta } from "@/lib/types";

export function UserDirectory({
  detailBasePath = "/users",
  actionLabel,
}: {
  detailBasePath?: "/users" | "/points";
  actionLabel?: string;
}) {
  const { locale, t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminUserListItem[] | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const currentRequest = ++requestId.current;
    setItems(null);
    setError("");
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), search });
    apiEnvelope<AdminUserListItem[], PaginationMeta>(`admin/users?${params}`)
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
  }, [page, search, t]);

  useEffect(load, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setPage(1);
    setSearch(query.trim());
  }

  return (
    <section>
      <form className="search-bar" onSubmit={submit} role="search">
        <label className="field">
          <span>{t.users.searchLabel}</span>
          <input
            className="input"
            type="search"
            value={query}
            placeholder={t.users.searchPlaceholder}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (!value.trim() && search) {
                setPage(1);
                setSearch("");
              }
            }}
          />
        </label>
        <button className="button" disabled={loading} type="submit">
          {loading ? t.users.searching : t.users.search}
        </button>
      </form>
      {error && <p className="error-box">{error}</p>}
      {!items ? (
        <div className="panel">{t.users.loading}</div>
      ) : items.length === 0 ? (
        <div className="empty">{t.users.empty}</div>
      ) : (
        <div className="table-wrap">
          <table className="table user-table">
            <thead>
              <tr>
                <th>{t.users.name}</th>
                <th>{t.users.phone}</th>
                <th>{t.users.created}</th>
                <th>{t.users.status}</th>
                <th>{t.users.balance}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link className="user-name-link" href={`${detailBasePath}/${user.id}`}>
                      {user.name}
                    </Link>
                    <small className="table-secondary">{user.email}</small>
                  </td>
                  <td>{user.phone || "—"}</td>
                  <td>
                    {new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
                      dateStyle: "medium",
                    }).format(new Date(user.date_joined))}
                  </td>
                  <td>
                    <span className="badge">
                      {t.users.statuses[user.status as keyof typeof t.users.statuses] ??
                        user.status}
                    </span>
                  </td>
                  <td>{user.points_balance}</td>
                  <td>
                    <Link className="button secondary" href={`${detailBasePath}/${user.id}`}>
                      {actionLabel ?? t.users.view}
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
          page={meta.page}
          total={meta.total}
          pageSize={meta.page_size}
          onPage={setPage}
          previousLabel={t.common.previous}
          nextLabel={t.common.next}
          summary={t.common.pagination}
        />
      )}
    </section>
  );
}
