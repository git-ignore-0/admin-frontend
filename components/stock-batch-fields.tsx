"use client";

import { SegmentedControl, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useId } from "react";
import { AdminDateInput } from "@/components/admin-date-input";
import { FormField } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import {
  formatStockQuantityTotal,
  stockBatchDateDraft,
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
  openStartDatePicker: string;
  openEndDatePicker: string;
  quantityUnits: string;
  quantityTotal: string;
  saleUnit: string;
  saleUnitHint: string;
  requiredField: string;
  invalidDate: string;
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
  if (error === "invalid_date") return labels.invalidDate;
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
  const id = useId();
  const quantity = Number(draft.quantity);
  const total =
    Number.isSafeInteger(quantity) && quantity > 0
      ? formatStockQuantityTotal(quantity, unitSize, unitLabel)
      : "—";

  function selectPreset(value: string) {
    if (disabled) return;
    const nextPreset = value as StockBatchPreset;
    onPresetChange(nextPreset);
    if (nextPreset !== "custom") {
      onChange({ ...draft, ...stockBatchDateDraft(stockBatchRangeForPreset(nextPreset)) });
    }
  }

  function changeDate(field: "start_date" | "end_date", value: string) {
    onPresetChange("custom");
    onChange({ ...draft, [field]: value });
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
        <FormField label={labels.startDate} error={errorMessage(errors.start_date, labels)}>
          <AdminDateInput
            id={`${id}-start`}
            pickerLabel={labels.openStartDatePicker}
            disabled={disabled || startDisabled}
            min={limits?.start}
            value={draft.start_date}
            onValueChange={(value) => changeDate("start_date", value)}
          />
        </FormField>
        <FormField label={labels.endDate} error={errorMessage(errors.end_date, labels)}>
          <AdminDateInput
            id={`${id}-end`}
            pickerLabel={labels.openEndDatePicker}
            disabled={disabled}
            max={limits?.end}
            value={draft.end_date}
            onValueChange={(value) => changeDate("end_date", value)}
          />
        </FormField>
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
        <RecordDetailFields>
          <RecordDetailField label={labels.saleUnit}>
            <Text fw={600}>
              {formatDecimalInput(unitSize)} {unitLabel}
            </Text>
          </RecordDetailField>
          <RecordDetailField label={labels.quantityTotal}>
            <Text fw={600}>{total}</Text>
          </RecordDetailField>
        </RecordDetailFields>
      </SimpleGrid>
    </Stack>
  );
}
