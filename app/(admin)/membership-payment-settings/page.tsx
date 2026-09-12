import { MembershipPaymentSettingsForm } from "@/components/membership-payment-settings-form";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.paymentSettings.title };
}

export default async function Page() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        title={t.paymentSettings.title}
        description={t.page.membershipPaymentSettingsDescription}
      />
      <MembershipPaymentSettingsForm />
    </>
  );
}
