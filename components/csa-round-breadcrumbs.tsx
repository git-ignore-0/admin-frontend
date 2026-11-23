"use client";

import { QueryClientContext } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useContext, useLayoutEffect, useMemo } from "react";
import {
  csaRoundListPath,
  roundConfigurationHref,
  roundConfigurationPath,
  roundNavigationHref,
  roundRecordHref,
  roundRecordPath,
  type RoundNavigationContext,
} from "@/app/(admin)/csa-rounds/round-navigation";
import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";
import type { AdminBreadcrumbItem } from "@/lib/admin-navigation";
import {
  csaRoundConfigurationKey,
  type AdminCSARound,
  type CSARoundConfiguration,
  type CSAConfigurationStatus,
} from "@/lib/csa-rounds";

function configurationBreadcrumbNameKey(id: string) {
  return [...csaRoundConfigurationKey(id), "breadcrumb-name"] as const;
}

export function CSARoundBreadcrumbs({
  roundId,
  round,
  editing = false,
  listPage = 1,
  listStatus,
  listContext,
  configurationId,
  configurationName,
}: {
  roundId?: string;
  round?: AdminCSARound;
  editing?: boolean;
  listPage?: number;
  listStatus?: CSAConfigurationStatus | "";
  listContext?: RoundNavigationContext;
  configurationId?: string;
  configurationName?: string;
}) {
  const { t, locale } = useAdminI18n();
  const editConfiguration = csaRoundsCopy(locale).editConfiguration;
  const client = useContext(QueryClientContext);
  const search = useSearchParams()?.toString();
  const context = listContext ?? { page: listPage, status: listStatus };
  const roundConfigurationId = round?.configuration_id;
  const roundConfigurationName = round?.configuration_name;
  const rootId = roundConfigurationId ?? listContext?.configurationId;
  const configurationPath = configurationId ? roundConfigurationPath(configurationId) : null;
  const cachedId = configurationId ?? rootId;
  const cached = cachedId
    ? client?.getQueryState<CSARoundConfiguration>(csaRoundConfigurationKey(cachedId))
    : undefined;
  const cachedName =
    cachedId && cached?.status !== "error"
      ? (cached?.data?.name ??
        client?.getQueryData<string>(configurationBreadcrumbNameKey(cachedId)))
      : undefined;

  useLayoutEffect(() => {
    if (roundConfigurationId && roundConfigurationName) {
      // A directly opened round knows its parent's title before the configuration is fetched.
      client?.setQueryData(
        configurationBreadcrumbNameKey(roundConfigurationId),
        roundConfigurationName,
      );
    }
  }, [client, roundConfigurationId, roundConfigurationName]);

  const pathname = roundId
    ? roundRecordPath(roundId, editing ? "edit" : undefined)
    : configurationId
      ? roundConfigurationPath(configurationId, editing ? "edit" : undefined)
      : editing
        ? `${csaRoundListPath}/new`
        : csaRoundListPath;
  const listHref = roundNavigationHref(csaRoundListPath, {
    page: context.page,
    status: context.status,
    type: listContext?.type,
  });
  const groupHref = rootId ? roundConfigurationHref(context, rootId) : undefined;
  const configurationHref = configurationId
    ? roundConfigurationHref(context, configurationId)
    : undefined;
  const detailHref = roundId ? roundRecordHref(roundId, context, rootId) : undefined;
  const groupName = roundConfigurationName ?? cachedName;
  const configurationTitle = configurationName ?? cachedName;
  const items = useMemo(() => {
    const list = { label: t.common.csaRounds, href: listHref };
    if (configurationPath) {
      const trail: AdminBreadcrumbItem[] = [list];
      if (configurationTitle)
        trail.push({ label: configurationTitle, href: editing ? configurationHref : undefined });
      if (editing) trail.push({ label: editConfiguration });
      return trail;
    }
    if (!detailHref) return editing ? [list, { label: t.breadcrumb.newCsaConfiguration }] : [list];
    const trail: AdminBreadcrumbItem[] = [list];
    if (groupHref && groupName) trail.push({ label: groupName, href: groupHref });
    trail.push({ label: t.breadcrumb.roundDetails, href: editing ? detailHref : undefined });
    if (editing) trail.push({ label: t.breadcrumb.editCsaRound });
    return trail;
  }, [
    t,
    configurationHref,
    configurationPath,
    configurationTitle,
    editConfiguration,
    detailHref,
    editing,
    groupHref,
    groupName,
    listHref,
  ]);
  return <AdminBreadcrumbForRoute pathname={pathname} search={search} items={items} />;
}
