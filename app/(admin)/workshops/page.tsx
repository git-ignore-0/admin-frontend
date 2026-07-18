import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { WorkshopList } from "@/components/workshop-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.workshops };
}

export default async function WorkshopsPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        title={t.common.workshops}
        description={t.page.workshopsDescription}
        action={
          <Link className="button" href="/workshops/new">
            {t.workshops.create}
          </Link>
        }
      />
      <WorkshopList />
    </>
  );
}
