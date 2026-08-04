"use client";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import type { MembershipStatus } from "@/lib/types";

export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  const { t } = useAdminI18n();
  return (
    <span className={`badge membership-status ${status}`}>{t.memberships.statuses[status]}</span>
  );
}
