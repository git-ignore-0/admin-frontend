import { ShippingAreaManager } from "@/components/shipping-area-manager";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const copy = adminDictionaries[await getAdminLocale()].shippingSettings;
  return { title: copy.title };
}

export default function ShippingSettingsPage() {
  return <ShippingAreaManager />;
}
