"use client";

import { Box, Paper, SegmentedControl, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import {
  formatStockQuantityTotal,
  stockBatchRangeForPreset,
  type StockBatchDraft,
  type StockBatchFieldErrors,
  type StockBatchPreset,
} from "@/lib/farm-stock";
import { formatDecimalInput } from "@/lib/numeric-input";

type Labels = {
  batchRange: string;
  currentWeek: string;
  currentMonth: string;
  customRange: string;
  startDate: string;
  endDate: string;
  quantityUnits: string;
  quantityTotal: string;
  saleUnit: string;
  saleUnitHint: string;
  requiredField: string;
  invalidDateOrder: string;
  expiredDate: string;
  positiveInteger: string;
  integerRange: string;
};

type Props = {
  draft: StockBatchDraft;
  errors: StockBatchFieldErrors;
  labels: Labels;
  preset: StockBatchPreset;
  unitSize: string;
  unitLabel: string;
  startDisabled?: boolean;
  disabled?: boolean;
  limits?: { start: string; end: string; quantity: number };
  onChange: (draft: StockBatchDraft) => void;
  onPresetChange: (preset: StockBatchPreset) => void;
};

function errorMessage(error: StockBatchFieldErrors[keyof StockBatchFieldErrors], labels: Labels) {
  if (error === "required") return labels.requiredField;
  if (error === "date_order") return labels.invalidDateOrder;
  if (error === "expired") return labels.expiredDate;
  if (error === "integer_range") return labels.integerRange;
  if (error === "positive_integer") return labels.positiveInteger;
  return undefined;
}

export function StockBatchFields({
  draft,
  errors,
  labels,
  preset,
  unitSize,
  unitLabel,
  startDisabled = false,
  disabled = false,
  limits,
  onChange,
  onPresetChange,
}: Props) {
  const quantity = Number(draft.quantity);
  const total =
    Number.isSafeInteger(quantity) && quantity > 0
      ? formatStockQuantityTotal(quantity, unitSize, unitLabel)
      : `— ${unitLabel}`;

  function selectPreset(value: string) {
    if (disabled) return;
    const nextPreset = value as StockBatchPreset;
    onPresetChange(nextPreset);
    if (nextPreset !== "custom") {
      onChange({ ...draft, ...stockBatchRangeForPreset(nextPreset) });
    }
  }

  return (
    <Stack gap="md">
      {!startDisabled && !limits && (
        <Stack gap="xs" align="flex-start">
          <Text size="sm" fw={600}>
            {labels.batchRange}
          </Text>
          <SegmentedControl
            aria-label={labels.batchRange}
            value={preset}
            onChange={selectPreset}
            disabled={disabled}
            maw="100%"
            styles={{ root: { flexWrap: "wrap" } }}
            data={[
              { value: "week", label: labels.currentWeek },
              { value: "month", label: labels.currentMonth },
              { value: "custom", label: labels.customRange },
            ]}
          />
        </Stack>
      )}
      <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }} spacing="sm">
        <TextInput
          label={labels.startDate}
          error={errorMessage(errors.start_date, labels)}
          disabled={disabled || startDisabled}
          min={limits?.start}
          type="date"
          value={draft.start_date}
          onChange={(event) => {
            onPresetChange("custom");
            onChange({ ...draft, start_date: event.currentTarget.value });
          }}
        />
        <TextInput
          label={labels.endDate}
          error={errorMessage(errors.end_date, labels)}
          type="date"
          value={draft.end_date}
          disabled={disabled}
          max={limits?.end}
          onChange={(event) => {
            onPresetChange("custom");
            onChange({ ...draft, end_date: event.currentTarget.value });
          }}
        />
      </SimpleGrid>
      <SimpleGrid type="container" cols={{ base: 1, "34rem": 2 }} spacing="sm">
        <TextInput
          label={labels.quantityUnits}
          error={errorMessage(errors.quantity, labels)}
          description={labels.saleUnitHint}
          inputWrapperOrder={["label", "input", "description", "error"]}
          inputMode="numeric"
          disabled={disabled}
          min="1"
          max={limits?.quantity}
          step="1"
          type="number"
          value={draft.quantity}
          onChange={(event) => onChange({ ...draft, quantity: event.currentTarget.value })}
        />
        <Paper p="sm" bg="var(--surface-subtle)">
          <RecordDetailFields>
            <RecordDetailField label={labels.saleUnit}>
              <Box fw={600}>
                {formatDecimalInput(unitSize)} {unitLabel}
              </Box>
            </RecordDetailField>
            <RecordDetailField label={labels.quantityTotal}>
              <Box fw={600}>{total}</Box>
            </RecordDetailField>
          </RecordDetailFields>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
