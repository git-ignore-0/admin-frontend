import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "UI Foundation Showcase" };

export default async function UiFoundationPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const { UiFoundationShowcase } = await import("@/components/ui-foundation-showcase");
  return <UiFoundationShowcase />;
}
