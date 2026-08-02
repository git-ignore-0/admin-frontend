import { MembershipRequestDetail } from "@/components/membership-request-detail";

export default async function MembershipRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MembershipRequestDetail requestId={id} />;
}
