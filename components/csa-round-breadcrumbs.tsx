"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { roundPageHref } from "@/app/(admin)/csa-rounds/round-navigation";
import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import type { CSARoundStatus } from "@/lib/csa-rounds";

export function CSARoundBreadcrumbs({
  roundId,
  editing = false,
  listPage,
  listStatus,
}: {
  roundId?: string;
  editing?: boolean;
  listPage: number;
  listStatus?: CSARoundStatus | "";
}) {
  const { t } = useAdminI18n();
  const search = useSearchParams()?.toString();
  const listPath = "/csa-rounds";
  const recordPath = roundId ? `${listPath}/${encodeURIComponent(roundId)}` : null;
  const pathname = recordPath ? (editing ? `${recordPath}/edit` : recordPath) : `${listPath}/new`;
  const items = useMemo(() => {
    const list = { label: t.common.csaRounds, href: roundPageHref(listPath, listPage, listStatus) };
    if (!recordPath) return [list, { label: t.breadcrumb.newRound }];
    const detail = { label: t.breadcrumb.roundDetails };
    if (!editing) return [list, detail];
    return [
      list,
      { ...detail, href: roundPageHref(recordPath, listPage, listStatus) },
      { label: t.breadcrumb.edit },
    ];
  }, [editing, listPage, listPath, listStatus, recordPath, t]);
  return <AdminBreadcrumbForRoute pathname={pathname} search={search} items={items} />;
}
