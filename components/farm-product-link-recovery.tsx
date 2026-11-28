"use client";

import { Button, Stack } from "@mantine/core";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { RecoveryAlert } from "@/components/recovery-alert";
import { farmsCopy } from "@/lib/farms-copy";
import type { FarmProductLinkWrite } from "@/lib/use-farm-product-link-write";

export function FarmProductLinkRecovery({
  write,
  onSuccess,
}: {
  write: FarmProductLinkWrite;
  onSuccess: Parameters<FarmProductLinkWrite["recover"]>[0];
}) {
  const { locale } = useAdminI18n();
  const c = farmsCopy(locale);
  if (write.failure?.kind === "idempotency_conflict") {
    return (
      <RecoveryAlert
        message={c.linkKeyConflict}
        retryLabel={c.acknowledgeLinkConflict}
        onRetry={write.clearFailure}
      />
    );
  }
  if (write.failure?.kind !== "unknown") return null;
  return (
    <Stack gap="xs" align="flex-start">
      <RecoveryAlert
        message={write.failure.receiptNotFound ? c.linkReceiptMissing : c.linkUnconfirmed}
        retryLabel={c.checkLinkReceipt}
        onRetry={() => void write.recover(onSuccess)}
        loading={write.checking}
      />
      <Button
        variant="default"
        disabled={write.pending || write.blocked}
        onClick={() => void write.retry(onSuccess)}
      >
        {c.retryLinkIntent}
      </Button>
    </Stack>
  );
}
