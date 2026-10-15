import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { StoreCategoryList } from "@/components/store-category-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function StoreCategoriesPage() {
  const t = adminDictionaries[await getAdminLocale()].storeCatalog;
  return (
    <>
      <PageHeading
        title={t.categories}
        description={t.categoriesDescription}
        backHref="/store-catalog"
        backLabel={t.title}
        action={
          <Link className="button" href="/store-catalog/categories/new">
            {t.addCategory}
          </Link>
        }
      />
      <StoreCategoryList />
    </>
  );
}
