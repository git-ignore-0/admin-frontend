import { Button } from "@mantine/core";
import Link from "next/link";

import { MembershipProductList } from "@/components/membership-catalog-lists";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function ProductListPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        action={
          <Button component={Link} href="/membership-catalog/products/new">
            {t.membershipCatalog.addProduct}
          </Button>
        }
        backHref="/membership-catalog"
        backLabel={t.membershipCatalog.catalogTitle}
        description={t.page.membershipProductsDescription}
        title={t.membershipCatalog.products}
      />
      <MembershipProductList />
    </>
  );
}
