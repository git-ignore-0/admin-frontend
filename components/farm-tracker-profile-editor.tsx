"use client";

import { Alert, Checkbox, SimpleGrid, Stack, TextInput, Title } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { DataState } from "@/components/nfv-controls";
import { RecoveryAlert } from "@/components/recovery-alert";
import { type ClientApiError, invalidApiResponse, requestErrorMessage } from "@/lib/client-error";
import {
  farmAccess,
  farmAccessDenied,
  retireFarmAccess,
  retireFarmQueries,
  useFarmAccess,
} from "@/lib/farm-query";
import { enableFarmTracker, getFarm, getFarmTracker, updateFarmTracker } from "@/lib/farms-api";
import type { TrackerFarm } from "@/lib/types";

const MAX_COUNT = 4_294_967_295;
type Values = {
  one_month_signup_count: number;
  signup_count: number;
  is_visible: boolean;
};
type Profile = Values & { version: number };
type Draft = { month: string; sixMonths: string; visible: boolean };
type Check =
  | { type: "initial" }
  | { type: "farm-write"; previous: Profile | null; ownWrite: boolean }
  | { type: "conflict" }
  | { type: "uncertain"; previous: Profile | null; intended: Values };
type Issue =
  | { type: "access" | "error"; cause: unknown }
  | { type: "check"; check: Check; cause?: unknown; stale?: boolean }
  | { type: "review"; latest: Profile | null };
type State = {
  baseline: Profile | null | undefined;
  draft: Draft;
  busy: boolean;
  issue: Issue | null;
};
const emptyDraft = { month: "0", sixMonths: "0", visible: false };
const initialState: State = { baseline: undefined, draft: emptyDraft, busy: false, issue: null };

function validCount(value: string) {
  return /^(0|[1-9]\d*)$/.test(value) && Number(value) <= MAX_COUNT;
}

function requireProfile(profile: TrackerFarm, farmId: string): Profile {
  if (
    profile?.id !== farmId ||
    !Number.isSafeInteger(profile.version) ||
    profile.version < 1 ||
    typeof profile.signup_count !== "number" ||
    !validCount(String(profile.signup_count)) ||
    typeof profile.one_month_signup_count !== "number" ||
    !validCount(String(profile.one_month_signup_count)) ||
    typeof profile.is_visible !== "boolean"
  ) {
    throw invalidApiResponse();
  }
  return {
    version: profile.version,
    one_month_signup_count: profile.one_month_signup_count,
    signup_count: profile.signup_count,
    is_visible: profile.is_visible,
  };
}

function fromProfile(profile: Profile | null | undefined): Draft {
  return profile
    ? {
        month: String(profile.one_month_signup_count),
        sixMonths: String(profile.signup_count),
        visible: profile.is_visible,
      }
    : emptyDraft;
}

function sameValues(a: Values, b: Values) {
  return (
    a.one_month_signup_count === b.one_month_signup_count &&
    a.signup_count === b.signup_count &&
    a.is_visible === b.is_visible
  );
}

function isNotFound(cause: unknown) {
  const error = cause as ClientApiError | null;
  return (
    error?.status === 404 &&
    error.message !== "request_timeout" &&
    error.message !== "invalid_response" &&
    !farmAccessDenied(cause)
  );
}

export function useFarmTracker({
  farmId,
  enabled,
  canAct,
  onAccessLost,
}: {
  farmId?: string;
  enabled: boolean;
  canAct: () => boolean;
  onAccessLost: (cause: unknown) => void;
}) {
  const client = useQueryClient();
  const currentSession = useIsAdminQueryScopeCurrent();
  const access = useFarmAccess();
  // A route may replace the Farm identity before a pending request resolves.
  const scope = useMemo(
    () => ({
      farmId,
      mounted: false,
      pending: null as AbortController | null,
      state: initialState,
    }),
    [farmId],
  );
  const callbacks = useRef({ canAct, onAccessLost });
  const [published, setPublished] = useState<{ scope: typeof scope; state: State }>();
  const state = published?.scope === scope ? published.state : initialState;

  useLayoutEffect(() => {
    callbacks.current = { canAct, onAccessLost };
  }, [canAct, onAccessLost]);
  useLayoutEffect(() => {
    scope.mounted = true;
    return () => {
      scope.mounted = false;
      queueMicrotask(() => {
        if (!scope.mounted) scope.pending?.abort();
      });
    };
  }, [scope]);

  const update = useCallback(
    (changes: Partial<State>) => {
      const next = { ...scope.state, ...changes };
      scope.state = next;
      setPublished({ scope, state: next });
    },
    [scope],
  );
  const canUse = useCallback(
    (revision = farmAccess(client).revision) => {
      const active = farmAccess(client);
      return (
        scope.mounted &&
        currentSession() &&
        active.revision === revision &&
        !active.error &&
        callbacks.current.canAct()
      );
    },
    [client, currentSession, scope],
  );
  const retire = useCallback(
    (cause: unknown, missingFarm = false) => {
      if (!currentSession()) return false;
      if (farmAccessDenied(cause)) retireFarmAccess(client, cause);
      else if (missingFarm && farmId) retireFarmQueries(client, farmId);
      else return false;
      if (scope.mounted) {
        update({ ...initialState, issue: { type: "access", cause } });
        callbacks.current.onAccessLost(cause);
      }
      return true;
    },
    [client, currentSession, farmId, scope, update],
  );
  const start = useCallback(() => {
    if (!scope.farmId || scope.pending || !canUse()) return;
    const controller = new AbortController();
    scope.pending = controller;
    update({ busy: true });
    return { controller, revision: farmAccess(client).revision };
  }, [canUse, client, scope, update]);
  const finish = useCallback(
    (controller: AbortController) => {
      scope.pending = null;
      if (scope.mounted && currentSession() && !controller.signal.aborted) {
        update({ busy: false });
      }
    },
    [currentSession, scope, update],
  );

  const inspect = useCallback(
    async (check: Check): Promise<boolean> => {
      if (!farmId) return false;
      const operation = start();
      if (!operation) return false;
      const { controller, revision } = operation;
      try {
        let latest: Profile | null;
        try {
          latest = requireProfile(await getFarmTracker(farmId, controller.signal), farmId);
        } catch (cause) {
          if (!isNotFound(cause)) throw cause;
          if (!canUse(revision)) return false;
          // Tracker GET returns 404 for either a missing profile or a missing Farm.
          try {
            await getFarm(farmId, controller.signal);
          } catch (farmError) {
            if (isNotFound(farmError) && canUse(revision)) {
              retire(farmError, true);
              return false;
            }
            throw farmError;
          }
          latest = null;
        }
        if (!canUse(revision)) return false;
        if (check.type === "initial") {
          update({ baseline: latest, draft: fromProfile(latest), issue: null });
          return true;
        }
        if (
          check.type === "farm-write" &&
          ((!check.previous && !latest) ||
            (check.previous &&
              latest &&
              latest.version === check.previous.version + Number(check.ownWrite) &&
              sameValues(latest, check.previous)))
        ) {
          update({ baseline: latest, issue: null });
          return true;
        }
        if (
          check.type === "uncertain" &&
          latest &&
          (!check.previous || latest.version === check.previous.version + 1) &&
          sameValues(latest, check.intended)
        ) {
          update({ baseline: latest, draft: fromProfile(latest), issue: null });
          return true;
        }
        if (
          check.type === "uncertain" &&
          (check.previous ? latest?.version === check.previous.version : latest === null)
        ) {
          update({ issue: { type: "check", check, stale: true } });
          return false;
        }
        // An older response can never replace an already verified revision.
        if (latest && scope.state.baseline && latest.version < scope.state.baseline.version) {
          throw invalidApiResponse();
        }
        update({ issue: { type: "review", latest } });
        return false;
      } catch (cause) {
        if (!retire(cause) && canUse(revision) && scope.state.issue?.type !== "access") {
          update({ issue: { type: "check", check, cause } });
        }
        return false;
      } finally {
        finish(controller);
      }
    },
    [canUse, farmId, finish, retire, scope, start, update],
  );

  useEffect(() => {
    if (enabled && farmId && state.baseline === undefined && !state.issue) {
      void inspect({ type: "initial" });
    }
  }, [enabled, farmId, inspect, state.baseline, state.issue]);

  const previousDraft = fromProfile(state.baseline);
  const dirty =
    state.draft.month !== previousDraft.month ||
    state.draft.sixMonths !== previousDraft.sixMonths ||
    state.draft.visible !== previousDraft.visible;
  const issue = access.error ? { type: "access" as const, cause: access.error } : state.issue;

  async function save() {
    const { baseline, draft, issue } = scope.state;
    if (
      !farmId ||
      baseline === undefined ||
      !canUse() ||
      (issue && issue.type !== "error") ||
      !validCount(draft.month) ||
      !validCount(draft.sixMonths)
    ) {
      return false;
    }
    const before = fromProfile(baseline);
    const intended: Values = {
      one_month_signup_count: Number(draft.month),
      signup_count: Number(draft.sixMonths),
      is_visible: draft.visible,
    };
    const patch = {
      ...(draft.month !== before.month && {
        one_month_signup_count: intended.one_month_signup_count,
      }),
      ...(draft.sixMonths !== before.sixMonths && { signup_count: intended.signup_count }),
      ...(draft.visible !== before.visible && { is_visible: intended.is_visible }),
    };
    if (!Object.keys(patch).length) return !scope.pending;
    const operation = start();
    if (!operation) return false;
    const { controller, revision } = operation;
    update({ issue: null });
    try {
      const result = baseline
        ? await updateFarmTracker(farmId, { ...patch, version: baseline.version })
        : await enableFarmTracker(farmId, intended);
      if (!canUse(revision)) return false;
      const latest = requireProfile(result, farmId);
      if ((baseline && latest.version !== baseline.version + 1) || !sameValues(latest, intended)) {
        throw invalidApiResponse();
      }
      update({ baseline: latest, draft: fromProfile(latest), issue: null });
      return true;
    } catch (cause) {
      if (retire(cause) || !canUse(revision)) return false;
      if (!baseline && isNotFound(cause)) {
        retire(cause, true);
        return false;
      }
      const status = (cause as ClientApiError | null)?.status;
      if (status === 409 || status === 404) {
        update({ issue: { type: "check", check: { type: "conflict" } } });
      } else if (
        !status ||
        status === 408 ||
        status >= 500 ||
        (cause instanceof Error && cause.message === "invalid_response")
      ) {
        update({
          issue: { type: "check", check: { type: "uncertain", previous: baseline, intended } },
        });
      } else {
        update({ issue: { type: "error", cause } });
      }
      return false;
    } finally {
      finish(controller);
    }
  }

  const syncAfterFarmWrite = useCallback(
    async (ownWrite = true) => {
      if (!canUse() || scope.pending) return false;
      const { baseline, issue } = scope.state;
      if (issue && issue.type !== "error") return false;
      if (baseline === undefined) return true;
      return inspect({ type: "farm-write", previous: baseline, ownWrite });
    },
    [canUse, inspect, scope],
  );

  function setDraft(draft: Draft) {
    if (/\D/.test(draft.month) || /\D/.test(draft.sixMonths)) return;
    const { issue } = scope.state;
    if (canUse() && !scope.pending && (!issue || issue.type === "error")) {
      update({ draft, issue: null });
    }
  }

  function reset() {
    const { baseline, issue } = scope.state;
    if (canUse() && !scope.pending) {
      update({ draft: fromProfile(baseline), issue: issue?.type === "error" ? null : issue });
    }
  }

  function retry() {
    const { issue } = scope.state;
    if (issue?.type === "check") void inspect(issue.check);
  }

  function adoptLatest() {
    const { baseline, draft, issue } = scope.state;
    if (!canUse() || scope.pending || issue?.type !== "review") return;
    const old = fromProfile(baseline);
    const latest = fromProfile(issue.latest);
    update({
      baseline: issue.latest,
      draft: {
        month: draft.month === old.month ? latest.month : draft.month,
        sixMonths: draft.sixMonths === old.sixMonths ? latest.sixMonths : draft.sixMonths,
        visible: draft.visible === old.visible ? latest.visible : draft.visible,
      },
      issue: null,
    });
  }

  return {
    dirty: !access.error && dirty,
    needsWriteRecovery:
      issue?.type === "review" || (issue?.type === "check" && issue.check.type !== "initial"),
    ready:
      state.baseline !== undefined &&
      !state.busy &&
      (!issue || issue.type === "error") &&
      validCount(state.draft.month) &&
      validCount(state.draft.sixMonths),
    busy: state.busy,
    reset,
    save,
    syncAfterFarmWrite,
    draft: state.draft,
    observed: state.baseline !== undefined,
    issue,
    setDraft,
    retry,
    adoptLatest,
  };
}

export function FarmTrackerFields({
  tracker,
  disabled,
  farmActive,
}: {
  tracker: ReturnType<typeof useFarmTracker>;
  disabled: boolean;
  farmActive: boolean;
}) {
  const { locale, t } = useAdminI18n();
  const c =
    locale === "vi"
      ? {
          month: "Số người đăng ký 1 tháng",
          sixMonths: "Số người đăng ký 6 tháng",
          visibility: "Hiển thị trên Growth Tracker",
          loading: "Đang tải Growth Tracker…",
          required: "Vui lòng nhập số đăng ký.",
          invalid: "Số đăng ký phải là số nguyên từ 0 đến 4.294.967.295.",
          inactive:
            "Trang trại đã tắt hoạt động nên sẽ không xuất hiện công khai trên Growth Tracker.",
          conflict: "Hồ sơ Growth Tracker đã thay đổi. Kiểm tra dữ liệu mới để tiếp tục.",
          uncertain: "Chưa xác nhận được kết quả lưu Growth Tracker. Kiểm tra dữ liệu để tiếp tục.",
          stale: "Dữ liệu Growth Tracker vẫn ở trạng thái trước khi lưu. Hãy kiểm tra lại sau.",
          sync: "Chưa xác minh được dữ liệu Growth Tracker sau khi lưu trang trại.",
          check: "Kiểm tra lại dữ liệu",
          review: "Đối chiếu dữ liệu mới rồi xác nhận để giữ các trường bạn đã sửa.",
          adopt: "Dùng dữ liệu mới và giữ chỉnh sửa",
          absent: "Trang trại hiện chưa có hồ sơ Growth Tracker.",
          visible: "Đang hiển thị trên Growth Tracker.",
          hidden: "Đang ẩn trên Growth Tracker.",
        }
      : {
          month: "1-month signup count",
          sixMonths: "6-month signup count",
          visibility: "Visible on Growth Tracker",
          loading: "Loading Growth Tracker…",
          required: "Enter a signup count.",
          invalid: "Signup counts must be integers from 0 to 4,294,967,295.",
          inactive: "This farm is inactive and will be hidden from the public Growth Tracker.",
          conflict: "The Growth Tracker profile has changed. Check the latest data to continue.",
          uncertain: "The Growth Tracker save could not be confirmed. Check the data to continue.",
          stale: "Growth Tracker still shows the data from before the save. Check again later.",
          sync: "The Growth Tracker data could not be verified after saving the farm.",
          check: "Check data again",
          review: "Review the latest data, then confirm to keep the fields you edited.",
          adopt: "Use latest data and keep edits",
          absent: "The farm currently has no Growth Tracker profile.",
          visible: "Visible on Growth Tracker.",
          hidden: "Hidden on Growth Tracker.",
        };
  const { draft, issue } = tracker;
  const locked = disabled || tracker.busy || Boolean(issue && issue.type !== "error");
  const countError = (value: string) =>
    validCount(value) ? undefined : value ? c.invalid : c.required;
  let recovery;
  if (issue?.type === "access" || issue?.type === "error") {
    const sessionChanged =
      issue.cause instanceof Error &&
      ["session_changed", "session_expired"].includes(issue.cause.message);
    recovery = (
      <Alert color="danger" role="alert">
        {sessionChanged ? t.common.sessionChanged : requestErrorMessage(issue.cause, t)}
      </Alert>
    );
  } else if (issue?.type === "check") {
    const message = {
      initial: requestErrorMessage(issue.cause, t),
      "farm-write": c.sync,
      conflict: c.conflict,
      uncertain: issue.stale ? c.stale : c.uncertain,
    }[issue.check.type];
    recovery = (
      <RecoveryAlert
        message={message}
        retryLabel={issue.check.type === "initial" ? t.common.retry : c.check}
        loading={tracker.busy}
        onRetry={() => {
          if (!disabled) tracker.retry();
        }}
      />
    );
  } else if (issue?.type === "review") {
    const latest = issue.latest;
    const counts = latest
      ? `${c.month} ${latest.one_month_signup_count} · ${c.sixMonths} ${latest.signup_count}. ${latest.is_visible ? c.visible : c.hidden}`
      : c.absent;
    recovery = (
      <RecoveryAlert
        message={`${c.review} ${counts}`}
        retryLabel={c.adopt}
        onRetry={() => {
          if (!disabled) tracker.adoptLatest();
        }}
      />
    );
  }

  return (
    <Stack gap="md">
      <Title order={2} size="md" fw={600}>
        Growth Tracker
      </Title>
      {!tracker.observed && !issue && <DataState kind="loading" title={c.loading} />}
      {tracker.observed && issue?.type !== "access" && (
        <>
          <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }} spacing="sm">
            <TextInput
              label={c.month}
              inputMode="numeric"
              value={draft.month}
              error={countError(draft.month)}
              onChange={(event) => tracker.setDraft({ ...draft, month: event.currentTarget.value })}
              disabled={locked}
              required
              withAsterisk={false}
            />
            <TextInput
              label={c.sixMonths}
              inputMode="numeric"
              value={draft.sixMonths}
              error={countError(draft.sixMonths)}
              onChange={(event) =>
                tracker.setDraft({ ...draft, sixMonths: event.currentTarget.value })
              }
              disabled={locked}
              required
              withAsterisk={false}
            />
          </SimpleGrid>
          <Checkbox
            label={c.visibility}
            checked={draft.visible}
            onChange={(event) =>
              tracker.setDraft({ ...draft, visible: event.currentTarget.checked })
            }
            disabled={locked}
          />
          {!farmActive && draft.visible && <Alert color="warning">{c.inactive}</Alert>}
        </>
      )}
      {recovery}
    </Stack>
  );
}
