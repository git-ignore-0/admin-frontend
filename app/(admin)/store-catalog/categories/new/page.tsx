import { PageHeading } from "@/components/page-heading";
import { StoreCategoryEditor } from "@/components/store-category-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function NewStoreCategoryPage() {
  const t = adminDictionaries[await getAdminLocale()].storeCatalog;
  return (
    <>
      <PageHeading
        title={t.addCategory}
        backHref="/store-catalog/categories"
        backLabel={t.categories}
      />
      <StoreCategoryEditor />
    </>
  );
}
