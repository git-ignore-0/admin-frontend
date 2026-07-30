import { DetailPageHeading } from "@/components/detail-page-heading";
import { RewardEditor } from "@/components/reward-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.rewards.newTitle };
}

export default async function NewRewardPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref="/rewards"
        backLabel={t.common.rewards}
        description={t.rewards.newDescription}
        title={t.rewards.newTitle}
      />
      <RewardEditor />
    </>
  );
}
