import { notFound } from "next/navigation";

import { CSAOccurrenceList } from "@/components/csa-occurrence-list";
import { getAdminLocale } from "@/lib/admin-locale";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { adminDictionaries } from "@/lib/admin-i18n";

export async function generateMetadata() {
  return { title: adminDictionaries[await getAdminLocale()].common.csaRounds };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATH_SEGMENT.test(id)) notFound();
  return <CSAOccurrenceList key={id} configurationId={id} />;
}
