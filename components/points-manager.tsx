"use client";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { UserDirectory } from "@/components/user-directory";

export function PointsManager() {
  const { t } = useAdminI18n();
  return <UserDirectory actionLabel={t.points.viewDetail} detailBasePath="/points" />;
}
