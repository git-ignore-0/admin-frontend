import { PageHeading } from "@/components/page-heading";
import { WorkshopEditor } from "@/components/workshop-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.page.editWorkshop };
}

export default async function EditWorkshopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading title={t.page.editWorkshop} description={t.page.editWorkshopDescription} />
      <WorkshopEditor workshopId={id} />
    </>
  );
}
