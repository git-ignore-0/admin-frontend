import { CSARoundDetail } from "@/components/csa-round-detail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CSARoundDetail key={id} roundId={id} />;
}
