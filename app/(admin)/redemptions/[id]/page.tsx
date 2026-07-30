import { RedemptionDetailView } from "@/components/redemption-detail";

export default async function RedemptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RedemptionDetailView redemptionId={id} />;
}
