import Link from "next/link";

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
          <Link className="button" href="/csa-coupons/new">
            {t.csaCoupons.create}
          </Link>
        }
      />
      <CSACouponList />
    </>
  );
}
