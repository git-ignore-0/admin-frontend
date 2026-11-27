"use client";

import { ActionIcon, Button, Group, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useLayoutEffect, useRef } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { FormSelect } from "@/components/nfv-controls";
import {
  MAX_STORE_QUANTITY,
  parseStoreQuantity,
  storeQuantityDisplayValue,
  storeQuantityInputValue,
  storeQuantityPasteReplacement,
  type inspectStoreAllocations,
  type StoreOrderAllocationInput,
} from "@/lib/store-orders";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import type { StoreOrder, StoreOrderLine } from "@/lib/types";

export function StoreOrderAllocationEditor({
  order,
  line,
  productLabelId,
  value,
  onChange,
  disabled,
  review,
}: {
  order: StoreOrder;
  line: StoreOrderLine;
  productLabelId: string;
  value: StoreOrderAllocationInput[];
  onChange: (value: StoreOrderAllocationInput[]) => void;
  disabled: boolean;
  review: ReturnType<typeof inspectStoreAllocations>;
}) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const quantityInputs = useRef(new Map<string, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLParagraphElement>(null);
  const pendingFocus = useRef<{ key: string | undefined } | null>(null);
  const lineRows = value.filter((row) => row.line_id === line.id);
  const lineCandidates =
    order.source_inventory?.candidates.filter((candidate) => candidate.line_id === line.id) ?? [];
  const candidateToAdd = lineCandidates.find(
    (candidate) => !lineRows.some((row) => row.batch_id === candidate.batch_id),
  );
  const selected = review.selectedByLine.get(line.id) ?? 0;
  const missing = Math.max(0, line.quantity - selected);
  const exceeded = Math.max(0, selected - line.quantity);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const field = target.key ? quantityInputs.current.get(target.key) : undefined;
    (field ?? addButton.current ?? heading.current)?.focus();
  }, [value]);

  function update(
    key: string,
    patch: Partial<Pick<StoreOrderAllocationInput, "batch_id" | "quantity">>,
  ) {
    onChange(value.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <Stack component="section" aria-labelledby={productLabelId} gap="sm">
      <Text ref={heading} tabIndex={-1} fw={600} c={missing || exceeded ? "danger" : undefined}>
        {(exceeded ? c.exceededSummary : missing ? c.selectedSummary : c.allocationComplete)
          .replace("{selected}", String(selected))
          .replace("{required}", String(line.quantity))
          .replace("{missing}", String(missing))
          .replace("{exceeded}", String(exceeded))}
      </Text>
      {lineRows.map((row, position) => {
        const candidate = lineCandidates.find((item) => item.batch_id === row.batch_id);
        const sourceIssue = review.sourceError(row);
        const sourceError =
          sourceIssue === "source_invalid"
            ? c.sourceUnavailable
            : sourceIssue === "duplicate"
              ? c.sourceDuplicate
              : sourceIssue === "batch_exceeded" && candidate
                ? c.sourceAvailabilityExceeded.replace(
                    "{count}",
                    String(candidate.available_quantity),
                  )
                : undefined;
        const quantityError =
          parseStoreQuantity(row.quantity, 1) !== null
            ? undefined
            : row.quantity &&
                !/[^0-9]/u.test(row.quantity) &&
                parseStoreQuantity(row.quantity, 0) === null
              ? c.sourceQuantityOutOfRange.replace("{max}", String(MAX_STORE_QUANTITY))
              : c.sourceQuantityInvalid;
        const options = [
          ...(!candidate
            ? [{ value: row.batch_id, label: c.sourceUnavailableOption, disabled: true }]
            : []),
          ...lineCandidates.map((option) => ({
            value: option.batch_id,
            label: `${option.farm_name} · ${option.start_date}–${option.end_date} · ${c.available.replace("{count}", String(option.available_quantity))}`,
            disabled: lineRows.some(
              (item) => item.key !== row.key && item.batch_id === option.batch_id,
            ),
          })),
        ];
        return (
          <Group key={row.key} gap="sm" wrap="nowrap" align="flex-start">
            <FormSelect
              label={c.source}
              title={options.find((option) => option.value === row.batch_id)?.label}
              disabled={disabled}
              value={row.batch_id}
              onChange={(batchId) => {
                if (batchId !== null) update(row.key, { batch_id: batchId });
              }}
              data={options}
              error={sourceError}
              miw={0}
              flex={1}
              comboboxProps={{ withinPortal: true }}
            />
            <TextInput
              ref={(node) => {
                if (node) quantityInputs.current.set(row.key, node);
                else quantityInputs.current.delete(row.key);
              }}
              label={c.sourceQuantity.replace("{count}", String(position + 1))}
              disabled={disabled}
              type="text"
              inputMode="numeric"
              w="8rem"
              value={storeQuantityDisplayValue(row.quantity)}
              error={quantityError}
              onInput={(event) =>
                update(row.key, {
                  quantity: storeQuantityInputValue(event.currentTarget, event.nativeEvent),
                })
              }
              onChange={(event) => {
                if (event.nativeEvent.type !== "input") {
                  update(row.key, {
                    quantity: storeQuantityInputValue(event.currentTarget, event.nativeEvent),
                  });
                }
              }}
              onKeyDown={(event) => {
                if (
                  row.quantity &&
                  !event.currentTarget.value &&
                  !event.nativeEvent.isComposing &&
                  (event.key === "Backspace" || event.key === "Delete")
                ) {
                  update(row.key, { quantity: "" });
                }
              }}
              onPaste={(event) => {
                const replacement = storeQuantityPasteReplacement(
                  event.currentTarget,
                  event.clipboardData.getData("text/plain"),
                  row.quantity,
                );
                if (replacement === null) return;
                event.preventDefault();
                update(row.key, { quantity: replacement });
              }}
            />
            <Tooltip label={c.removeSource}>
              <ActionIcon
                aria-label={c.removeSource}
                disabled={disabled}
                variant="subtle"
                color="danger"
                mt="lg"
                onClick={() => {
                  pendingFocus.current = {
                    key: (lineRows[position + 1] ?? lineRows[position - 1])?.key,
                  };
                  onChange(value.filter((item) => item.key !== row.key));
                }}
              >
                <IconTrash size={16} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
        );
      })}
      {!lineCandidates.length && !lineRows.length && (
        <Text size="sm" c="danger">
          {c.noSources}
        </Text>
      )}
      {candidateToAdd && (
        <Button
          ref={addButton}
          variant="default"
          size="xs"
          disabled={disabled}
          w="fit-content"
          onClick={() => {
            const key = crypto.randomUUID();
            pendingFocus.current = { key };
            onChange([
              ...value,
              { key, line_id: line.id, batch_id: candidateToAdd.batch_id, quantity: "1" },
            ]);
          }}
        >
          {c.addSource}
        </Button>
      )}
      {order.source_inventory?.product_reservations
        .filter((item) => item.product_id === line.product_id)
        .map((reservation) => (
          <Text size="sm" c="dimmed" key={reservation.product_id}>
            <Text component="span" inherit fw={600}>
              {c.reservations}
            </Text>{" "}
            <Text component="span" inherit>
              {c.reservationSummary
                .replace("{thisOrder}", String(reservation.this_order_quantity))
                .replace("{others}", String(reservation.other_orders_quantity))}
            </Text>
          </Text>
        ))}
    </Stack>
  );
}
