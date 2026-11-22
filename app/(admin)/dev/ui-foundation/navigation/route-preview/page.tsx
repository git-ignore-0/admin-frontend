import { notFound } from "next/navigation";

export default async function NavigationPreviewPage() {
  if (process.env.NODE_ENV === "development") {
    const [{ RoutePreview }] = await Promise.all([
      import("@/components/ui-foundation-showcase/route-preview"),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
    return <RoutePreview />;
  }
  notFound();
}
