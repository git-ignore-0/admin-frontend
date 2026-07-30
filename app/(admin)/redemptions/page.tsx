import { PageHeading } from "@/components/page-heading";
import { RedemptionList } from "@/components/redemption-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.redemptions };
}

export default async function RedemptionsPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading title={t.common.redemptions} description={t.page.redemptionsDescription} />
      <RedemptionList />
    </>
  );
}
