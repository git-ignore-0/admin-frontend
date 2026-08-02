import { MembershipProductDetail } from "@/components/membership-catalog-detail";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MembershipProductDetail productId={id} />;
}
