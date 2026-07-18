import { PageHeading } from "@/components/page-heading";
import { WorkshopEditor } from "@/components/workshop-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.page.newWorkshop };
}

export default async function NewWorkshopPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading title={t.page.newWorkshop} description={t.page.newWorkshopDescription} />
      <WorkshopEditor />
    </>
  );
}
