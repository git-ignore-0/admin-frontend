import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { RewardList } from "@/components/reward-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.rewards };
}

export default async function RewardsPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        action={
          <Link className="button" href="/rewards/new">
            {t.rewards.create}
          </Link>
        }
        description={t.page.rewardsDescription}
        title={t.common.rewards}
      />
      <RewardList />
    </>
  );
}
