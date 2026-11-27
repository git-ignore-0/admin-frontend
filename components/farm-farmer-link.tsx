"use client";

import {
  ActionIcon,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import {
  useAdminRecordScope,
  useIsAdminQueryScopeCurrent,
} from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { useAdminMutationIntent } from "@/lib/admin-mutation-intent";
import { isUncertainMutationError, requestErrorMessage } from "@/lib/client-error";
import {
  farmAccess,
  farmAccessDenied,
  farmDeleteBlocksWrite,
  farmFarmerLinkIntentKey,
  farmNotFound,
  isFarmGone,
  retireFarmAccess,
  useFarmAccess,
} from "@/lib/farm-query";
import { farmerLink } from "@/lib/farm-supply-request-api";
import { getFarm } from "@/lib/farms-api";

const labels = {
  vi: {
    heading: "URL nhập sản phẩm",
    description: "Chia sẻ URL này để nông dân gửi yêu cầu nhập sản phẩm và xem lịch sử.",
    create: "Tạo link",
    rotate: "Đổi link",
    confirm: "Link cũ sẽ không còn hiệu lực. Bạn cần gửi link mới cho nông dân.",
    copy: "Sao chép URL",
    copied: "Đã sao chép URL.",
    copyFailed: "Không thể sao chép URL.",
    created: "Đã tạo link.",
    rotated: "Đã cập nhật link hiện tại.",
    unknown: "Chưa xác minh lần cập nhật link. Kiểm tra lại link hiện tại trước khi thao tác tiếp.",
    unchanged: "Lần kiểm tra gần nhất vẫn thấy link trước đó. Chưa xác minh được lần đổi link.",
    read: "Kiểm tra link hiện tại",
  },
  en: {
    heading: "Product entry URL",
    description: "Share this URL so farmers can submit supply requests and view their history.",
    create: "Create link",
    rotate: "Rotate link",
    confirm: "The previous link will stop working. Share the new link with the farmer.",
    copy: "Copy URL",
    copied: "URL copied.",
    copyFailed: "Could not copy the URL.",
    created: "Link created.",
    rotated: "Current link updated.",
    unknown:
      "The link update could not be confirmed. Check the current link before taking another action.",
    unchanged: "The last check still returned the previous link. Rotation remains unconfirmed.",
    read: "Check current link",
  },
};

type LinkState = {
  revision?: number;
  url?: string | null;
  error?: unknown;
  check?: "unchanged" | "create";
};

export function FarmFarmerLink({
  farmId,
  writeBlocked,
  claimWrite,
  onAccessLost,
}: {
  farmId: string;
  writeBlocked: boolean;
  claimWrite: () => (() => void) | undefined;
  onAccessLost: (cause: unknown) => void;
}) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const c = labels[locale];
  const client = useQueryClient();
  const scope = useAdminRecordScope(farmId);
  const sessionCurrent = useIsAdminQueryScopeCurrent();
  const { intent, controls } = useAdminMutationIntent<{ previousUrl: string }>(
    farmFarmerLinkIntentKey[1],
    farmId.toLowerCase(),
  );
  const { revision, error: accessError } = useFarmAccess();
  const [cached, setState] = useState<LinkState>({});
  const [active, setActive] = useState<"read" | "create" | "rotate">("read");
  const [busy, setBusy] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const pendingWrite = useRef(false);
  const loaded = useRef<number | null>(null);
  const clipboardRevision = useRef(0);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const state = cached.revision === revision ? cached : {};
  const farmCurrent = useCallback(
    () =>
      sessionCurrent() &&
      !isFarmGone(client, farmId) &&
      farmAccess(client).revision === revision &&
      !farmAccess(client).error,
    [revision, client, farmId, sessionCurrent],
  );

  const retire = useCallback(
    (cause: unknown) => {
      if (!farmCurrent()) return;
      const visible = scope.capture()();
      if (visible) {
        loaded.current = null;
        setState({});
        setConfirm(false);
      }
      scope.retire();
      if (farmAccessDenied(cause)) retireFarmAccess(client, cause);
      if (visible) onAccessLost(cause);
    },
    [client, farmCurrent, onAccessLost, scope],
  );

  const read = useCallback(
    async (recoveringCreation = false) => {
      if (!farmCurrent()) return;
      const attempt = controls.read();
      if (attempt?.phase === "pending") return;
      const operation = scope.beginRead();
      const current = () => operation.current() && farmCurrent() && controls.read() === attempt;
      setActive("read");
      setBusy(true);
      try {
        let url: string | null;
        try {
          url = (await farmerLink(farmId, "read", operation.signal)).url;
        } catch (cause) {
          if (!farmNotFound(cause)) throw cause;
          if (!current()) return;
          try {
            await getFarm(farmId, operation.signal);
          } catch (verification) {
            if (farmNotFound(verification) && current()) {
              retire(verification);
              return;
            }
            throw verification;
          }
          url = null;
        }
        if (!current()) return;
        loaded.current = revision;
        if (attempt?.phase === "unknown" && (url === null || url === attempt.payload.previousUrl)) {
          setState({ revision, check: url === null ? undefined : "unchanged" });
          return;
        }
        setState({ revision, url });
        if (attempt?.phase === "unknown") controls.settle(attempt, null);
      } catch (cause) {
        if (current() && farmAccessDenied(cause)) retire(cause);
        if (current()) {
          loaded.current = revision;
          setState({ revision, error: cause, check: recoveringCreation ? "create" : undefined });
        }
      } finally {
        if (operation.current() && farmCurrent()) setBusy(false);
      }
    },
    [controls, farmCurrent, farmId, retire, revision, scope],
  );

  useEffect(() => {
    if (accessError) {
      scope.retire();
      loaded.current = null;
      setState({});
      setConfirm(false);
      return;
    }
    if (intent?.phase !== "pending" && (intent?.phase === "unknown" || loaded.current !== revision))
      void read();
  }, [accessError, intent, read, revision, scope]);

  async function update(action: "create" | "rotate") {
    const current = scope.capture();
    const before = state.url;
    if (
      pendingWrite.current ||
      busy ||
      writeBlocked ||
      !current() ||
      !farmCurrent() ||
      controls.read() ||
      (action === "rotate" && !before) ||
      farmDeleteBlocksWrite(client, farmId)
    )
      return;
    const release = claimWrite();
    if (!release) return;
    const attempt = action === "rotate" && before ? controls.begin({ previousUrl: before }) : null;
    if (action === "rotate" && !attempt) {
      release();
      return;
    }
    pendingWrite.current = true;
    clipboardRevision.current += 1;
    setActive(action);
    setBusy(true);
    try {
      const result = await farmerLink(farmId, action);
      if (!farmCurrent() || (attempt && !controls.settle(attempt, null))) return;
      if (!current()) return;
      setState({ revision, url: result.url });
      setConfirm(false);
      toast(action === "rotate" ? c.rotated : c.created);
    } catch (cause) {
      if (farmAccessDenied(cause)) {
        retire(cause);
        return;
      }
      if (!farmCurrent()) return;
      const uncertain =
        isUncertainMutationError(cause) ||
        farmNotFound(cause) ||
        (cause instanceof Error && cause.message === "farm_farmer_link_unreadable");
      if (attempt && !controls.settle(attempt, uncertain ? { ...attempt, phase: "unknown" } : null))
        return;
      if (!current()) return;
      if (uncertain) {
        setConfirm(false);
        setState({ revision });
        if (action === "create") await read(true);
      } else {
        setState({ revision, url: before, error: cause });
      }
    } finally {
      pendingWrite.current = false;
      release();
      if (current() && farmCurrent()) setBusy(false);
    }
  }

  const unknown = intent?.phase === "unknown";
  const absoluteUrl =
    farmCurrent() && !intent && state.url && typeof window !== "undefined"
      ? new URL(state.url, window.location.origin).href
      : "";
  async function copy() {
    const current = scope.capture();
    const clipboard = clipboardRevision.current;
    const allowed = () =>
      current() && farmCurrent() && !controls.read() && clipboardRevision.current === clipboard;
    if (!absoluteUrl || !allowed()) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      if (allowed()) toast(c.copied);
    } catch {
      if (allowed()) toast(c.copyFailed, "error");
    }
  }

  if (accessError) return null;

  const blocked = busy || writeBlocked || Boolean(intent) || !farmCurrent();
  const problem =
    unknown || state.check === "create"
      ? state.check === "unchanged"
        ? c.unchanged
        : c.unknown
      : state.error
        ? requestErrorMessage(state.error, t)
        : "";
  return (
    <Paper component="section" aria-labelledby={headingId} p="md" withBorder miw={0}>
      <Stack gap="sm">
        <Stack gap="xs">
          <Text
            component="h2"
            id={headingId}
            ref={heading}
            tabIndex={-1}
            size="md"
            fw={600}
            c="var(--heading)"
          >
            {c.heading}
          </Text>
          <Text size="sm" c="dimmed">
            {c.description}
          </Text>
        </Stack>
        {!unknown && !absoluteUrl && (busy || intent?.phase === "pending") && <Skeleton h={36} />}
        {problem && !confirm && (
          <RecoveryAlert
            message={problem}
            retryLabel={c.read}
            loading={active === "read" && busy}
            onRetry={() => {
              if (!busy) void read(state.check === "create");
            }}
          />
        )}
        {!intent && state.url === null && (
          <Group>
            <Button
              type="button"
              loading={active === "create" && busy}
              disabled={blocked}
              onClick={() => void update("create")}
            >
              {c.create}
            </Button>
          </Group>
        )}
        {absoluteUrl && (
          <Group align="flex-end" gap="xs">
            <TextInput
              aria-label={c.heading}
              type="url"
              readOnly
              value={absoluteUrl}
              flex="1 1 22rem"
              miw={0}
            />
            <Group gap="xs" wrap="nowrap">
              <Tooltip label={c.copy}>
                <ActionIcon
                  aria-label={c.copy}
                  type="button"
                  disabled={busy || Boolean(intent)}
                  onClick={() => void copy()}
                >
                  <IconCopy size={18} aria-hidden />
                </ActionIcon>
              </Tooltip>
              <Button
                variant="default"
                type="button"
                disabled={blocked}
                onClick={() => {
                  setState({ revision, url: state.url });
                  setConfirm(true);
                }}
              >
                {c.rotate}
              </Button>
            </Group>
          </Group>
        )}
      </Stack>
      {confirm && (
        <ConfirmationDialog
          title={c.rotate}
          size={400}
          danger
          busy={busy}
          cancelLabel={locale === "vi" ? "Hủy" : "Cancel"}
          confirmLabel={c.rotate}
          busyLabel={c.rotate}
          confirmDisabled={writeBlocked}
          fallbackFocusRef={heading}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void update("rotate")}
          error={problem}
        >
          <Text size="sm">{c.confirm}</Text>
        </ConfirmationDialog>
      )}
    </Paper>
  );
}
