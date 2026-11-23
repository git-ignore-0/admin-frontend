"use client";
import { useEffect, useRef, useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DataState, FormField, FormInput } from "@/components/nfv-controls";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatAdminDate } from "@/lib/admin-date";
import {
  csaDeadlineInputMax,
  csaOrderReopenUntil,
  roundDateInput,
  roundDateToApi,
  validateReopenDeadline,
} from "@/lib/csa-rounds";
import { csaRoundError, csaRoundsCopy } from "@/lib/csa-rounds-copy";
import { getStoreOrder } from "@/lib/store-orders";

export function CSAReopenDialog({
  selectionId,
  orderId,
  deliveryDate,
  onClose,
  onSaved,
}: {
  selectionId: string;
  orderId: string;
  deliveryDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [eligibleUntil, setEligibleUntil] = useState<number | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const clock = useRef({ server: 0, received: 0 });
  const revision = useRef<number | null>(null);
  const [actualDelivery, setActualDelivery] = useState(deliveryDate);
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setLoadError(null);
    setError(null);
    setEligibleUntil(null);
    setReloadRequired(false);
    setDeadline("");
    revision.current = null;
    void getStoreOrder(orderId)
      .then((order) => {
        if (current !== generation.current) return;
        const selected = order.csa?.selection;
        revision.current = selected?.revision ?? null;
        clock.current = { server: Date.parse(order.server_time), received: performance.now() };
        const delivery = order.csa?.round.delivery_date ?? deliveryDate;
        setActualDelivery(delivery);
        const until = csaOrderReopenUntil(order, selectionId, delivery);
        setEligibleUntil(until);
        if (until === null) setError(new Error("csa_order_already_allocated"));
        if (selected?.reopen_until) setDeadline(roundDateInput(selected.reopen_until));
      })
      .catch((e) => {
        if (current === generation.current) setLoadError(e);
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current += 1;
    };
  }, [orderId, selectionId, deliveryDate, reload]);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  const now = clock.current.server + Math.max(0, performance.now() - clock.current.received);
  const eligible = !reloadRequired && eligibleUntil !== null && now < eligibleUntil;
  const value = roundDateToApi(deadline);
  const valid = Boolean(value && validateReopenDeadline(value, actualDelivery, now));
  async function confirm() {
    if (lock.current || !eligible || revision.current === null || !valid) return;
    const currentNow =
      clock.current.server + Math.max(0, performance.now() - clock.current.received);
    if (eligibleUntil === null || currentNow >= eligibleUntil) {
      setReloadRequired(true);
      setError(new Error("csa_selection_locked"));
      return;
    }
    if (!value || !validateReopenDeadline(value, actualDelivery, currentNow)) {
      setError(new Error("csa_reselection_deadline_invalid"));
      return;
    }
    const current = generation.current;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await api(`admin/csa-selections/${selectionId}/reopen`, {
        method: "POST",
        body: JSON.stringify({ deadline: value, expected_revision: revision.current }),
      });
      if (current === generation.current) savedCallback.current();
    } catch (e) {
      if (current === generation.current) {
        setError(e);
        if (
          (e as { status?: number }).status === 409 &&
          (!(e instanceof Error) || e.message !== "csa_reselection_deadline_invalid")
        )
          setReloadRequired(true);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <ConfirmationDialog
      title={c.reopen}
      cancelLabel={c.cancel}
      confirmLabel={c.confirm}
      busyLabel={c.busy}
      busy={busy}
      confirmDisabled={loading || !eligible || !valid}
      error={
        loadError
          ? csaRoundError(loadError, locale, requestErrorMessage(loadError, t))
          : error
            ? csaRoundError(error, locale, requestErrorMessage(error, t))
            : ""
      }
      alternateLabel={loadError || reloadRequired ? c.refresh : undefined}
      onAlternate={loadError || reloadRequired ? () => setReload((value) => value + 1) : undefined}
      onCancel={onClose}
      onConfirm={() => void confirm()}
    >
      {loading ? (
        <DataState kind="loading" title={c.loading} />
      ) : (
        <>
          <p>{c.reopenHint}</p>
          <p>
            <strong>{c.delivery}:</strong> {formatAdminDate(actualDelivery)}
          </p>
          <FormField label={c.deadline}>
            <FormInput
              type="datetime-local"
              required
              step={60}
              value={deadline}
              disabled={busy || !eligible}
              max={csaDeadlineInputMax(actualDelivery)}
              onChange={(e) => {
                setDeadline(e.target.value);
                setError(null);
              }}
            />
          </FormField>
        </>
      )}
    </ConfirmationDialog>
  );
}
