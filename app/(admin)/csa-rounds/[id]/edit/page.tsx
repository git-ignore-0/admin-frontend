import { CSARoundEditor } from "@/components/csa-round-editor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CSARoundEditor key={id} roundId={id} />;
}
