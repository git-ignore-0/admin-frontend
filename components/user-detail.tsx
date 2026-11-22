"use client";
import { DataState } from "@/components/nfv-controls";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button as MantineButton, Group, Alert } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { Button, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/toast-provider";
import { UserAccountDialog, type UserAccountDialogAction } from "@/components/user-account-dialog";
import { formatAdminDateTime } from "@/lib/admin-date";
import {
  accountFailure,
  requireAccountActionResult,
  requireAdminUserRecord,
  userEmailStatus,
  userIdentityLabel,
} from "@/lib/admin-users";
import { requireResponseEntity, requireResponseList } from "@/lib/api-response";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { AdminAccountSummary, AdminUserDetail, PaginationMeta } from "@/lib/types";

export function UserDetail({ userId }: { userId: string }) {
  return <UserDetailView key={userId} userId={userId} />;
}

function UserDetailView({ userId }: { userId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const copy = t.users.accountActions;
  const pendingSubmission = useRef<symbol | null>(null);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [invitedMeta, setInvitedMeta] = useState<PaginationMeta | null>(null);
  const [invitedPage, setInvitedPage] = useState(1);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState<UserAccountDialogAction | null>(null);

  useLayoutEffect(() => {
    return () => {
      pendingSubmission.current = null;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError("");
    apiEnvelope<AdminUserDetail, { invited: PaginationMeta }>(
      `admin/users/${userId}?invited_page=${invitedPage}`,
    )
      .then((payload) => {
        if (ignore) return;
        requireAdminUserRecord(payload.data);
        requireResponseList(payload.data.invited_users, requireResponseEntity);
        setUser(payload.data);
        setInvitedMeta(payload.meta?.invited ?? null);
      })
      .catch((caught) => {
        if (!ignore) setError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [invitedPage, revision, t, userId]);

  function reload() {
    setLoading(true);
    setRevision((current) => current + 1);
  }

  function handleStateConflict(message: string) {
    setDialog(null);
    setActionError(message);
    reload();
  }

  async function changeStatus(action: "activate" | "reactivate") {
    if (pendingSubmission.current) return;
    const submission = Symbol();
    const isCurrent = () => pendingSubmission.current === submission;
    pendingSubmission.current = submission;
    setBusy(true);
    setActionError("");
    try {
      const result = await api<Pick<AdminAccountSummary, "id" | "status">>(
        `admin/users/${userId}/${action}`,
        { method: "POST", headers: { "Accept-Language": locale }, body: "{}" },
        { shouldRedirectToLogin: isCurrent },
      );
      if (!isCurrent()) return;
      requireAccountActionResult(result, action, userId);
      toast(copy.success);
      reload();
    } catch (caught) {
      if (!isCurrent()) return;
      const failure = accountFailure(caught, t, locale);
      if (failure.stateConflict) handleStateConflict(failure.message);
      else setActionError(failure.message || copy.invalid);
    } finally {
      if (isCurrent()) {
        pendingSubmission.current = null;
        setBusy(false);
      }
    }
  }

  const loadError = error && (
    <Alert color="red" role="alert">
      <Group gap="sm">
        <span>{error}</span>
        <Button onClick={reload} small variant="outline">
          {t.common.retry}
        </Button>
      </Group>
    </Alert>
  );
  if (!user || user.id !== userId) {
    return loadError || <DataState kind="loading" title={t.users.loading} />;
  }
  const statusAction =
    user.status === "pending_activation"
      ? "activate"
      : user.status === "active"
        ? "suspend"
        : user.status === "suspended"
          ? "reactivate"
          : null;
  const actionsDisabled = loading || busy || Boolean(error) || dialog !== null;
  const actionAlert = actionError && (
    <Alert color="red" role="alert">
      {actionError}
    </Alert>
  );
  return (
    <>
      <DetailPageHeading
        backHref="/users"
        backLabel={t.users.backLabel}
        title={t.users.detailTitle}
        description={userIdentityLabel(user)}
      />
      <Group gap="xs">
        <MantineButton
          component={Link}
          href={`/points/${encodeURIComponent(user.id)}`}
          variant="outline"
        >
          {t.common.managePoints}
        </MantineButton>
      </Group>
      {loadError}
      {statusAction ? (
        <section className="panel" aria-label={copy.title}>
          <div className="panel-head">
            <h2>{copy.title}</h2>
            <div className="detail-actions">
              <Button
                disabled={actionsDisabled}
                loading={busy}
                onClick={() => {
                  setActionError("");
                  if (statusAction === "suspend") setDialog(statusAction);
                  else void changeStatus(statusAction);
                }}
                variant={statusAction === "suspend" ? "danger" : "primary"}
              >
                {copy[statusAction]}
              </Button>
              {!user.email_verified && (
                <Button
                  disabled={actionsDisabled}
                  onClick={() => {
                    setActionError("");
                    setDialog("reset-password");
                  }}
                  variant="outline"
                >
                  {copy["reset-password"]}
                </Button>
              )}
            </div>
          </div>
          {user.email_verified && <p className="field-help">{copy.emailRecovery}</p>}
          {actionAlert}
        </section>
      ) : (
        actionAlert
      )}
      <section className="detail-grid" aria-label={t.users.details}>
        <dl className="detail-list panel">
          <div>
            <dt>{t.users.email}</dt>
            <dd>{user.email || "—"}</dd>
          </div>
          <div>
            <dt>{t.users.emailStatus}</dt>
            <dd>{userEmailStatus(user, t)}</dd>
          </div>
          <div>
            <dt>{t.users.loginPhone}</dt>
            <dd>{user.login_phone_number || "—"}</dd>
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
              <Status
                domain="user"
                status={user.status}
                label={
                  t.users.statuses[user.status as keyof typeof t.users.statuses] ?? user.status
                }
              />
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
            <DataState kind="empty" title={t.users.invitedEmpty} />
          ) : (
            <ul className="invited-list">
              {user.invited_users.map((invitee) => (
                <li key={invitee.id}>
                  <span>
                    <strong>{invitee.name}</strong>
                    <small>{invitee.email || t.users.emailMissing}</small>
                  </span>
                  <Status
                    domain="user"
                    status={invitee.status}
                    label={
                      t.users.statuses[invitee.status as keyof typeof t.users.statuses] ??
                      invitee.status
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {invitedMeta && (
            <Pagination
              disabled={busy || loading || dialog !== null}
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
      {dialog && (
        <UserAccountDialog
          action={dialog}
          userId={user.id}
          onCancel={() => setDialog(null)}
          onStateConflict={handleStateConflict}
          onSuccess={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
    </>
  );
}
