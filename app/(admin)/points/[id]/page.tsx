import { PointDetail } from "@/components/point-detail";

export default async function PointDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PointDetail userId={id} />;
}
