import { MembershipPackageEditor } from "@/components/membership-catalog-editors";
import { MembershipCatalogEditorHeading } from "@/components/membership-catalog-route-navigation";

export default async function PackageEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <MembershipCatalogEditorHeading resource="packages" id={id} />
      <MembershipPackageEditor packageId={id} />
    </>
  );
}
