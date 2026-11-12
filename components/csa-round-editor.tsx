"use client";
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
  const [form, setForm] = useState({ name: "", opens_at: "", closes_at: "", delivery_at: "" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const loadVersion = useRef(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [editable, setEditable] = useState(true);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError(null);
    try {
      const item = roundId ? await getRound(roundId) : undefined;
      if (version !== loadVersion.current) return;
      setEditable(!item || item.can_edit);
      if (item)
        setForm({
          name: item.name,
          opens_at: roundDateInput(item.opens_at),
          closes_at: roundDateInput(item.closes_at),
          delivery_at: roundDateInput(item.delivery_at),
        });
    } catch (e) {
      if (version === loadVersion.current) setLoadError(e);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [roundId]);
  useEffect(() => {
    void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const dates = {
      opens_at: roundDateToApi(form.opens_at) ?? "",
      closes_at: roundDateToApi(form.closes_at) ?? "",
      delivery_at: roundDateToApi(form.delivery_at) ?? "",
    };
    if (!form.name.trim()) {
      setError(c.nameRequired);
      return;
    }
    const invalid = validateRoundDates(dates);
    if (invalid) {
      setError(c[invalid]);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await saveRound({ name: form.name.trim(), ...dates }, roundId);
      router.push(`/csa-rounds/${saved.id}`);
    } catch (e) {
      setError(csaRoundError(e, locale, requestErrorMessage(e, t)));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.screen}>
      <DetailPageHeading
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
                  ["delivery_at", c.delivery],
                ] as const
              ).map(([key, label]) => (
                <FormField
                  key={key}
                  label={label}
                  className={key === "delivery_at" ? styles.deliveryField : undefined}
                >
                  <FormInput
                    type="datetime-local"
                    required
                    step={60}
                    value={form[key]}
                    disabled={busy}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </FormField>
              ))}
            </div>
          </fieldset>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" loading={busy}>
            {roundId ? c.saveChanges : c.save}
          </Button>
        </form>
      )}
    </div>
  );
}
