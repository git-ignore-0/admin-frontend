"use client";
import { Alert } from "@mantine/core";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { Button, DataState, FormField, FormInput } from "@/components/nfv-controls";
import { requestErrorMessage } from "@/lib/client-error";
import {
  getRound,
  roundDateInput,
  roundDateToApi,
  saveRound,
  validateRoundDates,
} from "@/lib/csa-rounds";
import { csaRoundError, csaRoundsCopy } from "@/lib/csa-rounds-copy";
import styles from "./csa-rounds.module.css";

export function CSARoundEditor({ roundId }: { roundId?: string }) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const router = useRouter();
  const [form, setForm] = useState({ name: "", opens_at: "", closes_at: "", delivery_date: "" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const loadVersion = useRef(0);
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [editable, setEditable] = useState(true);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError(null);
    setError(null);
    try {
      const item = roundId ? await getRound(roundId) : undefined;
      if (version !== loadVersion.current) return;
      setEditable(!item || item.can_edit);
      if (item)
        setForm({
          name: item.name,
          opens_at: roundDateInput(item.opens_at),
          closes_at: roundDateInput(item.closes_at),
          delivery_date: item.delivery_date,
        });
      else setForm({ name: "", opens_at: "", closes_at: "", delivery_date: "" });
    } catch (e) {
      if (version === loadVersion.current) setLoadError(e);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [roundId]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadVersion.current += 1;
    };
  }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || loading || !editable) return;
    const dates = {
      opens_at: roundDateToApi(form.opens_at) ?? "",
      closes_at: roundDateToApi(form.closes_at) ?? "",
      delivery_date: form.delivery_date,
    };
    if (!form.name.trim()) {
      setError("nameRequired");
      return;
    }
    const invalid = validateRoundDates(dates);
    if (invalid) {
      setError(invalid);
      return;
    }
    const version = loadVersion.current;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveRound({ name: form.name.trim(), ...dates }, roundId);
      if (version === loadVersion.current) router.push(`/csa-rounds/${saved.id}`);
    } catch (e) {
      if (version === loadVersion.current) setError(e);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className={styles.screen}>
      <DetailPageHeading
        bottomSpacing={0}
        backHref={roundId ? `/csa-rounds/${roundId}` : "/csa-rounds"}
        backLabel={c.back}
        title={roundId ? c.edit : c.create}
      />
      {loading ? (
        <DataState kind="loading" title={c.loading} />
      ) : loadError ? (
        <DataState
          kind="error"
          title={requestErrorMessage(loadError, t)}
          action={{ label: t.common.retry, onClick: () => void load() }}
        />
      ) : !editable ? (
        <DataState kind="error" title={c.immutable} />
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <FormField label={c.name}>
            <FormInput
              required
              maxLength={200}
              value={form.name}
              disabled={busy}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <fieldset className={styles.scheduleFields} disabled={busy}>
            <legend>{c.scheduleTitle}</legend>

            <div className={styles.dateFields}>
              {(
                [
                  ["opens_at", c.opens],
                  ["closes_at", c.closes],
                  ["delivery_date", c.delivery],
                ] as const
              ).map(([key, label]) => (
                <FormField
                  key={key}
                  label={label}
                  className={key === "delivery_date" ? styles.deliveryField : undefined}
                >
                  <FormInput
                    type={key === "delivery_date" ? "date" : "datetime-local"}
                    required
                    step={key === "delivery_date" ? undefined : 60}
                    value={form[key]}
                    disabled={busy}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </FormField>
              ))}
            </div>
          </fieldset>
          {Boolean(error) && (
            <Alert color="red" role="alert">
              {error === "nameRequired" || error === "schedule"
                ? c[error]
                : csaRoundError(error, locale, requestErrorMessage(error, t))}
            </Alert>
          )}
          <Button
            type="submit"
            loading={busy}
            disabled={
              !form.name.trim() ||
              Boolean(
                validateRoundDates({
                  opens_at: roundDateToApi(form.opens_at) ?? "",
                  closes_at: roundDateToApi(form.closes_at) ?? "",
                  delivery_date: form.delivery_date,
                }),
              )
            }
          >
            {roundId ? c.saveChanges : c.save}
          </Button>
        </form>
      )}
    </div>
  );
}
