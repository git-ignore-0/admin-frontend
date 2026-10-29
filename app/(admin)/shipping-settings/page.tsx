import { PageHeading } from "@/components/page-heading";
import { ShippingAreaManager } from "@/components/shipping-area-manager";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function ShippingSettingsPage() {
  const copy = adminDictionaries[await getAdminLocale()].shippingSettings;
  return (
    <>
      <PageHeading description={copy.description} title={copy.title} />
      <ShippingAreaManager />
    </>
  );
}
