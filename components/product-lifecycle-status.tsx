"use client";

import { Anchor, List, Text } from "@mantine/core";
import Link from "next/link";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { LockDisclosure, LockReasonList } from "@/components/lock-disclosure";
import { Status } from "@/components/nfv-controls";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import type { ProductLockReason, ProductStatus } from "@/lib/types";

export function ProductLifecycleStatus({ status }: { status: ProductStatus }) {
  const {
    t: { storeCatalog: copy },
  } = useAdminI18n();
  if (status === "draft")
    return <Status domain="publication" status="draft" label={copy.productDraft} />;
  if (status === "active")
    return <Status domain="availability" status="active" label={copy.selling} />;
  return <Status domain="availability" status="inactive" label={copy.discontinued} />;
}

export function ProductLockDisclosure({
  summary,
  reasons,
}: {
  summary: string;
  reasons: ProductLockReason[];
}) {
  const {
    t: { storeCatalog: copy },
  } = useAdminI18n();
  return (
    <LockDisclosure
      summary={summary}
      showLabel={copy.showProductLockReasons}
      hideLabel={copy.hideProductLockReasons}
    >
      {reasons.length > 0 && <ProductLockReasons reasons={reasons} />}
    </LockDisclosure>
  );
}

export function ProductLockReasons({ reasons }: { reasons: ProductLockReason[] }) {
  const {
    locale,
    t: { storeCatalog: copy },
  } = useAdminI18n();
  if (!reasons.length) return null;
  return (
    <LockReasonList>
      {reasons.map((reason) => {
        const farm = ["stock_batch", "legacy_supply", "farm_link"].includes(reason.code);
        const order = ["store_order", "store_reservation"].includes(reason.code);
        const id = farm ? reason.farm_id : reason.id;
        const path = farm ? "/farms" : order ? "/store-orders" : "/csa-rounds";
        const farmName =
          locale === "vi"
            ? reason.farm_name_vi || reason.farm_name_en
            : reason.farm_name_en || reason.farm_name_vi;
        const reference = (farm ? farmName : reason.label) || id;
        const href = id && UUID_PATH_SEGMENT.test(id) ? `${path}/${id}` : null;
        return (
          <List.Item key={reason.code}>
            {copy.productLockReasons[reason.code]}
            {reference && (
              <>
                {" · "}
                {href ? (
                  <Anchor component={Link} href={href} size="sm">
                    {reference}
                  </Anchor>
                ) : (
                  <Text component="span" size="sm">
                    {reference}
                  </Text>
                )}
              </>
            )}
          </List.Item>
        );
      })}
    </LockReasonList>
  );
}
