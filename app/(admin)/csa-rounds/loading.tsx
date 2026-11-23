"use client";

import { usePathname, useSearchParams } from "next/navigation";
import AdminRouteLoading from "@/app/(admin)/loading";
import { CSARoundBreadcrumbs } from "@/components/csa-round-breadcrumbs";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { csaRoundListPath, readRoundNavigationContext } from "./round-navigation";

export default function CSARoundRouteLoading() {
  const pathname = usePathname();
  const context = readRoundNavigationContext(useSearchParams());
  const prefix = `${csaRoundListPath}/`;
  const [segment, child, action, extra] = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length).split("/")
    : [];
  const configurationId =
    segment === "configurations" &&
    child &&
    (!action || action === "edit") &&
    !extra &&
    UUID_PATH_SEGMENT.test(child)
      ? child
      : undefined;
  const roundId =
    segment && UUID_PATH_SEGMENT.test(segment) && (!child || child === "edit") && !action
      ? segment
      : undefined;

  return (
    <>
      {(configurationId || (roundId && context.configurationId)) && (
        <CSARoundBreadcrumbs
          configurationId={configurationId}
          roundId={roundId}
          editing={configurationId ? action === "edit" : child === "edit"}
          listContext={context}
        />
      )}
      <AdminRouteLoading />
    </>
  );
}
