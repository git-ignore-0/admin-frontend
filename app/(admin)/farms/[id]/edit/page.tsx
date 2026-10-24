import { FarmEditor } from "@/components/farm-editor";

export default async function EditFarmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FarmEditor farmId={id} />;
}
