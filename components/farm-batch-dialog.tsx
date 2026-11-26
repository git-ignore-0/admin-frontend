"use client";

import { Box, Stack } from "@mantine/core";
import { useId, useState, type ReactNode, type RefObject } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { StockBatchFields } from "@/components/stock-batch-fields";
import { adminDateInputToIso } from "@/lib/admin-date";
import {
  stockBatchDateDraft,
  stockBatchRangeForPreset,
  validateStockBatchInput,
  type StockBatchFieldErrors,
  type StockBatchPreset,
} from "@/lib/farm-stock";
import { farmsCopy } from "@/lib/farms-copy";
import type { AvailableFarmProduct, FarmStockBatch, StockBatchInput } from "@/lib/types";

/** One draft for the first batch, a new batch, or a batch edit. */
export function FarmBatchDialog({
  title,
  visible = true,
  initialBatch,
  confirmLabel,
  product,
  batch,
  restrictIncrease,
  busy,
  blocked,
  error,
  children,
  feedback,
  fallbackFocusRef,
  onCancel,
  onSubmit,
}: {
  title: string;
  visible?: boolean;
  initialBatch?: StockBatchInput;
  confirmLabel: string;
  product?: Pick<AvailableFarmProduct, "unit_size" | "unit_label_vi" | "unit_label_en">;
  batch?: FarmStockBatch;
  restrictIncrease?: boolean;
  busy: boolean;
  blocked: boolean;
  error?: string;
  children?: ReactNode;
  feedback?: ReactNode;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onSubmit: (values: StockBatchInput) => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const form = useId();
  const [preset, setPreset] = useState<StockBatchPreset>(batch || initialBatch ? "custom" : "week");
  const [draft, setDraft] = useState(() => ({
    ...stockBatchDateDraft(batch ?? initialBatch ?? stockBatchRangeForPreset("week")),
    quantity: String(batch?.quantity_units ?? initialBatch?.quantity_units ?? ""),
  }));
  const [errors, setErrors] = useState<StockBatchFieldErrors>({});
  const limits =
    batch && restrictIncrease
      ? { start: batch.start_date, end: batch.end_date, quantity: batch.quantity_units }
      : undefined;
  const start = limits && adminDateInputToIso(draft.start_date);
  const end = limits && adminDateInputToIso(draft.end_date);
  const exceedsLimits = Boolean(
    limits &&
    ((start && start < limits.start) ||
      (end && end > limits.end) ||
      Number(draft.quantity) > limits.quantity),
  );
  const disabled = busy || blocked || !product;

  if (!visible) return null;
  return (
    <ConfirmationDialog
      title={title}
      size="xl"
      busy={busy}
      busyLabel={c.saving}
      cancelLabel={c.cancel}
      confirmLabel={confirmLabel}
      confirmDisabled={disabled || exceedsLimits}
      error={error || (exceedsLimits ? t.storeCatalog.batchIncreaseBlocked : undefined)}
      formId={form}
      onCancel={onCancel}
      fallbackFocusRef={fallbackFocusRef}
    >
      {children}
      <Box
        component="form"
        id={form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || exceedsLimits) return;
          const result = validateStockBatchInput(draft);
          if (batch && result.value && result.value.quantity_units < batch.net_sold_quantity) {
            setErrors({ quantity: "stock_sold" });
            return;
          }
          setErrors(result.errors);
          if (result.value) onSubmit(result.value);
        }}
      >
        {product && (
          <Stack>
            <StockBatchFields
              draft={draft}
              errors={errors}
              labels={c}
              preset={preset}
              unitSize={product.unit_size}
              unitLabel={locale === "vi" ? product.unit_label_vi : product.unit_label_en}
              startDisabled={batch?.status === "active"}
              disabled={disabled}
              limits={limits}
              onChange={(value) => {
                setDraft(value);
                setErrors({});
              }}
              onPresetChange={setPreset}
            />
          </Stack>
        )}
      </Box>
      {feedback}
    </ConfirmationDialog>
  );
}
