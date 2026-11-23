"use client";

import { Fieldset, SimpleGrid, TextInput } from "@mantine/core";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import type { RoundDates } from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundScheduleFields({
  values,
  onChange,
  disabled,
}: {
  values: RoundDates;
  onChange: (field: keyof RoundDates, value: string) => void;
  disabled?: boolean;
}) {
  const { locale } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const fields = [
    { name: "opens_at", label: c.opens, type: "datetime-local", step: 60 },
    { name: "closes_at", label: c.closes, type: "datetime-local", step: 60 },
    { name: "delivery_date", label: c.delivery, type: "date" },
  ] as const;
  return (
    <Fieldset
      disabled={disabled}
      legend={c.scheduleTitle}
      variant="unstyled"
      styles={{ legend: { fontWeight: 600 } }}
      miw={0}
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {fields.map((field) => (
          <TextInput
            key={field.name}
            label={field.label}
            type={field.type}
            step={"step" in field ? field.step : undefined}
            required
            value={values[field.name]}
            disabled={disabled}
            miw={0}
            onChange={(event) => onChange(field.name, event.currentTarget.value)}
          />
        ))}
      </SimpleGrid>
    </Fieldset>
  );
}
