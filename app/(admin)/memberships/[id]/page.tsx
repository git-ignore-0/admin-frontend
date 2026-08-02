import { MembershipDetail } from "@/components/membership-detail";

export default async function MembershipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MembershipDetail membershipId={id} />;
}
