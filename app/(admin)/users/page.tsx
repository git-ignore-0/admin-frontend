import { UserDirectory } from "@/components/user-directory";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.users };
}

export default function UsersPage() {
  return <UserDirectory />;
}
