import { CSATermsList } from "@/components/csa-terms-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.csaTerms.title };
}

export default function Page() {
  return <CSATermsList />;
}
