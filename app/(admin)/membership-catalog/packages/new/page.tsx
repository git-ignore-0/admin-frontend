import { MembershipPackageEditor } from "@/components/membership-catalog-editors";
import { MembershipCatalogEditorHeading } from "@/components/membership-catalog-route-navigation";

export default function NewPackagePage() {
  return (
    <>
      <MembershipCatalogEditorHeading resource="packages" />
      <MembershipPackageEditor />
    </>
  );
}
