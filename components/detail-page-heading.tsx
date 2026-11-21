import type { MantineSpacing } from "@mantine/core";
import { PageHeading } from "@/components/page-heading";

export function DetailPageHeading({
  backHref,
  backLabel,
  title,
  description,
  bottomSpacing,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  description?: string;
  bottomSpacing?: MantineSpacing;
}) {
  return (
    <PageHeading
      bottomSpacing={bottomSpacing}
      backHref={backHref}
      backLabel={backLabel}
      title={title}
      description={description}
    />
  );
}
