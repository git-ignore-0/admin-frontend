"use client";
import { Status as UiStatus } from "@/components/nfv-controls";

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
    <UiStatus domain="membership" status={status} label={label ?? t.memberships.statuses[status]} />
  );
}
