import { CSAPurchaseRequestList } from "@/components/csa-purchase-request-list";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.csaPurchases.title };
}

export default async function Page() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        title={t.csaPurchases.title}
        description={t.page.csaPurchaseRequestsDescription}
      />
      <CSAPurchaseRequestList />
    </>
  );
}
