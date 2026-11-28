"use client";

import { Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useId, useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { CSAReopenDialog } from "@/components/csa-reopen-dialog";
import { Status } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { formatAdminDateTime } from "@/lib/admin-date";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";
import { formatStoreDeliveryDate } from "@/lib/store-orders";
import type { StoreOrder } from "@/lib/types";

export function CSAOrderPanel({
  order,
  disabled,
  onReload,
  onAccessDenied,
}: {
  order: StoreOrder;
  disabled: boolean;
  onReload: () => void;
  onAccessDenied: (error: unknown) => void;
}) {
  const { locale } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  if (!order.csa) return null;
  const { round, selection } = order.csa;
  const canReopen =
    order.status === "pending_review" &&
    !order.approved_at &&
    ["locked", "confirmed", "reselecting"].includes(selection.state);

  return (
    <Paper component="section" aria-labelledby={headingId} p="md" miw={0}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" gap="sm">
          <Stack gap="xs" miw={0}>
            <Title id={headingId} order={2} size="md" fw={600}>
              {c.title}
            </Title>
            <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
              {round.name}
            </Text>
          </Stack>
          <Status
            domain="csa-selection"
            status={selection.state}
            label={c.states[selection.state]}
          />
        </Group>
        <RecordDetailFields>
          <RecordDetailField label={c.delivery}>
            <time dateTime={round.delivery_date}>{formatStoreDeliveryDate(order)}</time>
          </RecordDetailField>
          {selection.reopen_until && (
            <RecordDetailField label={c.deadline}>
              <time dateTime={selection.reopen_until}>
                {formatAdminDateTime(selection.reopen_until)}
              </time>
            </RecordDetailField>
          )}
        </RecordDetailFields>
        <Group gap="sm">
          <Button
            component={AdminNavigationLink}
            variant="default"
            href={`/csa-rounds/${round.id}`}
            prefetch={false}
          >
            {c.view}
          </Button>
          <Button
            component={AdminNavigationLink}
            variant="default"
            href={`/memberships/${selection.membership_id}`}
            prefetch={false}
          >
            {c.membership}
          </Button>
          {canReopen && (
            <Button type="button" disabled={disabled} onClick={() => setOpen(true)}>
              {c.reopen}
            </Button>
          )}
        </Group>
      </Stack>
      {open && (
        <CSAReopenDialog
          selectionId={selection.id}
          orderId={order.id}
          deliveryDate={round.delivery_date}
          onClose={() => setOpen(false)}
          onAccessDenied={onAccessDenied}
          onSaved={() => {
            setOpen(false);
            onReload();
          }}
        />
      )}
    </Paper>
  );
}
