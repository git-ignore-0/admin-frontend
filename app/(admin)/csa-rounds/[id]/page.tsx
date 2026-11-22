import { CSARoundDetail } from "@/components/csa-round-detail";
import { readRoundListContext, type RoundListQuery } from "../round-navigation";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RoundListQuery>;
}) {
  const { id } = await params;
  const { page, status } = readRoundListContext(await searchParams);
  return <CSARoundDetail key={id} roundId={id} listPage={page} listStatus={status} />;
}
