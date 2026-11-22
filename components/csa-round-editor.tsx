"use client";
import { Alert, Button, Fieldset, Group, Paper, SimpleGrid, Stack, TextInput } from "@mantine/core";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { roundPageHref } from "@/app/(admin)/csa-rounds/round-navigation";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { CSARoundBreadcrumbs } from "@/components/csa-round-breadcrumbs";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { DataState } from "@/components/nfv-controls";
import { RecoveryAlert } from "@/components/recovery-alert";
import { requestErrorMessage } from "@/lib/client-error";
import {
  getRound,
  roundDateInput,
  roundDateToApi,
  saveRound,
  validateRoundDates,
  type CSARoundStatus,
} from "@/lib/csa-rounds";
import { csaRoundError, csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundEditor({
  roundId,
  listPage = 1,
  listStatus,
}: {
  roundId?: string;
  listPage?: number;
  listStatus?: CSARoundStatus | "";
}) {
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
      if (version === loadVersion.current)
        router.push(
          roundPageHref(`/csa-rounds/${encodeURIComponent(saved.id)}`, listPage, listStatus),
        );
    } catch (e) {
      if (version === loadVersion.current) setError(e);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Stack gap="md" miw={0}>
      <CSARoundBreadcrumbs roundId={roundId} editing listPage={listPage} listStatus={listStatus} />
      <DetailPageHeading
        bottomSpacing={0}
        backHref={roundPageHref(
          roundId ? `/csa-rounds/${encodeURIComponent(roundId)}` : "/csa-rounds",
          listPage,
          listStatus,
        )}
        backLabel={c.back}
        title={roundId ? c.edit : c.create}
      />
      <Paper component="section" withBorder p="md">
        {loading ? (
          <DataState kind="loading" title={c.loading} />
        ) : loadError ? (
          <RecoveryAlert
            message={requestErrorMessage(loadError, t)}
            retryLabel={t.common.retry}
            onRetry={() => void load()}
          />
        ) : !editable ? (
          <DataState kind="error" title={c.immutable} />
        ) : (
          <Stack component="form" gap="md" maw={760} onSubmit={submit}>
            <TextInput
              label={c.name}
              required
              maxLength={200}
              value={form.name}
              disabled={busy}
              onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            />
            <Fieldset legend={c.scheduleTitle} disabled={busy}>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {(
                  [
                    ["opens_at", c.opens],
                    ["closes_at", c.closes],
                    ["delivery_date", c.delivery],
                  ] as const
                ).map(([key, label]) => (
                  <TextInput
                    key={key}
                    label={label}
                    type={key === "delivery_date" ? "date" : "datetime-local"}
                    required
                    step={key === "delivery_date" ? undefined : 60}
                    value={form[key]}
                    disabled={busy}
                    miw={0}
                    onChange={(e) => setForm({ ...form, [key]: e.currentTarget.value })}
                  />
                ))}
              </SimpleGrid>
            </Fieldset>
            {Boolean(error) && (
              <Alert color="red" role="alert">
                {error === "nameRequired" || error === "schedule"
                  ? c[error]
                  : csaRoundError(error, locale, requestErrorMessage(error, t))}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button
                type="submit"
                loading={busy}
                disabled={
                  busy ||
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
            </Group>
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
