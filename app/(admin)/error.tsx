"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { RecoveryAlert } from "@/components/recovery-alert";

export default function AdminRouteError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useAdminI18n();
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  return (
    <RecoveryAlert
      message={t.common.routeError}
      retryLabel={t.common.retry}
      loading={retrying}
      onRetry={() => {
        startRetry(() => {
          // Refresh the server payload as well as resetting the client error boundary.
          router.refresh();
          reset();
        });
      }}
    />
  );
}
