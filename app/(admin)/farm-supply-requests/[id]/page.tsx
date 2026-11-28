import { AdminSupplyRequestDetail } from "@/components/admin-supply-request-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminSupplyRequestDetail key={id} requestId={id} />;
}
