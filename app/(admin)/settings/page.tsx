import { MembershipPaymentSettingsForm } from "@/components/membership-payment-settings-form";
import { PageHeading } from "@/components/page-heading";
import { SiteSettingsForm } from "@/components/site-settings-form";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.settings };
}

export default async function SettingsPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading title={t.common.settings} description={t.page.settingsDescription} />
      <SiteSettingsForm />
      <MembershipPaymentSettingsForm />
    </>
  );
}
