"use client";

import { FormInput, FormField, Tabs } from "@/components/nfv-controls";
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
  onChange,
  onPresetChange,
}: Props) {
  const quantity = Number(draft.quantity);
  const total =
    Number.isSafeInteger(quantity) && quantity > 0
      ? formatStockQuantityTotal(quantity, unitSize, unitLabel)
      : `— ${unitLabel}`;

  function selectPreset(value: string) {
    const nextPreset = value as StockBatchPreset;
    onPresetChange(nextPreset);
    if (nextPreset !== "custom") {
      onChange({ ...draft, ...stockBatchRangeForPreset(nextPreset) });
    }
  }

  return (
    <div className="stock-batch-fields">
      {!startDisabled ? (
        <div className="stock-batch-presets">
          <span className="nfv-field-label">{labels.batchRange}</span>
          <Tabs
            label={labels.batchRange}
            value={preset}
            onChange={selectPreset}
            items={[
              { value: "week", label: labels.currentWeek },
              { value: "month", label: labels.currentMonth },
              { value: "custom", label: labels.customRange },
            ]}
          />
        </div>
      ) : null}
      <div className="stock-batch-date-grid">
        <FormField label={labels.startDate} error={errorMessage(errors.start_date, labels)}>
          <FormInput
            disabled={startDisabled}
            type="date"
            value={draft.start_date}
            onChange={(event) => {
              onPresetChange("custom");
              onChange({ ...draft, start_date: event.target.value });
            }}
          />
        </FormField>
        <FormField label={labels.endDate} error={errorMessage(errors.end_date, labels)}>
          <FormInput
            type="date"
            value={draft.end_date}
            onChange={(event) => {
              onPresetChange("custom");
              onChange({ ...draft, end_date: event.target.value });
            }}
          />
        </FormField>
      </div>
      <div className="stock-batch-quantity-grid">
        <div>
          <FormField label={labels.quantityUnits} error={errorMessage(errors.quantity, labels)}>
            <FormInput
              inputMode="numeric"
              min="1"
              step="1"
              type="number"
              value={draft.quantity}
              onChange={(event) => onChange({ ...draft, quantity: event.target.value })}
            />
          </FormField>
          <p className="nfv-field-hint">{labels.saleUnitHint}</p>
        </div>
        <dl className="stock-batch-totals">
          <div>
            <dt>{labels.saleUnit}</dt>
            <dd>{`${formatDecimalInput(unitSize)} ${unitLabel}`}</dd>
          </div>
          <div>
            <dt>{labels.quantityTotal}</dt>
            <dd>{total}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
