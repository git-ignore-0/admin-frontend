"use client";

import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import {
  useAdminRecordScope,
  useIsAdminQueryScopeCurrent,
} from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { isUncertainMutationError, requestErrorMessage } from "@/lib/client-error";
import {
  farmAccess,
  farmAccessDenied,
  farmDeleteBlocksWrite,
  farmNotFound,
  isFarmGone,
  retireFarmAccess,
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

type LinkState = { url?: string | null; error?: unknown; unknown?: boolean; unchanged?: boolean };

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
  const [state, setState] = useState<LinkState>({});
  const [active, setActive] = useState<"read" | "create" | "rotate">("read");
  const [busy, setBusy] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const write = useRef(false);
  const previousUrl = useRef<string | null>(null);
  const accessRevision = farmAccess(client).revision;
  const farmCurrent = useCallback(
    () =>
      sessionCurrent() &&
      !isFarmGone(client, farmId) &&
      farmAccess(client).revision === accessRevision &&
      !farmAccess(client).error,
    [accessRevision, client, farmId, sessionCurrent],
  );

  const retire = useCallback(
    (cause: unknown) => {
      if (!farmCurrent()) return;
      if (scope.capture()()) {
        previousUrl.current = null;
        setState({});
        setConfirm(false);
      }
      scope.retire();
      if (farmAccessDenied(cause)) retireFarmAccess(client, cause);
      onAccessLost(cause);
    },
    [client, farmCurrent, onAccessLost, scope],
  );

  const read = useCallback(
    async (recovering = false) => {
      const operation = scope.beginRead();
      const current = () => operation.current() && farmCurrent();
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
        setState({ url, unchanged: recovering && url === previousUrl.current });
        previousUrl.current = null;
      } catch (cause) {
        if (farmAccessDenied(cause)) retire(cause);
        if (current()) setState({ error: cause, unknown: recovering });
      } finally {
        if (current()) setBusy(false);
      }
    },
    [farmCurrent, farmId, retire, scope],
  );

  useEffect(() => {
    void read();
  }, [read]);

  async function update(action: "create" | "rotate") {
    const current = scope.capture();
    if (
      write.current ||
      busy ||
      writeBlocked ||
      !current() ||
      !farmCurrent() ||
      farmDeleteBlocksWrite(client, farmId)
    )
      return;
    const release = claimWrite();
    if (!release) return;
    write.current = true;
    setActive(action);
    setBusy(true);
    try {
      const result = await farmerLink(farmId, action);
      if (!current() || !farmCurrent()) return;
      setState({ url: result.url });
      setConfirm(false);
      toast(action === "rotate" ? c.rotated : c.created);
    } catch (cause) {
      if (farmAccessDenied(cause)) {
        retire(cause);
        return;
      }
      if (!current() || !farmCurrent()) return;
      if (
        isUncertainMutationError(cause) ||
        farmNotFound(cause) ||
        (cause instanceof Error && cause.message === "farm_farmer_link_unreadable")
      ) {
        previousUrl.current = state.url ?? null;
        setConfirm(false);
        setState({ unknown: true });
        await read(true);
      } else {
        setState({ url: state.url, error: cause });
      }
    } finally {
      write.current = false;
      release();
      if (current() && farmCurrent()) setBusy(false);
    }
  }

  const absoluteUrl =
    state.url && typeof window !== "undefined"
      ? new URL(state.url, window.location.origin).href
      : "";
  async function copy() {
    const current = scope.capture();
    if (!absoluteUrl || !current() || !farmCurrent()) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      if (current() && farmCurrent()) toast(c.copied);
    } catch {
      if (current() && farmCurrent()) toast(c.copyFailed, "error");
    }
  }

  const blocked = busy || writeBlocked || !farmCurrent();
  const problem = state.unknown
    ? c.unknown
    : state.error
      ? requestErrorMessage(state.error, t)
      : "";
  return (
    <Paper component="section" aria-label={c.heading} p="md" withBorder miw={0}>
      <Stack gap="sm">
        <Stack gap="xs">
          <Title order={2} size="sm" fw={600}>
            {c.heading}
          </Title>
          <Text size="sm" c="dimmed">
            {c.description}
          </Text>
        </Stack>
        {busy && state.url === undefined && <Skeleton h={36} />}
        {state.unchanged && (
          <Alert color="blue" role="status">
            {c.unchanged}
          </Alert>
        )}
        {problem && !confirm && (
          <RecoveryAlert
            message={problem}
            retryLabel={c.read}
            loading={active === "read" && busy}
            onRetry={() => {
              if (!busy) void read(Boolean(state.unknown));
            }}
          />
        )}
        {state.url === null && (
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
              flex={1}
              miw={140}
            />
            <Tooltip label={c.copy}>
              <ActionIcon
                aria-label={c.copy}
                type="button"
                disabled={busy}
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
                setState({ url: state.url });
                setConfirm(true);
              }}
            >
              {c.rotate}
            </Button>
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
