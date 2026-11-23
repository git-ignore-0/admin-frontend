import { CSARoundEditor } from "@/components/csa-round-editor";
import { readRoundNavigationContext, type RoundListQuery } from "../../round-navigation";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RoundListQuery>;
}) {
  const { id } = await params;
  const listContext = readRoundNavigationContext(await searchParams);
  return <CSARoundEditor key={id} roundId={id} listContext={listContext} />;
}
