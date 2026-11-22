import { Button, Paper, Stack, Textarea, Title } from "@mantine/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { PageHeading } from "@/components/page-heading";
import type { SampleSearchParams } from "@/components/ui-foundation-showcase/sample-navigation";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function SampleNavigationPage({
  params,
  searchParams,
}: {
  params: Promise<{ example: string[] }>;
  searchParams: Promise<SampleSearchParams>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { example } = await params;
  const [id, subpage] = example;
  const edit = example.length === 2 && subpage === "edit";
  if (!id || (example.length !== 1 && !edit)) notFound();

  const {
    findSampleNavigationRecord,
    readSampleSearchParams,
    sampleNavigationBreadcrumbs,
    sampleNavigationHref,
    sampleNavigationPath,
  } = await import("@/components/ui-foundation-showcase/sample-navigation");
  const record = findSampleNavigationRecord(id);
  if (!record) notFound();

  const [locale, query] = await Promise.all([getAdminLocale(), searchParams]);
  const context = readSampleSearchParams(query);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }
  const items = sampleNavigationBreadcrumbs(record, locale, { edit, context });
  const title = items[items.length - 1].label;
  const vi = locale === "vi";
  const { SampleRecordDetails } =
    await import("@/components/ui-foundation-showcase/record-overlays");

  return (
    <>
      <AdminBreadcrumbForRoute
        pathname={sampleNavigationPath(id, edit)}
        search={search.toString()}
        items={items}
      />
      <PageHeading title={title} visuallyHiddenTitle bottomSpacing={0} />
      <Stack gap="md" align="stretch">
        {edit ? (
          <Paper component="form" p="md">
            <Stack gap="sm" align="flex-start">
              <Title order={2} size="md" fw={600}>
                {vi ? "Bản nháp ghi chú" : "Draft field notes"}
              </Title>
              <Textarea
                name="notes"
                label={vi ? "Ghi chú thực địa" : "Field notes"}
                description={
                  vi
                    ? "Bản nháp chỉ có hiệu lực tại trang này."
                    : "The draft is local to this page."
                }
                defaultValue={record.notes}
                rows={5}
                w="100%"
              />
              <Button variant="default" type="reset">
                {vi ? "Khôi phục ghi chú" : "Reset notes"}
              </Button>
            </Stack>
          </Paper>
        ) : (
          <>
            <SampleRecordDetails record={record} />
            <Button
              component={Link}
              href={sampleNavigationHref(id, { edit: true, context })}
              variant="default"
              style={{ alignSelf: "flex-start" }}
            >
              {vi ? "Chỉnh sửa ghi chú" : "Edit field notes"}
            </Button>
          </>
        )}
      </Stack>
    </>
  );
}
