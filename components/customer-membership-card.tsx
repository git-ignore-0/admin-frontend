import Link from "next/link";

import { MembershipStatusBadge } from "@/components/membership-status-badge";
import { formatAdminDate, membershipLastReceiptDate } from "@/lib/admin-date";
import type { AdminDictionary } from "@/lib/admin-i18n";
import type { AdminMembership } from "@/lib/types";

export function CustomerMembershipCard({ item, t }: { item: AdminMembership; t: AdminDictionary }) {
  return (
    <article className="customer-membership-item">
      <div className="customer-membership-summary">
        <h3>{item.package_name}</h3>
        <MembershipStatusBadge
          label={t.csaCustomers.membershipStatuses[item.status]}
          status={item.status}
        />
      </div>
      <dl className="customer-membership-dates">
        <div>
          <dt>{t.memberships.startDate}</dt>
          <dd>{formatAdminDate(item.start_date)}</dd>
        </div>
        <div>
          <dt>{t.memberships.lastReceiptDate}</dt>
          <dd>{formatAdminDate(membershipLastReceiptDate(item.end_date))}</dd>
        </div>
      </dl>
      <Link className="button secondary customer-membership-link" href={`/memberships/${item.id}`}>
        {t.memberships.view}
      </Link>
    </article>
  );
}
