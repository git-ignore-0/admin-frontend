"use client";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Status } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import {
  type ClientApiError,
  invalidApiResponse,
  isProtectedDataError,
  isRequestCanceled,
  requestErrorMessage,
} from "@/lib/client-error";
import {
  disableFarmTracker,
  enableFarmTracker,
  getFarmTracker,
  updateFarmTracker,
} from "@/lib/farms-api";
import { trackerMilestone } from "@/lib/tracker-milestone";
import type { Farm, TrackerFarm } from "@/lib/types";

const MAX_COUNT = 4_294_967_295;
const emptyDraft = { month: "0", sixMonths: "0", visible: true };

function validCount(value: string) {
  return /^(0|[1-9]\d*)$/.test(value) && Number(value) <= MAX_COUNT;
}

function requireProfile(profile: TrackerFarm, farmId: string) {
  if (
    profile?.id !== farmId ||
    !Number.isInteger(profile.version) ||
    profile.version < 1 ||
    !Number.isInteger(profile.signup_count) ||
    !validCount(String(profile.signup_count)) ||
    (profile.one_month_signup_count !== undefined &&
      (!Number.isInteger(profile.one_month_signup_count) ||
        !validCount(String(profile.one_month_signup_count)))) ||
    typeof profile.is_visible !== "boolean"
  ) {
    throw invalidApiResponse();
  }
  return profile;
}

export function FarmTrackerProfileEditor({
  farm,
  onAccessLost,
}: {
  farm: Farm;
  onAccessLost?: (cause: unknown) => void;
}) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const [profile, setProfile] = useState<TrackerFarm | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [checking, setChecking] = useState(true);
  const [retry, setRetry] = useState(0);
  const [readError, setReadError] = useState<{ cause: unknown } | null>(null);
  const [writeError, setWriteError] = useState<{
    cause: unknown;
    recovery?: "conflict" | "uncertain";
  } | null>(null);
  const [busy, setBusy] = useState<"save" | "disable" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showCountErrors, setShowCountErrors] = useState(false);
  const requestScope = useRef<AbortController | null>(null);
  const pendingWrite = useRef(false);
  const monthRef = useRef<HTMLInputElement>(null);
  const sixMonthsRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const disableRef = useRef<HTMLButtonElement>(null);
  const tracker = t.trackerFarms;
  const c =
    locale === "vi"
      ? {
          title: "Hồ sơ Growth Tracker",
          enable: "Bật Growth Tracker",
          save: "Lưu Growth Tracker",
          enabled: "Đã bật Growth Tracker",
          disabled: "Chưa bật Growth Tracker",
          month: "Số người đăng ký 1 tháng",
          sixMonths: "Số người đăng ký 6 tháng",
          visibility: "Hiển thị công khai",
          visible: "Cho phép hiển thị",
          loading: "Đang tải Growth Tracker…",
          required: "Vui lòng nhập số đăng ký.",
          invalid: "Số đăng ký phải là số nguyên từ 0 đến 4.294.967.295.",
          conflict: "Hồ sơ Growth Tracker đã thay đổi. Tải lại dữ liệu trước khi tiếp tục.",
          uncertain: "Chưa xác nhận được kết quả. Tải lại dữ liệu để kiểm tra trước khi tiếp tục.",
          reload: "Tải lại dữ liệu",
          inactive:
            "Trang trại đã tắt hoạt động nên sẽ không xuất hiện công khai dù hồ sơ cho phép hiển thị.",
          disabling: "Đang tắt Growth Tracker…",
          saved: "Đã lưu Growth Tracker.",
        }
      : {
          title: "Growth Tracker profile",
          enable: "Enable Growth Tracker",
          save: "Save Growth Tracker",
          enabled: "Growth Tracker enabled",
          disabled: "Growth Tracker not enabled",
          month: "1-month signup count",
          sixMonths: "6-month signup count",
          visibility: "Public visibility",
          visible: "Visibility enabled",
          loading: "Loading Growth Tracker…",
          required: "Enter a signup count.",
          invalid: "Signup counts must be integers from 0 to 4,294,967,295.",
          conflict: "The Growth Tracker profile has changed. Reload the data before continuing.",
          uncertain:
            "The result could not be confirmed. Reload the data to check before continuing.",
          reload: "Reload data",
          inactive:
            "This farm is inactive, so it will not appear publicly even when profile visibility is enabled.",
          disabling: "Disabling Growth Tracker…",
          saved: "Growth Tracker saved.",
        };

  function hydrate(row: TrackerFarm | null) {
    setProfile(row);
    setDraft(
      row
        ? {
            month: String(row.one_month_signup_count ?? 0),
            sixMonths: String(row.signup_count),
            visible: row.is_visible,
          }
        : emptyDraft,
    );
    setShowCountErrors(false);
    setWriteError(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    requestScope.current = controller;
    getFarmTracker(farm.id, controller.signal)
      .then((row) => {
        if (!controller.signal.aborted) hydrate(requireProfile(row, farm.id));
      })
      .catch((cause) => {
        if (controller.signal.aborted || isRequestCanceled(cause, controller.signal)) return;
        if ((cause as ClientApiError | null)?.status === 404) hydrate(null);
        else {
          if (isProtectedDataError(cause)) {
            hydrate(null);
            onAccessLost?.(cause);
          }
          setReadError({ cause });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [farm.id, onAccessLost, retry]);

  function reload() {
    if (pendingWrite.current || checking) return;
    setChecking(true);
    setReadError(null);
    setRetry((value) => value + 1);
  }

  function countError(value: string) {
    if (!showCountErrors || validCount(value)) return undefined;
    return value ? c.invalid : c.required;
  }

  const locked = !!busy || Boolean(writeError?.recovery);

  async function mutate(action: "save" | "disable", execute: () => Promise<TrackerFarm | null>) {
    const scope = requestScope.current;
    if (!scope || scope.signal.aborted || pendingWrite.current || checking || readError || locked)
      return;
    pendingWrite.current = true;
    setBusy(action);
    setWriteError(null);
    try {
      const row = await execute();
      if (scope.signal.aborted) return;
      hydrate(row);
      setConfirming(false);
      toast(action === "disable" ? tracker.deleted : c.saved);
    } catch (cause) {
      if (scope.signal.aborted) return;
      const status = (cause as ClientApiError | null)?.status;
      if (isProtectedDataError(cause) || (status === 404 && action === "save" && !profile)) {
        hydrate(null);
        setReadError({ cause });
        setConfirming(false);
        onAccessLost?.(cause);
        return;
      }
      const recovery =
        status === 409 || status === 404
          ? "conflict"
          : !status ||
              status >= 500 ||
              (cause instanceof Error && cause.message === "invalid_response")
            ? "uncertain"
            : undefined;
      if (recovery) setConfirming(false);
      setWriteError({ cause, recovery });
    } finally {
      pendingWrite.current = false;
      if (!scope.signal.aborted) setBusy(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || confirming) return;
    const validMonth = validCount(draft.month);
    const validSixMonths = validCount(draft.sixMonths);
    if (!validMonth || !validSixMonths) {
      setShowCountErrors(true);
      (validMonth ? sixMonthsRef : monthRef).current?.focus();
      return;
    }
    const values = {
      signup_count: Number(draft.sixMonths),
      one_month_signup_count: Number(draft.month),
      is_visible: draft.visible,
    };
    void mutate("save", async () => {
      const row = profile
        ? await updateFarmTracker(farm.id, { ...values, version: profile.version })
        : await enableFarmTracker(farm.id, values);
      return requireProfile(row, farm.id);
    });
  }

  function confirmDisable() {
    if (!profile || !confirming) return;
    void mutate("disable", async () => {
      await disableFarmTracker(farm.id);
      return null;
    });
  }

  if (checking) {
    return (
      <Paper p="md" withBorder>
        <Group role="status" gap="sm">
          <Loader size="sm" />
          <Text size="sm">{c.loading}</Text>
        </Group>
      </Paper>
    );
  }
  if (readError) {
    if (
      readError.cause instanceof Error &&
      ["session_changed", "session_expired"].includes(readError.cause.message)
    ) {
      return (
        <Alert color="danger" role="alert">
          {t.common.sessionChanged}
        </Alert>
      );
    }
    return (
      <RecoveryAlert
        message={requestErrorMessage(readError.cause, t)}
        retryLabel={t.common.retry}
        onRetry={reload}
      />
    );
  }

  const errorMessage = writeError ? requestErrorMessage(writeError.cause, t) : undefined;
  const name = locale === "vi" ? farm.name_vi : farm.name_en;

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="sm">
          <Title order={2} size="md" fw={600}>
            {c.title}
          </Title>
          <Status
            domain="availability"
            status={profile ? "active" : "inactive"}
            label={profile ? c.enabled : c.disabled}
          />
        </Group>
        {profile && (
          <RecordDetailFields>
            <RecordDetailField label={tracker.milestone}>
              {tracker[trackerMilestone(profile.signup_count)]}
            </RecordDetailField>
            <RecordDetailField label={c.visibility}>
              <Status
                domain="visibility"
                status={profile.is_visible ? "visible" : "hidden"}
                label={profile.is_visible ? c.visible : tracker.hidden}
              />
            </RecordDetailField>
          </RecordDetailFields>
        )}
        {!farm.is_active && <Alert color="warning">{c.inactive}</Alert>}
        {profile && <Divider />}
        <Box component="form" onSubmit={submit} noValidate>
          <Stack gap="md">
            <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }} spacing="sm">
              <TextInput
                ref={monthRef}
                label={c.month}
                inputMode="numeric"
                type="number"
                min={0}
                step={1}
                max={MAX_COUNT}
                value={draft.month}
                error={countError(draft.month)}
                onChange={(event) => setDraft({ ...draft, month: event.currentTarget.value })}
                disabled={!!busy}
                required
                withAsterisk={false}
              />
              <TextInput
                ref={sixMonthsRef}
                label={c.sixMonths}
                inputMode="numeric"
                type="number"
                min={0}
                step={1}
                max={MAX_COUNT}
                value={draft.sixMonths}
                error={countError(draft.sixMonths)}
                onChange={(event) => setDraft({ ...draft, sixMonths: event.currentTarget.value })}
                disabled={!!busy}
                required
                withAsterisk={false}
              />
            </SimpleGrid>
            <Checkbox
              label={tracker.visibleToggle}
              checked={draft.visible}
              onChange={(event) => setDraft({ ...draft, visible: event.currentTarget.checked })}
              disabled={!!busy}
            />
            {writeError?.recovery ? (
              <RecoveryAlert
                message={writeError.recovery === "conflict" ? c.conflict : c.uncertain}
                retryLabel={c.reload}
                onRetry={reload}
              />
            ) : (
              errorMessage &&
              !confirming && (
                <Alert color="danger" role="alert">
                  {errorMessage}
                </Alert>
              )
            )}
            <Group justify={profile ? "space-between" : "flex-end"} gap="xs">
              {profile && (
                <Button
                  ref={disableRef}
                  variant="subtle"
                  color="danger"
                  type="button"
                  aria-haspopup="dialog"
                  disabled={locked}
                  onClick={() => {
                    setWriteError(null);
                    setConfirming(true);
                  }}
                >
                  {tracker.confirmDelete}
                </Button>
              )}
              <Button
                ref={saveRef}
                type="submit"
                disabled={locked || confirming}
                loading={busy === "save"}
              >
                {profile ? c.save : c.enable}
              </Button>
            </Group>
          </Stack>
        </Box>
      </Stack>
      {confirming && (
        <ConfirmationDialog
          busy={busy === "disable"}
          busyLabel={c.disabling}
          cancelLabel={tracker.cancel}
          confirmLabel={tracker.confirmDelete}
          danger
          error={errorMessage}
          fallbackFocusRef={saveRef}
          returnFocusRef={disableRef}
          size="25rem"
          title={tracker.deleteTitle}
          onCancel={() => {
            setWriteError(null);
            setConfirming(false);
          }}
          onConfirm={confirmDisable}
        >
          <Text style={{ overflowWrap: "anywhere" }}>
            {tracker.deleteBody.replace("{name}", name)}
          </Text>
        </ConfirmationDialog>
      )}
    </Paper>
  );
}
