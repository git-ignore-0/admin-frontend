"use client";

import {
  Alert,
  Box,
  Button,
  Drawer,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Textarea,
  VisuallyHidden,
} from "@mantine/core";
import { matchMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
import { Status } from "@/components/nfv-controls";
import { recordDetailDrawer } from "@/components/record-detail-drawer";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { SupplyRequestProducts } from "@/components/supply-request-products";
import { useToast } from "@/components/toast-provider";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import {
  apiErrorContext,
  isApiObject,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import {
  farmDeleteSupplyWriteFilters,
  farmSupplyDecisionWriteKey,
  isFarmGone,
  retryFarmAccess,
  useFarmAccess,
  useFarmDeleteBlocksWrite,
} from "@/lib/farm-query";
import type { AdminSupplyRequest, SupplyRequestStatus } from "@/lib/farm-supply-request-api";
import { farmSupplyRequestCopy } from "@/lib/farm-supply-request-copy";
import {
  farmSupplyRequestsPath,
  readSupplyRequestContext,
  supplyRequestHref,
} from "@/lib/farm-supply-request-navigation";
import {
  supplyRequestDetailOptions,
  useFarmSupplyDecision,
  type SupplyDecisionAction,
} from "@/lib/use-farm-supply-decision";

const statusColors = { pending: "pending", approved: "success", rejected: "danger" } as const;

export function SupplyRequestStatusBadge({ status }: { status: SupplyRequestStatus }) {
  const { locale } = useAdminI18n();
  return (
    <Status
      status={status}
      label={farmSupplyRequestCopy(locale).statuses[status]}
      color={statusColors[status]}
    />
  );
}

export function AdminSupplyRequestDetail({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose?: () => void;
}) {
  const client = useQueryClient();
  const sessionCurrent = useIsAdminQueryScopeCurrent();
  const { t, locale } = useAdminI18n();
  const copy = farmSupplyRequestCopy(locale);
  const access = useFarmAccess();
  const search = useSearchParams();
  const searchString = search?.toString() ?? "";
  const backHref = supplyRequestHref(readSupplyRequestContext(search));
  const title = t.breadcrumb.farmSupplyRequestDetails;
  const breadcrumbs = useMemo(
    () => [{ label: t.common.farmSupplyRequests, href: backHref }, { label: title }],
    [backHref, t.common.farmSupplyRequests, title],
  );
  const recordId = requestId.toLowerCase();
  const validId = UUID_PATH_SEGMENT.test(recordId);
  const query = useQuery({
    ...supplyRequestDetailOptions(client, sessionCurrent, recordId),
    enabled: validId && !access.error && sessionCurrent(),
  });
  const missing = !validId || (query.error as ClientApiError | null)?.status === 404;
  const item =
    query.data && !access.error && !missing && !isFarmGone(client, query.data.farm.id)
      ? query.data
      : undefined;
  const decision = useFarmSupplyDecision(recordId, item);
  const toast = useToast();
  const [dialog, setDialog] = useState<SupplyDecisionAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const headingId = useId();
  const reasonId = useId();
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  const approveButton = useRef<HTMLButtonElement>(null);
  const rejectButton = useRef<HTMLButtonElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const pending = decision.intent?.phase === "pending";
  const uncertain = decision.intent?.phase === "unknown";
  const blockedByDeletion = useFarmDeleteBlocksWrite(item?.farm.id ?? "");
  const decisionKey = farmSupplyDecisionWriteKey(item?.farm.id ?? "", recordId);
  const otherWritePending = useMutationState({
    filters: farmDeleteSupplyWriteFilters(item?.farm.id ?? ""),
    select: (entry) => !matchMutation({ mutationKey: decisionKey, exact: true }, entry),
  }).some(Boolean);
  const blocked = blockedByDeletion || otherWritePending;
  const actionsVisible = item?.status === "pending" && !access.error;
  const activeDialog = !access.error && !uncertain && (actionsVisible || pending) ? dialog : null;
  const canClose = !activeDialog && !pending;
  const error = access.error
    ? t.common.forbidden
    : missing
      ? copy.unavailable
      : query.error
        ? requestErrorMessage(query.error, t)
        : "";
  const report = decision.report;
  const reportError =
    report?.kind === "error" ? decisionError(report.error, item, locale, t) : undefined;

  useEffect(() => {
    if (!onClose) pageHeading.current?.focus({ preventScroll: true });
  }, [onClose]);
  useEffect(() => {
    if (access.error) {
      setDialog(null);
      setReason("");
      setReasonError(false);
    }
  }, [access.error]);
  useEffect(() => {
    if (report?.kind === "confirmed") {
      setDialog(null);
      setReason("");
      toast(report.action === "approve" ? copy.approved : copy.rejected);
    } else if (report?.kind === "processed" || uncertain) {
      setDialog(null);
    }
  }, [report, uncertain, toast, copy.approved, copy.rejected]);

  function reload() {
    if (access.error) retryFarmAccess(client);
    else if (validId) void query.refetch();
  }

  function open(action: SupplyDecisionAction) {
    decision.setReport(undefined);
    setReasonError(false);
    returnFocusRef.current = action === "approve" ? approveButton.current : rejectButton.current;
    setDialog(action);
  }

  function confirm() {
    if (!actionsVisible || blocked) return;
    if (activeDialog === "approve") void decision.run("approve");
    if (activeDialog === "reject") {
      const trimmed = reason.trim();
      if (!trimmed || Array.from(trimmed).length > 500) {
        setReasonError(true);
        reasonInput.current?.focus();
        return;
      }
      void decision.run("reject", trimmed);
    }
  }

  const heading = item && (
    <Text {...recordDetailDrawer.metadata} style={{ overflowWrap: "anywhere" }}>
      {item.code}
    </Text>
  );
  const content = (
    <Stack gap="md" miw={0}>
      {report?.kind === "processed" && (
        <Alert color="info" role="status">
          {copy.processedElsewhere}
        </Alert>
      )}
      {uncertain && item && (
        <Alert color="warning" role="status">
          <Stack gap="xs">
            <Text>{report?.kind === "pending" ? copy.pendingAfterCheck : copy.uncertain}</Text>
            {reportError && <Text>{reportError}</Text>}
            <Group gap="xs">
              <Button
                variant="default"
                onClick={() => void decision.checkStatus()}
                loading={decision.checking}
              >
                {copy.checkStatus}
              </Button>
              <Button
                variant="default"
                disabled={blocked || decision.checking || item.status !== "pending"}
                onClick={() => void decision.run()}
              >
                {copy.retryDecision}
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}
      {!activeDialog && !uncertain && reportError && (
        <Alert color="danger" role="alert">
          {reportError}
        </Alert>
      )}
      {blocked && actionsVisible && (
        <Alert color="info" role="status">
          {copy.cannotWrite}
        </Alert>
      )}
      <ListState
        hasData={Boolean(item)}
        isEmpty={false}
        loading={validId && !access.error && query.isFetching && !item}
        loadingLabel={copy.loading}
        loadingPlaceholder={
          <Paper p="md">
            <Stack gap="sm">
              <Skeleton h={16} w="35%" />
              <Skeleton h={60} />
            </Stack>
          </Paper>
        }
        error={error}
        empty={copy.unavailable}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {item && (
        <>
          <Paper component="section" p="md">
            <Stack gap="md">
              <Text component="h2" fw={600} m={0}>
                {copy.info}
              </Text>
              <RecordDetailFields>
                <RecordDetailField label={copy.farm}>
                  {locale === "vi" ? item.farm.name_vi : item.farm.name_en}
                </RecordDetailField>
                <RecordDetailField label={copy.period}>
                  {formatAdminDate(item.start_date)} – {formatAdminDate(item.end_date)}
                </RecordDetailField>
                <RecordDetailField label={copy.submitted}>
                  {formatAdminDateTime(item.submitted_at)}
                </RecordDetailField>
                <RecordDetailField label={copy.status}>
                  <SupplyRequestStatusBadge status={item.status} />
                </RecordDetailField>
                {item.processed_at && (
                  <RecordDetailField label={copy.processed}>
                    {formatAdminDateTime(item.processed_at)}
                  </RecordDetailField>
                )}
                {item.rejection_reason && (
                  <RecordDetailField label={copy.reason}>{item.rejection_reason}</RecordDetailField>
                )}
              </RecordDetailFields>
            </Stack>
          </Paper>
          <DataListPaper component="section">
            <Box px="md" py="sm">
              <Text component="h2" fw={600} m={0}>
                {copy.products}
              </Text>
            </Box>
            <SupplyRequestProducts items={item.items} locale={locale} />
          </DataListPaper>
        </>
      )}
    </Stack>
  );

  const actions = actionsVisible && !uncertain && (
    <Group component="footer" {...recordDetailDrawer.footer}>
      <Button
        ref={rejectButton}
        color="danger"
        variant="subtle"
        disabled={blocked || pending || query.isFetching || Boolean(query.error)}
        onClick={() => open("reject")}
      >
        {copy.reject}
      </Button>
      <Button
        ref={approveButton}
        disabled={blocked || pending || query.isFetching || Boolean(query.error)}
        onClick={() => open("approve")}
      >
        {copy.approve}
      </Button>
    </Group>
  );

  if (!sessionCurrent()) return null;
  return (
    <>
      {onClose ? (
        <Drawer.Root
          {...recordDetailDrawer.root}
          opened
          onClose={() => {
            if (canClose) onClose();
          }}
          trapFocus={!activeDialog}
          closeOnClickOutside={canClose}
          closeOnEscape={canClose}
        >
          <Drawer.Overlay />
          <Drawer.Content inert={Boolean(activeDialog) || undefined}>
            <Drawer.Header>
              <Stack {...recordDetailDrawer.identity}>
                <Drawer.Title>{title}</Drawer.Title>
                {heading}
              </Stack>
              <Drawer.CloseButton
                {...recordDetailDrawer.closeButton}
                ref={drawerClose}
                data-autofocus
                aria-label={t.common.close}
                disabled={!canClose}
              />
            </Drawer.Header>
            <Drawer.Body>{content}</Drawer.Body>
            {actions}
          </Drawer.Content>
        </Drawer.Root>
      ) : (
        <>
          <AdminBreadcrumbForRoute
            pathname={`${farmSupplyRequestsPath}/${encodeURIComponent(requestId)}`}
            search={searchString}
            items={breadcrumbs}
          />
          <Stack
            component="article"
            gap="md"
            miw={0}
            inert={Boolean(activeDialog) || undefined}
            aria-labelledby={headingId}
          >
            <VisuallyHidden component="h1" ref={pageHeading} id={headingId} tabIndex={-1}>
              {title}
            </VisuallyHidden>
            {heading}
            {content}
            {actions}
          </Stack>
        </>
      )}
      {activeDialog && (
        <ConfirmationDialog
          title={activeDialog === "approve" ? copy.approveTitle : copy.rejectTitle}
          cancelLabel={copy.cancel}
          confirmLabel={activeDialog === "approve" ? copy.approve : copy.reject}
          busyLabel={copy.saving}
          busy={pending}
          size="md"
          danger={activeDialog === "reject"}
          returnFocusRef={returnFocusRef}
          fallbackFocusRef={onClose ? drawerClose : pageHeading}
          confirmDisabled={blocked}
          error={reportError}
          onCancel={() => {
            setDialog(null);
            decision.setReport(undefined);
          }}
          {...(activeDialog === "reject" ? { formId: reasonId } : { onConfirm: confirm })}
        >
          <Text>
            {activeDialog === "approve" ? copy.approveDescription : copy.rejectDescription}
          </Text>
          {activeDialog === "reject" && (
            <form
              id={reasonId}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                confirm();
              }}
            >
              <Textarea
                data-autofocus
                ref={reasonInput}
                label={copy.reason}
                maxLength={500}
                value={reason}
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                  setReasonError(false);
                }}
                error={reasonError ? copy.reasonError : undefined}
                required
                disabled={pending}
                minRows={3}
                autosize
              />
            </form>
          )}
        </ConfirmationDialog>
      )}
    </>
  );
}

function decisionError(
  error: unknown,
  item: AdminSupplyRequest | undefined,
  locale: "vi" | "en",
  t: ReturnType<typeof useAdminI18n>["t"],
) {
  const copy = farmSupplyRequestCopy(locale);
  const code = error instanceof Error ? error.message : "";
  if (code === "farm_supply_request_processed") return copy.processingConflict;
  const label = Object.entries(copy.conflict).find(([key]) => key === code)?.[1];
  if (!label) return requestErrorMessage(error, t, copy.fields);
  const context = apiErrorContext<unknown>(error);
  const product =
    isApiObject(context) && typeof context.product_id === "string"
      ? item?.items.find(({ product_id }) => product_id === context.product_id)
      : undefined;
  const productName = product && (locale === "vi" ? product.name_vi : product.name_en);
  return productName ? `${productName} · ${label}` : label;
}
