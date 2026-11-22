"use client";

import { Button, Paper, Stack, Text } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { PageHeading } from "@/components/page-heading";
import {
  readSampleNavigationContext,
  sampleNavigationPath,
  sampleParentHref,
} from "./sample-navigation";

const copy = {
  vi: {
    title: "Xem thử tải trang",
    ready: "Trang mô phỏng đã tải xong. Bạn có thể thử khôi phục lỗi ngay tại đây.",
    error: "Mô phỏng lỗi hiển thị",
  },
  en: {
    title: "Route loading preview",
    ready: "The simulated page has loaded. Trigger a rendering error to try recovery.",
    error: "Simulate rendering error",
  },
};

export function RoutePreviewBreadcrumb() {
  const search = useSearchParams();
  const { locale, t } = useAdminI18n();
  const context = readSampleNavigationContext((key) => search?.get(key));
  return (
    <AdminBreadcrumbForRoute
      pathname={sampleNavigationPath("route-preview")}
      search={search?.toString()}
      items={[
        { label: t.breadcrumb.uiFoundation, href: sampleParentHref(context) },
        { label: copy[locale].title },
      ]}
    />
  );
}

export function RoutePreview() {
  const { locale } = useAdminI18n();
  const [failed, setFailed] = useState(false);
  if (failed) throw new Error("Simulated route render error");
  const { title, ready, error } = copy[locale];
  return (
    <>
      <PageHeading title={title} visuallyHiddenTitle bottomSpacing={0} />
      <Paper p="md" withBorder>
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{ready}</Text>
          <Button variant="default" onClick={() => setFailed(true)}>
            {error}
          </Button>
        </Stack>
      </Paper>
    </>
  );
}
