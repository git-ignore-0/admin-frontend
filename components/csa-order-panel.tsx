"use client";
import { useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { CSAReopenDialog } from "@/components/csa-reopen-dialog";
import { ActionLink, Button, Section, Status } from "@/components/nfv-controls";
import { formatAdminDateTime } from "@/lib/admin-date";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";
import type { StoreOrder } from "@/lib/types";

export function CSAOrderPanel({
  order,
  disabled,
  onReload,
}: {
  order: StoreOrder;
  disabled: boolean;
  onReload: () => void;
}) {
  const { locale } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const [open, setOpen] = useState(false);
  if (!order.csa) return null;
  const { round, selection } = order.csa;
  const canReopen =
    order.status === "pending_review" &&
    !order.approved_at &&
    ["locked", "confirmed", "reselecting"].includes(selection.state);
  return (
    <Section title={`${c.title}: ${round.name}`}>
      <p>
        <Status status={selection.state} label={c.states[selection.state]} />
      </p>
      <p>
        <strong>{c.delivery}:</strong> {formatAdminDateTime(round.delivery_at)}
      </p>
      {selection.reopen_until && (
        <p>
          <strong>{c.deadline}:</strong> {formatAdminDateTime(selection.reopen_until)}
        </p>
      )}
      <div className="confirmation-actions">
        <ActionLink variant="outline" href={`/csa-rounds/${round.id}`}>
          {c.view}
        </ActionLink>
        <ActionLink variant="outline" href={`/memberships/${selection.membership_id}`}>
          {c.membership}
        </ActionLink>
        {canReopen && (
          <Button disabled={disabled} onClick={() => setOpen(true)}>
            {c.reopen}
          </Button>
        )}
      </div>
      {open && (
        <CSAReopenDialog
          selectionId={selection.id}
          orderId={order.id}
          deliveryAt={round.delivery_at}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onReload();
          }}
        />
      )}
    </Section>
  );
}
