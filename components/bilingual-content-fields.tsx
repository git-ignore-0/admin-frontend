"use client";

import { useState } from "react";
import { Badge, Paper, Stack, Tabs, TextInput, Textarea, Title } from "@mantine/core";

import type { AdminLocale } from "@/lib/admin-i18n";

export type BilingualContentValue = Record<AdminLocale, { name: string; description: string }>;

export const emptyBilingualContent = (): BilingualContentValue => ({
  vi: { name: "", description: "" },
  en: { name: "", description: "" },
});

export function BilingualContentFields({
  activeLocale,
  busy,
  completionLabels,
  defaultLocale,
  descriptionLabel,
  isLocaleComplete,
  languageLabels,
  nameLabel,
  onChange,
  onLocaleChange,
  renderAfterName,
  renderAfterDescription,
  requireNames = true,
  descriptionMaxLength = 800,
  title,
  value,
}: {
  activeLocale?: AdminLocale;
  busy: boolean;
  completionLabels: { complete: string; incomplete: string };
  defaultLocale: AdminLocale;
  descriptionLabel: string;
  isLocaleComplete?: (locale: AdminLocale) => boolean;
  languageLabels: Record<AdminLocale, string>;
  nameLabel: string;
  onChange: (value: BilingualContentValue) => void;
  onLocaleChange?: (locale: AdminLocale) => void;
  renderAfterName?: (locale: AdminLocale) => React.ReactNode;
  renderAfterDescription?: (locale: AdminLocale) => React.ReactNode;
  requireNames?: boolean;
  descriptionMaxLength?: number;
  title: string;
  value: BilingualContentValue;
}) {
  const [internalLocale, setInternalLocale] = useState<AdminLocale>(defaultLocale);
  const currentLocale = activeLocale ?? internalLocale;
  const locales = ["vi", "en"] as const;

  function selectLocale(locale: AdminLocale) {
    setInternalLocale(locale);
    onLocaleChange?.(locale);
  }

  return (
    <Paper component="section" withBorder p="md">
      <Stack gap="md">
        <Title order={2}>{title}</Title>
        <Tabs
          value={currentLocale}
          onChange={(locale) => {
            if (!busy && (locale === "vi" || locale === "en")) selectLocale(locale);
          }}
          keepMounted={false}
        >
          <Tabs.List aria-label={title} mb="md">
            {locales.map((locale) => {
              const complete = isLocaleComplete
                ? isLocaleComplete(locale)
                : Boolean(value[locale].name.trim());
              return (
                <Tabs.Tab
                  key={locale}
                  value={locale}
                  disabled={busy}
                  rightSection={
                    <Badge size="xs" variant="light" color={complete ? "green" : "gray"}>
                      {complete ? completionLabels.complete : completionLabels.incomplete}
                    </Badge>
                  }
                >
                  {languageLabels[locale]}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
          {locales.map((locale) => (
            <Tabs.Panel key={locale} value={locale}>
              <Stack gap="md">
                <TextInput
                  data-bilingual-name
                  label={nameLabel}
                  required={requireNames}
                  disabled={busy}
                  maxLength={200}
                  value={value[locale].name}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      [locale]: { ...value[locale], name: event.currentTarget.value },
                    })
                  }
                />
                {renderAfterName?.(locale)}
                <Textarea
                  label={descriptionLabel}
                  disabled={busy}
                  maxLength={descriptionMaxLength}
                  minRows={3}
                  autosize
                  value={value[locale].description}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      [locale]: { ...value[locale], description: event.currentTarget.value },
                    })
                  }
                />
                {renderAfterDescription?.(locale)}
              </Stack>
            </Tabs.Panel>
          ))}
        </Tabs>
      </Stack>
    </Paper>
  );
}
