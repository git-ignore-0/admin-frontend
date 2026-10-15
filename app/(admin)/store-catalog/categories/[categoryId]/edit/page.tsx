import { PageHeading } from "@/components/page-heading";
import { StoreCategoryEditor } from "@/components/store-category-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function EditStoreCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  const t = adminDictionaries[await getAdminLocale()].storeCatalog;
  return (
    <>
      <PageHeading
        title={t.edit}
        backHref={`/store-catalog/categories/${categoryId}`}
        backLabel={t.categories}
      />
      <StoreCategoryEditor categoryId={categoryId} />
    </>
  );
}
