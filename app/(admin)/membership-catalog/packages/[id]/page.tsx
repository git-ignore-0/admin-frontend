import { MembershipPackageDetail } from "@/components/membership-catalog-detail";

export default async function PackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MembershipPackageDetail packageId={id} />;
}
