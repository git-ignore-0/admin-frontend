"use client";
import { Alert } from "@mantine/core";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import {
  Button,
  DataState,
  FormField,
  FormInput,
  Section,
  Status,
} from "@/components/nfv-controls";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import {
  getCompanionDelivery,
  updateCompanionDelivery,
  companionDeliveryStatus,
  roundServerNow,
  type CompanionDelivery,
} from "@/lib/csa-companion-delivery";
import {
  csaDeadlineInputMax,
  roundDateInput,
  roundDateToApi,
  validateReopenDeadline,
  type CSARound,
} from "@/lib/csa-rounds";
import { csaRoundsCopy, csaRoundError } from "@/lib/csa-rounds-copy";
import styles from "./csa-rounds.module.css";

type Props = {
  round: CSARound;
  receivedAt: number;
  refreshKey?: number;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export function CSACompanionDelivery(props: Props) {
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const busyCallback = useRef(props.onBusyChange);
  busyCallback.current = props.onBusyChange;
  const acquire = useCallback(() => {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    busyCallback.current?.(true);
    return true;
  }, []);
  const release = useCallback(() => {
    pendingRef.current = false;
    if (mounted.current) {
      setPending(false);
      busyCallback.current?.(false);
    }
  }, []);
  const currentRound = useRef(props.round.id);
  currentRound.current = props.round.id;
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pendingRef.current) busyCallback.current?.(false);
    };
  }, []);
  // A round revisited while its old mutation is pending needs a fresh config.
  const refreshCurrent = useCallback((id: string) => {
    if (mounted.current && currentRound.current === id) setRevision((value) => value + 1);
  }, []);
  return (
    <CompanionDeliveryForm
      key={`${props.round.id}:${revision}`}
      {...props}
      disabled={props.disabled || pending}
      acquire={acquire}
      release={release}
      onStaleMutation={refreshCurrent}
    />
  );
}

function CompanionDeliveryForm({
  round,
  receivedAt,
  refreshKey = 0,
  disabled = false,
  acquire,
  release,
  onStaleMutation,
}: Props & { onStaleMutation: (id: string) => void; acquire: () => boolean; release: () => void }) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const copy = c.companion;
  const fieldLabels = {
    companion_delivery_cutoff: copy.cutoff,
    companion_delivery_enabled: copy.title,
  };
  const [config, setConfig] = useState<CompanionDelivery | null>(null);
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [, tick] = useState(0);
  const alive = useRef(true);
  const dirty = useRef(false);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setLoadError(null);
    void getCompanionDelivery(round.id, signal)
      .then((value) => {
        if (signal.aborted) return;
        setConfig(value);
        if (!dirty.current) {
          setDeadline(
            value.companion_delivery_cutoff ? roundDateInput(value.companion_delivery_cutoff) : "",
          );
        }
      })
      .catch((e) => {
        if (signal.aborted) return;
        setLoadError(e);
        if (isProtectedDataError(e)) {
          setConfig(null);
          setDeadline("");
          dirty.current = false;
        }
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [round.id, retry, refreshKey]);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const now = roundServerNow(round, receivedAt);
  const value = roundDateToApi(deadline);
  const valid = Boolean(value && validateReopenDeadline(value, round.delivery_date, now));
  const unchanged =
    config?.companion_delivery_enabled &&
    deadline ===
      (config.companion_delivery_cutoff ? roundDateInput(config.companion_delivery_cutoff) : "");
  const cancelled =
    round.status === "cancelled" ||
    (error instanceof Error && error.message === "csa_round_cancelled");
  const blocked = disabled || loading || busy || cancelled || !config;
  const state = cancelled
    ? "cancelled"
    : config
      ? companionDeliveryStatus(config, round, now)
      : "not_enabled";
  async function submit(close: boolean) {
    if (!config || blocked || (!close && (unchanged || !valid))) return;
    const currentNow = roundServerNow(round, receivedAt);
    if (!close && (!value || !validateReopenDeadline(value, round.delivery_date, currentNow))) {
      setError(new Error("csa_companion_deadline_invalid"));
      return;
    }
    if (!acquire()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await updateCompanionDelivery(
        round.id,
        close
          ? { version: config.version, companion_delivery_enabled: false }
          : {
              version: config.version,
              companion_delivery_enabled: true,
              companion_delivery_cutoff: value!,
            },
      );
      if (!alive.current) {
        onStaleMutation(round.id);
        return;
      }
      setConfig(result);
      dirty.current = false;
      setDeadline(
        result.companion_delivery_cutoff ? roundDateInput(result.companion_delivery_cutoff) : "",
      );
    } catch (e) {
      if (alive.current) {
        setError(e);
        if (isProtectedDataError(e)) {
          setConfig(null);
          setDeadline("");
          dirty.current = false;
          setLoadError(e);
        } else if (e instanceof Error && e.message === "version_conflict") {
          setRetry((value) => value + 1);
        }
      }
    } finally {
      release();
      if (alive.current) {
        setBusy(false);
      }
    }
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(false);
  }
  return (
    <Section title={copy.title}>
      {loading ? (
        <DataState kind="loading" title={c.loading} />
      ) : loadError ? (
        <DataState
          kind="error"
          title={requestErrorMessage(loadError, t, fieldLabels)}
          action={{ label: t.common.retry, onClick: () => setRetry((value) => value + 1) }}
        />
      ) : (
        <form className={styles.form} onSubmit={onSubmit}>
          <div>
            <Status domain="companion-delivery" status={state} label={copy.states[state]} />
          </div>
          <dl className="detail-list">
            <div>
              <dt>{c.delivery}</dt>
              <dd>{formatAdminDate(round.delivery_date)}</dd>
            </div>
            <div>
              <dt>{copy.cutoff}</dt>
              <dd>{formatAdminDateTime(config?.companion_delivery_cutoff)}</dd>
            </div>
          </dl>
          <FormField
            label={copy.cutoff}
            error={deadline && !valid ? copy.deadlineError : undefined}
          >
            <FormInput
              type="datetime-local"
              value={deadline}
              disabled={blocked}
              max={csaDeadlineInputMax(round.delivery_date)}
              aria-invalid={Boolean(deadline && !valid)}
              onChange={(event) => {
                dirty.current =
                  event.target.value !==
                  (config?.companion_delivery_cutoff
                    ? roundDateInput(config.companion_delivery_cutoff)
                    : "");
                setDeadline(event.target.value);
                setError(null);
              }}
            />
          </FormField>
          {Boolean(error) && (
            <Alert color="red" role="alert">
              {csaRoundError(error, locale, requestErrorMessage(error, t, fieldLabels))}
            </Alert>
          )}
          <div className={styles.actions}>
            <Button type="submit" disabled={blocked || !valid || Boolean(unchanged)}>
              {busy
                ? c.busy
                : config?.companion_delivery_enabled
                  ? c.saveChanges
                  : config?.companion_delivery_cutoff
                    ? copy.reopen
                    : copy.enable}
            </Button>
            {config?.companion_delivery_enabled && !cancelled && (
              <Button
                type="button"
                variant="outline"
                disabled={blocked}
                onClick={() => void submit(true)}
              >
                {copy.close}
              </Button>
            )}
          </div>
        </form>
      )}
    </Section>
  );
}
