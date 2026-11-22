"use client";

import { Group, Loader, Text } from "@mantine/core";
import dynamic from "next/dynamic";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import type { RichTextEditorProps } from "@/components/rich-text-editor";

function RichTextEditorLoading() {
  const { t } = useAdminI18n();
  return (
    <Group gap="sm" role="status">
      <Loader size="sm" />
      <Text size="sm" c="dimmed">
        {t.richText.loading}
      </Text>
    </Group>
  );
}

const DynamicRichTextEditor = dynamic<RichTextEditorProps>(
  () => import("@/components/rich-text-editor").then((module) => module.RichTextEditor),
  { ssr: false, loading: RichTextEditorLoading },
);

export function LazyRichTextEditor(props: RichTextEditorProps) {
  return <DynamicRichTextEditor {...props} />;
}
