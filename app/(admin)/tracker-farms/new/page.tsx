import { DetailPageHeading } from "@/components/detail-page-heading";
import { TrackerFarmEditor } from "@/components/tracker-farm-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function NewTrackerFarmPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref="/tracker-farms"
        backLabel={t.common.trackerFarms}
        title={t.trackerFarms.createTitle}
      />
      <TrackerFarmEditor />
    </>
  );
}
