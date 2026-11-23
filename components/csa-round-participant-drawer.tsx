"use client";

import { Button, Drawer, Group, Stack, Text, getDefaultZIndex } from "@mantine/core";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { CSASelectionHistory } from "@/components/csa-selection-history";
import { DataState, Section, Status } from "@/components/nfv-controls";
import { recordDetailDrawer } from "@/components/record-detail-drawer";
import { formatAdminDateTime } from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import {
  csaOrderReopenUntil,
  formatCsaQuantity,
  type CSARound,
  type CSASelection,
} from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";
import { getStoreOrder } from "@/lib/store-orders";
import type { AdminMembership } from "@/lib/types";

export function CSAParticipantDeadline({ person }: { person: CSASelection }) {
  const { locale } = useAdminI18n();
  if (person.state !== "reselecting" || !person.reopen_until) return null;

  return (
    <Text {...recordDetailDrawer.metadata}>
      {csaRoundsCopy(locale).deadline}{" "}
      <time dateTime={person.reopen_until}>{formatAdminDateTime(person.reopen_until)}</time>
    </Text>
  );
}

export function CSARoundParticipantDrawer({
  person,
  round,
  disabled,
  refreshKey,
  reopenOpen,
  onClose,
  onReopen,
}: {
  person: CSASelection;
  round: CSARound;
  disabled: boolean;
  refreshKey: number;
  reopenOpen: boolean;
  onClose: () => void;
  onReopen: (person: CSASelection) => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const [restoreActionFocus, setRestoreActionFocus] = useState(false);
  const canCheckReopen =
    round.status !== "cancelled" && ["locked", "confirmed", "reselecting"].includes(person.state);

  return (
    <Drawer.Root
      {...recordDetailDrawer.root}
      opened
      onClose={() => {
        if (!reopenOpen) onClose();
      }}
      zIndex={getDefaultZIndex("modal") - 1}
      returnFocus={false}
      trapFocus={!reopenOpen}
      closeOnEscape={!reopenOpen}
      closeOnClickOutside={!reopenOpen}
    >
      <Drawer.Overlay />
      <Drawer.Content inert={reopenOpen || undefined} aria-hidden={reopenOpen || undefined}>
        <Drawer.Header>
          <Stack {...recordDetailDrawer.identity}>
            <Group align="baseline" gap="xs">
              <Drawer.Title style={{ overflowWrap: "anywhere" }}>
                {person.customer_name || c.customer}
              </Drawer.Title>
              <Status domain="csa-selection" status={person.state} label={c.states[person.state]} />
            </Group>
            <CSAParticipantDeadline person={person} />
          </Stack>
          <Drawer.CloseButton
            {...recordDetailDrawer.closeButton}
            aria-label={t.common.close}
            data-autofocus={!restoreActionFocus || disabled || undefined}
            disabled={reopenOpen}
          />
        </Drawer.Header>
        <Drawer.Body>
          <Stack gap="md">
            <Section title={c.selectedProducts}>
              {person.lines.length > 0 ? (
                <Stack component="ul" gap="xs" m={0} p={0} style={{ listStyle: "none" }}>
                  {person.lines.map((line) => (
                    <Group
                      component="li"
                      key={line.product_id}
                      justify="space-between"
                      align="flex-start"
                      wrap="nowrap"
                      gap="sm"
                    >
                      <Text component="span" size="sm" style={{ overflowWrap: "anywhere" }}>
                        {line.name}
                      </Text>
                      <Text component="span" size="sm" ta="right">
                        {formatCsaQuantity(line, locale)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <DataState kind="empty" compact title={c.emptyLines} />
              )}
            </Section>
            <CSASelectionHistory
              selectionId={person.id}
              refreshToken={`${person.revision}:${person.state}`}
            />
          </Stack>
        </Drawer.Body>
        {person.order_id && (
          <Group component="footer" {...recordDetailDrawer.footer}>
            <Button
              component={AdminNavigationLink}
              variant="default"
              href={`/store-orders/${encodeURIComponent(person.order_id)}`}
            >
              {c.order}
            </Button>
            {canCheckReopen && (
              <ReopenSelectionAction
                key={`${person.id}:${person.revision}:${person.state}:${refreshKey}`}
                person={person}
                orderId={person.order_id}
                deliveryDate={round.delivery_date}
                disabled={disabled}
                autoFocus={restoreActionFocus}
                onReopen={(selection) => {
                  setRestoreActionFocus(true);
                  onReopen(selection);
                }}
              />
            )}
          </Group>
        )}
      </Drawer.Content>
    </Drawer.Root>
  );
}

function ReopenSelectionAction({
  person,
  orderId,
  deliveryDate,
  disabled,
  onReopen,
  autoFocus,
}: {
  person: CSASelection;
  orderId: string;
  deliveryDate: string;
  disabled: boolean;
  onReopen: (person: CSASelection) => void;
  autoFocus: boolean;
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const { id, membership_id: membershipId } = person;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setExpiresAt(null);
    setError(null);
    async function check() {
      const order = await getStoreOrder(orderId, signal);
      if (signal.aborted) return;
      const until = csaOrderReopenUntil(order, id, deliveryDate);
      if (until === null || order.csa?.selection.membership_id !== membershipId) return;
      const expiry = performance.now() + until - Date.parse(order.server_time);
      const membership = await api<AdminMembership>(
        `admin/memberships/${encodeURIComponent(membershipId)}?locale=${locale}`,
        { signal },
      );
      if (
        !signal.aborted &&
        membership.id === membershipId &&
        ["active", "scheduled", "frozen", "ended"].includes(membership.status) &&
        performance.now() < expiry
      ) {
        setExpiresAt(expiry);
      }
    }
    void check().catch((caught: unknown) => {
      if (!signal.aborted) setError(caught);
    });
    return () => controller.abort();
  }, [deliveryDate, id, locale, membershipId, orderId, retry]);

  useEffect(() => {
    if (expiresAt === null) return;
    const delay = Math.max(0, expiresAt - performance.now());
    const timer = window.setTimeout(() => setExpiresAt(null), Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  if (error)
    return (
      <DataState
        kind="error"
        compact
        title={requestErrorMessage(error, t)}
        action={{ label: t.common.retry, onClick: () => setRetry((value) => value + 1) }}
      />
    );
  if (expiresAt === null) return null;
  return (
    <Button
      data-autofocus={(autoFocus && !disabled) || undefined}
      disabled={disabled}
      onClick={() => {
        if (performance.now() < expiresAt) onReopen(person);
      }}
    >
      {c.reopen}
    </Button>
  );
}
