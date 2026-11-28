"use client";
import { Alert } from "@mantine/core";

import { useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { DataState } from "@/components/nfv-controls";
import { PointLedger } from "@/components/point-ledger";
import { userIdentityLabel } from "@/lib/admin-users";
import { apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, requestErrorMessage } from "@/lib/client-error";
import type { AdminUserDetail, PaginationMeta } from "@/lib/types";

export function PointDetail({ userId }: { userId: string }) {
  return <PointDetailContent key={userId} userId={userId} />;
}

function PointDetailContent({ userId }: { userId: string }) {
  const { t } = useAdminI18n();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState("");

  const retire = useCallback(
    (caught: unknown) => {
      setUser(null);
      setError(requestErrorMessage(caught, t));
    },
    [t],
  );

  useEffect(() => {
    const controller = new AbortController();
    const active = () => !controller.signal.aborted && isCurrent();
    setError("");
    apiEnvelope<AdminUserDetail, { invited: PaginationMeta }>(
      `admin/users/${userId}`,
      { signal: controller.signal },
      { shouldRedirectToLogin: active },
    )
      .then(({ data }) => {
        if (!active()) return;
        if (data.id !== userId) throw invalidApiResponse();
        setUser(data);
      })
      .catch((caught) => {
        if (active()) retire(caught);
      });
    return () => controller.abort();
  }, [isCurrent, retire, userId]);

  if (error)
    return (
      <Alert color="red" role="alert">
        {error}
      </Alert>
    );
  if (!user) return <DataState kind="loading" title={t.users.loading} />;

  return (
    <>
      <DetailPageHeading
        backHref="/points"
        backLabel={t.points.backLabel}
        title={t.points.detailTitle}
        description={userIdentityLabel(user)}
      />
      <PointLedger
        key={user.id}
        userId={user.id}
        userName={user.name}
        onAccessLost={retire}
        onBalanceChange={(pointsBalance) =>
          setUser((current) => (current ? { ...current, points_balance: pointsBalance } : current))
        }
      />
    </>
  );
}
