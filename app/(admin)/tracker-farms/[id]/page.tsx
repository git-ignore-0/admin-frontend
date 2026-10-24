import { FarmTrackerProfileEditor } from "@/components/farm-tracker-profile-editor";

export default async function TrackerFarmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FarmTrackerProfileEditor farmId={id} />;
}
