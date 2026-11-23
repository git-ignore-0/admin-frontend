"use client";
import {
  Alert,
  Button,
  Fieldset,
  Group,
  Paper,
  Radio,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  roundConfigurationHref,
  roundRecordHref,
  type RoundNavigationContext,
} from "@/app/(admin)/csa-rounds/round-navigation";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { CSARoundBreadcrumbs } from "@/components/csa-round-breadcrumbs";
import { CSARoundScheduleFields } from "@/components/csa-round-schedule-fields";
import { DataState } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { RecoveryAlert } from "@/components/recovery-alert";
import { requestErrorMessage } from "@/lib/client-error";
import {
  csaRoundConfigurationKey,
  getRound,
  getRoundConfiguration,
  saveRoundConfiguration,
  roundDateInput,
  roundDateToApi,
  saveRound,
  validateRoundDates,
  type AdminCSARound,
  type CSARecurrenceMode,
  type CSAConfigurationStatus,
  type CSARoundConfiguration,
} from "@/lib/csa-rounds";
import { csaRoundError, csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundEditor({
  roundId,
  configurationId,
  listPage = 1,
  listStatus,
  listContext,
}: {
  roundId?: string;
  configurationId?: string;
  listPage?: number;
  listStatus?: CSAConfigurationStatus | "";
  listContext?: RoundNavigationContext;
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const router = useRouter();
  const client = useContext(QueryClientContext);
  const context = listContext ?? { page: listPage, status: listStatus };
  const [form, setForm] = useState({ name: "", opens_at: "", closes_at: "", delivery_date: "" });
  const [round, setRound] = useState<AdminCSARound>();
  const [configuration, setConfiguration] = useState<CSARoundConfiguration>();
  const [weekly, setWeekly] = useState(false);
  const [recurrenceMode, setRecurrenceMode] = useState<CSARecurrenceMode>("draft");
  const recurrenceHintId = useId();
  const occurrenceHintId = useId();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const readController = useRef<AbortController | null>(null);
  const loadVersion = useRef(0);
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const editable = roundId
    ? round?.can_edit === true
    : !configurationId || configuration?.status === "draft";
  const showOccurrenceHint = Boolean(round?.recurrence);
  const title = roundId ? c.edit : configurationId ? c.editConfiguration : c.createConfiguration;
  const dates = {
    opens_at: roundDateToApi(form.opens_at) ?? "",
    closes_at: roundDateToApi(form.closes_at) ?? "",
    delivery_date: form.delivery_date,
  };
  const invalidSchedule = validateRoundDates(dates);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setLoading(true);
    setLoadError(null);
    setError(null);
    try {
      const occurrence = roundId ? await getRound(roundId, controller.signal) : undefined;
      const config = configurationId
        ? await getRoundConfiguration(configurationId, controller.signal)
        : undefined;
      const item = occurrence ?? config;
      if (version !== loadVersion.current) return;
      setRound(occurrence);
      setConfiguration(config);
      setWeekly(Boolean(config?.recurrence_mode));
      setRecurrenceMode(config?.recurrence_mode ?? "draft");
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
      if (readController.current === controller) readController.current = null;
      if (version === loadVersion.current) setLoading(false);
    }
  }, [configurationId, roundId]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadVersion.current += 1;
      readController.current?.abort();
    };
  }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || loading || !editable) return;
    if (!form.name.trim()) {
      setError("nameRequired");
      return;
    }
    if (invalidSchedule) {
      setError(invalidSchedule);
      return;
    }
    const version = loadVersion.current;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const body = { name: form.name.trim(), ...dates };
      if (roundId) {
        const saved = await saveRound(body, roundId);
        if (version === loadVersion.current) {
          router.push(roundRecordHref(saved.id, context, saved.configuration_id));
        }
      } else {
        const saved = await saveRoundConfiguration(
          { ...body, recurrence_mode: weekly ? recurrenceMode : null },
          configurationId,
        );
        if (version === loadVersion.current) {
          client?.setQueryData(csaRoundConfigurationKey(saved.id), saved);
          router.push(roundConfigurationHref(context, saved.id));
        }
      }
    } catch (e) {
      if (version === loadVersion.current) setError(e);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Stack gap="md" miw={0}>
      <CSARoundBreadcrumbs
        roundId={roundId}
        round={round}
        configurationId={configurationId}
        configurationName={configuration?.name}
        editing
        listPage={listPage}
        listStatus={listStatus}
        listContext={listContext}
      />
      <PageHeading title={title} visuallyHiddenTitle />
      <Paper component="section" withBorder p="md" w="100%" maw={760}>
        {loading ? (
          <DataState kind="loading" title={c.loading} />
        ) : loadError ? (
          <RecoveryAlert
            message={requestErrorMessage(loadError, t)}
            retryLabel={t.common.retry}
            onRetry={() => void load()}
          />
        ) : !editable ? (
          <DataState kind="error" title={roundId ? c.immutable : c.configurationNotDraft} />
        ) : (
          <Stack component="form" gap="lg" onSubmit={submit}>
            <Fieldset
              legend={roundId ? c.roundInformation : c.configurationInformation}
              variant="unstyled"
              styles={{ legend: { fontWeight: 600 } }}
              disabled={busy}
              miw={0}
            >
              <TextInput
                label={roundId ? c.name : c.configurationName}
                required
                maxLength={200}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
              />
            </Fieldset>
            <CSARoundScheduleFields
              values={form}
              disabled={busy}
              onChange={(field, value) => setForm({ ...form, [field]: value })}
            />
            {!roundId && (
              <Stack gap="md">
                <Radio.Group
                  name="configuration_type"
                  label={c.configurationTypeTitle}
                  labelProps={{ fw: 600 }}
                  value={weekly ? "weekly" : "standalone"}
                  onChange={(value) => setWeekly(value === "weekly")}
                  disabled={busy}
                >
                  <Group gap="md" mt="xs">
                    <Radio value="standalone" label={c.standalone} />
                    <Radio value="weekly" label={c.recurrence.weekly} />
                  </Group>
                </Radio.Group>
                {weekly && (
                  <Radio.Group
                    name="recurrence_mode"
                    label={c.recurrence.mode}
                    value={recurrenceMode}
                    onChange={(value) => setRecurrenceMode(value === "auto" ? "auto" : "draft")}
                    disabled={busy}
                  >
                    <Stack gap="sm" mt="xs">
                      <Radio
                        value="draft"
                        label={c.recurrence.modes.draft}
                        description={
                          <span id={`${recurrenceHintId}-draft`}>{c.recurrence.modeDraftHint}</span>
                        }
                        aria-describedby={`${recurrenceHintId}-draft`}
                      />
                      <Radio
                        value="auto"
                        label={c.recurrence.modes.auto}
                        description={
                          <span id={`${recurrenceHintId}-auto`}>{c.recurrence.modeAutoHint}</span>
                        }
                        aria-describedby={`${recurrenceHintId}-auto`}
                      />
                    </Stack>
                  </Radio.Group>
                )}
              </Stack>
            )}
            {Boolean(error) && (
              <Alert color="danger" role="alert">
                {error === "nameRequired" || error === "schedule"
                  ? c[error]
                  : csaRoundError(
                      error,
                      locale,
                      requestErrorMessage(error, t, { recurrence_mode: c.recurrence.mode }),
                    )}
              </Alert>
            )}
            <Group justify="flex-end">
              {showOccurrenceHint && (
                <Text id={occurrenceHintId} size="sm" c="dimmed">
                  {c.recurrence.editOccurrenceHint}
                </Text>
              )}
              <Button
                type="submit"
                loading={busy}
                disabled={busy || !form.name.trim() || Boolean(invalidSchedule)}
                aria-describedby={showOccurrenceHint ? occurrenceHintId : undefined}
              >
                {roundId || configurationId ? c.saveChanges : c.save}
              </Button>
            </Group>
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
