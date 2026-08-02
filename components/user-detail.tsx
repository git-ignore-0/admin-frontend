"use client";

import { useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { Pagination } from "@/components/pagination";
import { formatAdminDateTime } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { AdminUserDetail, PaginationMeta } from "@/lib/types";

export function UserDetail({ userId }: { userId: string }) {
  const { t } = useAdminI18n();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [invitedMeta, setInvitedMeta] = useState<PaginationMeta | null>(null);
  const [invitedPage, setInvitedPage] = useState(1);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiEnvelope<AdminUserDetail, { invited: PaginationMeta }>(
      `admin/users/${userId}?invited_page=${invitedPage}`,
    )
      .then((payload) => {
        setUser(payload.data);
        setInvitedMeta(payload.meta?.invited ?? null);
      })
      .catch((caught) => setError(requestErrorMessage(caught, t)));
  }, [invitedPage, t, userId]);

  useEffect(load, [load]);
  if (error) return <p className="error-box">{error}</p>;
  if (!user) return <div className="panel">{t.users.loading}</div>;
  return (
    <>
      <DetailPageHeading
        backHref="/users"
        backLabel={t.users.backLabel}
        title={t.users.detailTitle}
        description={`${user.name} · ${user.email}`}
      />
      <section className="detail-grid" aria-label={t.users.details}>
        <dl className="detail-list panel">
          <div>
            <dt>{t.users.email}</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>{t.users.phone}</dt>
            <dd>{user.phone || "—"}</dd>
          </div>
          <div>
            <dt>{t.users.created}</dt>
            <dd>{formatAdminDateTime(user.date_joined)}</dd>
          </div>
          <div>
            <dt>{t.users.status}</dt>
            <dd>
              <span className="badge">
                {t.users.statuses[user.status as keyof typeof t.users.statuses] ?? user.status}
              </span>
            </dd>
          </div>
          <div>
            <dt>{t.users.referralCode}</dt>
            <dd>
              <code>{user.referral_code}</code>
            </dd>
          </div>
          <div>
            <dt>{t.users.source}</dt>
            <dd>
              {user.referrer
                ? t.users.referredBy.replace("{name}", user.referrer.name)
                : t.users.organic}
            </dd>
          </div>
          <div>
            <dt>{t.users.balance}</dt>
            <dd>{user.points_balance}</dd>
          </div>
        </dl>
        <div className="panel">
          <div className="panel-head">
            <h2>{t.users.invited.replace("{count}", String(user.invited_count))}</h2>
          </div>
          {user.invited_users.length === 0 ? (
            <div className="empty">{t.users.invitedEmpty}</div>
          ) : (
            <ul className="invited-list">
              {user.invited_users.map((invitee) => (
                <li key={invitee.id}>
                  <span>
                    <strong>{invitee.name}</strong>
                    <small>{invitee.email}</small>
                  </span>
                  <span className="badge">
                    {t.users.statuses[invitee.status as keyof typeof t.users.statuses] ??
                      invitee.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {invitedMeta && (
            <Pagination
              page={invitedMeta.page}
              total={invitedMeta.total}
              pageSize={invitedMeta.page_size}
              onPage={setInvitedPage}
              previousLabel={t.common.previous}
              nextLabel={t.common.next}
              summary={t.common.pagination}
            />
          )}
        </div>
      </section>
    </>
  );
}
