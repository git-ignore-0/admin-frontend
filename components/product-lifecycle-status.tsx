"use client";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Status } from "@/components/nfv-controls";
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

export function ProductLockReasons({ reasons }: { reasons: ProductLockReason[] }) {
  const {
    t: { storeCatalog: copy },
  } = useAdminI18n();
  return (
    <ul>
      {reasons.map((reason) => (
        <li key={reason.code}>
          {[copy.productLockReasons[reason.code], reason.label ?? reason.id, reason.farm_id]
            .filter(Boolean)
            .join(" · ")}
        </li>
      ))}
    </ul>
  );
}
