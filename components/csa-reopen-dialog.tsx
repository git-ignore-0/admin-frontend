"use client";
import { useEffect, useRef, useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DataState, FormField, FormInput } from "@/components/nfv-controls";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatAdminDateTime } from "@/lib/admin-date";
import { roundDateInput, roundDateToApi, validateReopenDeadline } from "@/lib/csa-rounds";
import { csaRoundError, csaRoundsCopy } from "@/lib/csa-rounds-copy";
import { getStoreOrder } from "@/lib/store-orders";

export function CSAReopenDialog({
  selectionId,
  orderId,
  deliveryAt,
  onClose,
  onSaved,
}: {
  selectionId: string;
  orderId: string;
  deliveryAt: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const clock = useRef({ server: 0, received: 0 });
  const revision = useRef<number | null>(null);
  const [actualDelivery, setActualDelivery] = useState(deliveryAt);
  useEffect(() => {
    let cancelled = false;
    void getStoreOrder(orderId)
      .then((order) => {
        if (cancelled) return;
        const selected = order.csa?.selection;
        const can =
          order.status === "pending_review" &&
          !order.approved_at &&
          selected?.id === selectionId &&
          ["locked", "confirmed", "reselecting"].includes(selected.state);
        revision.current = selected?.revision ?? null;
        clock.current = { server: Date.parse(order.server_time), received: Date.now() };
        const now = clock.current.server;
        const delivery = order.csa?.round.delivery_at ?? deliveryAt;
        setActualDelivery(delivery);
        const deadlineExpired =
          selected?.state === "reselecting" &&
          (!selected.reopen_until || Date.parse(selected.reopen_until) <= now);
        setEligible(Boolean(can && !deadlineExpired && now < Date.parse(delivery)));
        if (!can || deadlineExpired || now >= Date.parse(delivery)) setError(c.allocated);
        if (selected?.reopen_until) setDeadline(roundDateInput(selected.reopen_until));
      })
      .catch((e) => {
        if (!cancelled) setError(requestErrorMessage(e, t));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, selectionId, deliveryAt, c.allocated, t]);
  async function confirm() {
    if (lock.current || !eligible || revision.current === null) return;
    const value = roundDateToApi(deadline);
    const now = clock.current.server + Date.now() - clock.current.received;
    if (!value || !validateReopenDeadline(value, actualDelivery, now)) {
      setError(c.deadlineError);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`admin/csa-selections/${selectionId}/reopen`, {
        method: "POST",
        body: JSON.stringify({ deadline: value, expected_revision: revision.current }),
      });
      onSaved();
    } catch (e) {
      setError(csaRoundError(e, locale, requestErrorMessage(e, t)));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ConfirmationDialog
      title={c.reopen}
      cancelLabel={c.cancel}
      confirmLabel={c.confirm}
      busyLabel={c.busy}
      busy={busy}
      confirmDisabled={loading || !eligible}
      error={error}
      onCancel={onClose}
      onConfirm={() => void confirm()}
    >
      {loading ? (
        <DataState kind="loading" title={c.loading} />
      ) : (
        <>
          <p>{c.reopenHint}</p>
          <p>
            <strong>{c.delivery}:</strong> {formatAdminDateTime(actualDelivery)}
          </p>
          <FormField label={c.deadline}>
            <FormInput
              type="datetime-local"
              required
              value={deadline}
              disabled={busy || !eligible}
              max={roundDateInput(actualDelivery)}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </FormField>
        </>
      )}
    </ConfirmationDialog>
  );
}
