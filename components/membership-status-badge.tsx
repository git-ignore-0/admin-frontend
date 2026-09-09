"use client";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import type { MembershipStatus } from "@/lib/types";

export function MembershipStatusBadge({
  status,
  label,
}: {
  status: MembershipStatus;
  label?: string;
}) {
  const { t } = useAdminI18n();
  return (
    <span className={`badge membership-status ${status}`}>
      {label ?? t.memberships.statuses[status]}
    </span>
  );
}
