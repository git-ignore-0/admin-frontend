import { PageHeading } from "@/components/page-heading";
import { PointsManager } from "@/components/points-manager";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.points };
}

export default async function PointsPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading title={t.common.points} description={t.page.pointsDescription} />
      <PointsManager />
    </>
  );
}
