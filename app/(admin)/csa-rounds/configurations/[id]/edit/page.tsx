import { notFound } from "next/navigation";
import { CSARoundEditor } from "@/components/csa-round-editor";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { readRoundNavigationContext, type RoundListQuery } from "../../../round-navigation";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RoundListQuery>;
}) {
  const { id } = await params;
  if (!UUID_PATH_SEGMENT.test(id)) notFound();
  return (
    <CSARoundEditor
      key={id}
      configurationId={id}
      listContext={readRoundNavigationContext(await searchParams)}
    />
  );
}
