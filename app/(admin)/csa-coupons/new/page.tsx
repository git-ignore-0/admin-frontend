import { CSACouponEditor } from "@/components/csa-coupon-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.csaCoupons.create };
}

export default async function Page() {
  return <CSACouponEditor />;
}
