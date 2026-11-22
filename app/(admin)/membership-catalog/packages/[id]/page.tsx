import { MembershipPackageDetail } from "@/components/membership-catalog-detail";
import { MembershipCatalogBreadcrumbs } from "@/components/membership-catalog-route-navigation";

export default async function PackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <MembershipCatalogBreadcrumbs resource="packages" id={id} />
      <MembershipPackageDetail packageId={id} />
    </>
  );
}
