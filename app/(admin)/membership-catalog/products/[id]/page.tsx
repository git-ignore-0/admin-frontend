import { MembershipProductDetail } from "@/components/membership-catalog-detail";
import { MembershipCatalogBreadcrumbs } from "@/components/membership-catalog-route-navigation";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <MembershipCatalogBreadcrumbs resource="products" id={id} />
      <MembershipProductDetail productId={id} />
    </>
  );
}
