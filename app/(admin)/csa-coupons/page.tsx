import { ActionLink, Icon } from "@/components/nfv-controls";

import { CSACouponList } from "@/components/csa-coupon-list";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.csaCoupons.title };
}

export default async function Page() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        title={t.csaCoupons.title}
        description={t.csaCoupons.description}
        action={
          <ActionLink href="/csa-coupons/new">
            <Icon name="plus" />
            {t.csaCoupons.create}
          </ActionLink>
        }
      />
      <CSACouponList />
    </>
  );
}
