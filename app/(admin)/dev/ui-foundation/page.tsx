import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SampleSearchParams } from "@/components/ui-foundation-showcase/sample-navigation";

export const metadata: Metadata = { title: "UI Foundation Showcase" };

export default async function UiFoundationPage({
  searchParams,
}: {
  searchParams: Promise<SampleSearchParams>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const [{ UiFoundationShowcase }, { readSampleSearchParams }, query] = await Promise.all([
    import("@/components/ui-foundation-showcase"),
    import("@/components/ui-foundation-showcase/sample-navigation"),
    searchParams,
  ]);
  return <UiFoundationShowcase navigationContext={readSampleSearchParams(query)} />;
}
