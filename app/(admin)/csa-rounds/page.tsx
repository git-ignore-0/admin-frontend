import { CSARoundList } from "@/components/csa-round-list";
import { getAdminLocale } from "@/lib/admin-locale";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";

export async function generateMetadata() {
  return { title: csaRoundsCopy(await getAdminLocale()).title };
}

export default function Page() {
  return <CSARoundList />;
}
