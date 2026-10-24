import { FarmDetail } from "@/components/farm-detail";

export default async function FarmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FarmDetail farmId={id} />;
}
