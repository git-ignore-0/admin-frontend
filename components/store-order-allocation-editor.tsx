"use client";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Button, FormField, FormInput, FormSelect, Section } from "@/components/nfv-controls";
import { StoreOrderProductSummary } from "@/components/store-order-products";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import type { StoreOrder, StoreOrderAllocationDraft } from "@/lib/types";

export function StoreOrderAllocationEditor({
  order,
  value,
  onChange,
  disabled = false,
}: {
  order: StoreOrder;
  value: StoreOrderAllocationDraft[];
  onChange: (value: StoreOrderAllocationDraft[]) => void;
  disabled?: boolean;
}) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const candidates = order.source_inventory?.candidates ?? [];

  function update(index: number, patch: Partial<StoreOrderAllocationDraft>) {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <Section
      title={c.productsSources}
      description={c.allocationHint}
      className="store-order-allocation"
    >
      <div aria-label={c.allocationTitle} role="region">
        {order.lines.map((line) => {
          const lineRows = value
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => row.line_id === line.id);
          const selected = lineRows.reduce(
            (sum, { row }) => sum + (Number.isSafeInteger(row.quantity) ? row.quantity : 0),
            0,
          );
          const missing = Math.max(0, line.quantity - selected);
          const exceeded = Math.max(0, selected - line.quantity);
          const lineCandidates = candidates.filter((candidate) => candidate.line_id === line.id);
          return (
            <div className="store-allocation-line" key={line.id}>
              <StoreOrderProductSummary line={line} />
              <div className="store-allocation-line-heading">
                <strong className={exceeded || missing ? "allocation-invalid" : ""}>
                  {(exceeded
                    ? c.exceededSummary
                    : missing
                      ? c.selectedSummary
                      : c.allocationComplete
                  )
                    .replace("{selected}", String(selected))
                    .replace("{required}", String(line.quantity))
                    .replace("{missing}", String(missing))
                    .replace("{exceeded}", String(exceeded))}
                </strong>
              </div>
              {lineRows.map(({ row, index }, position) => {
                const candidate = lineCandidates.find((item) => item.batch_id === row.batch_id);
                const duplicate = value.some(
                  (item, otherIndex) =>
                    otherIndex !== index &&
                    item.line_id === line.id &&
                    item.batch_id === row.batch_id,
                );
                const batchSelected = value.reduce(
                  (sum, item) =>
                    item.batch_id === row.batch_id && Number.isSafeInteger(item.quantity)
                      ? sum + item.quantity
                      : sum,
                  0,
                );
                const quantityInvalid = !Number.isSafeInteger(row.quantity) || row.quantity <= 0;
                const availabilityExceeded = Boolean(
                  candidate && batchSelected > candidate.available_quantity,
                );
                const sourceError = !candidate
                  ? c.sourceUnavailable
                  : duplicate
                    ? c.sourceDuplicate
                    : availabilityExceeded
                      ? c.sourceAvailabilityExceeded.replace(
                          "{count}",
                          String(candidate.available_quantity),
                        )
                      : "";
                const quantityError = quantityInvalid ? c.sourceQuantityInvalid : "";
                const sourceErrorId = `allocation-source-${line.id}-${index}`;
                const quantityErrorId = `allocation-quantity-${line.id}-${index}`;
                return (
                  <div className="store-allocation-source" key={`${line.id}-${index}`}>
                    <FormField label={c.source}>
                      <FormSelect
                        aria-describedby={sourceError ? sourceErrorId : undefined}
                        aria-invalid={sourceError ? "true" : undefined}
                        disabled={disabled}
                        value={row.batch_id}
                        onChange={(event) => update(index, { batch_id: event.target.value })}
                      >
                        {!candidate ? (
                          <option disabled value={row.batch_id}>
                            {c.sourceUnavailableOption}
                          </option>
                        ) : null}
                        {lineCandidates.map((candidate) => (
                          <option
                            disabled={value.some(
                              (item, otherIndex) =>
                                otherIndex !== index &&
                                item.line_id === line.id &&
                                item.batch_id === candidate.batch_id,
                            )}
                            key={candidate.batch_id}
                            value={candidate.batch_id}
                          >
                            {candidate.farm_name} · {candidate.start_date}–{candidate.end_date} ·{" "}
                            {c.available.replace("{count}", String(candidate.available_quantity))}
                          </option>
                        ))}
                      </FormSelect>
                      {sourceError ? (
                        <small className="nfv-field-error" id={sourceErrorId}>
                          {sourceError}
                        </small>
                      ) : null}
                    </FormField>
                    <FormField label={c.sourceQuantity.replace("{count}", String(position + 1))}>
                      <FormInput
                        aria-describedby={quantityError ? quantityErrorId : undefined}
                        aria-invalid={quantityError ? "true" : undefined}
                        aria-label={c.sourceQuantity.replace("{count}", String(position + 1))}
                        disabled={disabled}
                        min={1}
                        step={1}
                        type="number"
                        value={row.quantity || ""}
                        onChange={(event) =>
                          update(index, { quantity: Number(event.target.value) })
                        }
                      />
                      {quantityError ? (
                        <small className="nfv-field-error" id={quantityErrorId}>
                          {quantityError}
                        </small>
                      ) : null}
                    </FormField>
                    <Button
                      disabled={disabled}
                      small
                      variant="plain"
                      onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      {c.removeSource}
                    </Button>
                  </div>
                );
              })}
              {!lineCandidates.length && !lineRows.length ? (
                <p className="nfv-field-error">{c.noSources}</p>
              ) : null}
              {lineCandidates.some(
                (candidate) => !lineRows.some(({ row }) => row.batch_id === candidate.batch_id),
              ) ? (
                <Button
                  disabled={disabled}
                  small
                  variant="outline"
                  onClick={() => {
                    const candidate = lineCandidates.find(
                      (item) => !lineRows.some(({ row }) => row.batch_id === item.batch_id),
                    );
                    if (candidate)
                      onChange([
                        ...value,
                        { line_id: line.id, batch_id: candidate.batch_id, quantity: 1 },
                      ]);
                  }}
                >
                  {c.addSource}
                </Button>
              ) : null}
              {order.source_inventory?.product_reservations
                .filter((item) => item.product_id === line.product_id)
                .map((reservation) => (
                  <p className="store-order-reservation" key={reservation.product_id}>
                    <strong>{c.reservations}:</strong>{" "}
                    {c.reservationSummary
                      .replace("{thisOrder}", String(reservation.this_order_quantity))
                      .replace("{others}", String(reservation.other_orders_quantity))}
                  </p>
                ))}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
