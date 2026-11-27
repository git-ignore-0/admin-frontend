"use client";

import { Anchor, List } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { LockReasonList } from "@/components/lock-disclosure";
import { farmHref } from "@/lib/farm-navigation";
import { farmsCopy } from "@/lib/farms-copy";
import type { FarmDeleteReason } from "@/lib/types";

export function FarmDeleteReasons({
  farmId,
  search,
  reasons,
}: {
  farmId: string;
  search: Parameters<typeof farmHref>[0];
  reasons: FarmDeleteReason[];
}) {
  const { locale } = useAdminI18n();
  const c = farmsCopy(locale);
  if (!reasons.length) return null;
  return (
    <LockReasonList>
      {reasons.map((reason) => {
        const label =
          reason.code === "store_order"
            ? reason.label
            : (locale === "vi"
                ? reason.name_vi || reason.name_en
                : reason.name_en || reason.name_vi) || reason.label;
        const href =
          reason.code === "store_order"
            ? `/store-orders/${reason.id}`
            : farmHref(search, { id: farmId, productId: reason.id });
        return (
          <List.Item key={reason.code}>
            {c.deleteReasons[reason.code]}
            {" · "}
            <Anchor component={AdminNavigationLink} href={href} size="sm">
              {label}
            </Anchor>
          </List.Item>
        );
      })}
    </LockReasonList>
  );
}
