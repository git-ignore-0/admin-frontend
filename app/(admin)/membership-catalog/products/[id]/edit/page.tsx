import { MembershipProductEditor } from "@/components/membership-catalog-editors";
import { MembershipCatalogEditorHeading } from "@/components/membership-catalog-route-navigation";

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <MembershipCatalogEditorHeading resource="products" id={id} />
      <MembershipProductEditor productId={id} />
    </>
  );
}
