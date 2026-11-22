import { CSARoundEditor } from "@/components/csa-round-editor";
import { readRoundListContext, type RoundListQuery } from "../round-navigation";

export default async function Page({ searchParams }: { searchParams: Promise<RoundListQuery> }) {
  const { page, status } = readRoundListContext(await searchParams);
  return <CSARoundEditor listPage={page} listStatus={status} />;
}
