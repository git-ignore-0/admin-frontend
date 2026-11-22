"use client";
import { useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { CSAReopenDialog } from "@/components/csa-reopen-dialog";
import { ActionLink, Button, Section, Status } from "@/components/nfv-controls";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
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
    <Section
      title={c.title}
      description={round.name}
      actions={
        <Status domain="csa-selection" status={selection.state} label={c.states[selection.state]} />
      }
      className="store-order-csa-panel"
    >
      <dl className="store-order-csa-meta">
        <div>
          <dt>{c.delivery}</dt>
          <dd>
            <time dateTime={round.delivery_date}>{formatAdminDate(round.delivery_date)}</time>
          </dd>
        </div>
        {selection.reopen_until && (
          <div>
            <dt>{c.deadline}</dt>
            <dd>
              <time dateTime={selection.reopen_until}>
                {formatAdminDateTime(selection.reopen_until)}
              </time>
            </dd>
          </div>
        )}
      </dl>
      <div className="store-order-csa-actions">
        <ActionLink small variant="outline" href={`/csa-rounds/${round.id}`}>
          {c.view}
        </ActionLink>
        <ActionLink small variant="outline" href={`/memberships/${selection.membership_id}`}>
          {c.membership}
        </ActionLink>
        {canReopen && (
          <Button small disabled={disabled} onClick={() => setOpen(true)}>
            {c.reopen}
          </Button>
        )}
      </div>
      {open && (
        <CSAReopenDialog
          selectionId={selection.id}
          orderId={order.id}
          deliveryDate={round.delivery_date}
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
