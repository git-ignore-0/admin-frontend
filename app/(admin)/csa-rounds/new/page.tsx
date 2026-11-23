import { CSARoundEditor } from "@/components/csa-round-editor";
import { readRoundNavigationContext, type RoundListQuery } from "../round-navigation";

export default async function Page({ searchParams }: { searchParams: Promise<RoundListQuery> }) {
  const listContext = readRoundNavigationContext(await searchParams);
  return <CSARoundEditor listContext={listContext} />;
}
