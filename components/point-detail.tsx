"use client";

import { useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { PointLedger } from "@/components/point-ledger";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { AdminUserDetail, PaginationMeta } from "@/lib/types";

export function PointDetail({ userId }: { userId: string }) {
  const { t } = useAdminI18n();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    apiEnvelope<AdminUserDetail, { invited: PaginationMeta }>(`admin/users/${userId}`)
      .then((payload) => setUser(payload.data))
      .catch((caught) => setError(requestErrorMessage(caught, t)));
  }, [t, userId]);

  useEffect(load, [load]);

  if (error) return <p className="error-box">{error}</p>;
  if (!user) return <div className="panel">{t.users.loading}</div>;

  return (
    <>
      <DetailPageHeading
        backHref="/points"
        backLabel={t.points.backLabel}
        title={t.points.detailTitle}
        description={`${user.name} · ${user.email}`}
      />
      <PointLedger
        userId={user.id}
        userName={user.name}
        onBalanceChange={(pointsBalance) =>
          setUser((current) => (current ? { ...current, points_balance: pointsBalance } : current))
        }
      />
    </>
  );
}
