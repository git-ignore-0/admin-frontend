import { DetailPageHeading } from "@/components/detail-page-heading";
import { RewardEditor } from "@/components/reward-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.rewards.editTitle };
}

export default async function EditRewardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref="/rewards"
        backLabel={t.common.rewards}
        description={t.rewards.editDescription}
        title={t.rewards.editTitle}
      />
      <RewardEditor rewardId={id} />
    </>
  );
}
