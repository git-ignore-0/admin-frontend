import { MembershipProductEditor } from "@/components/membership-catalog-editors";
import { MembershipCatalogEditorHeading } from "@/components/membership-catalog-route-navigation";

export default function NewProductPage() {
  return (
    <>
      <MembershipCatalogEditorHeading resource="products" />
      <MembershipProductEditor />
    </>
  );
}
