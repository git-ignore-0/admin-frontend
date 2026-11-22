import { notFound } from "next/navigation";

export default async function NavigationPreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "development") {
    const { RoutePreviewBreadcrumb } =
      await import("@/components/ui-foundation-showcase/route-preview");
    return (
      <>
        <RoutePreviewBreadcrumb />
        {children}
      </>
    );
  }
  notFound();
}
