"use client";

import { ActionIcon, Group, Image, Menu, Stack, Tabs, Text, Title } from "@mantine/core";
import { IconDots } from "@tabler/icons-react";
import {
  CancelledError,
  useIsMutating,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmFarmerLink } from "@/components/farm-farmer-link";
import { FarmDeleteReasons } from "@/components/farm-delete-reasons";
import {
  FarmInformation,
  sameFarmInformation,
  type FarmInformationHandle,
} from "@/components/farm-editor";
import { FarmProducts } from "@/components/farm-products";
import { FarmSourceDetail } from "@/components/farm-source-detail";
import { DataState, Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useFarmDeletion } from "@/components/use-farm-deletion";
import { invalidApiResponse, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import {
  farmDetailTabs,
  farmHref,
  readFarmDetailTab,
  type FarmDetailTab,
} from "@/lib/farm-navigation";
import {
  captureFarmDetail,
  farmDetailNeedsRead,
  farmDetailRead,
  publishFarmDetail,
  shareFarmDetail,
  verifiedFarmDetail,
} from "@/lib/farm-detail-snapshot";
import {
  confirmFarmGone,
  farmAccess,
  farmAccessDenied,
  farmDeleteBlocksWrite,
  farmDeleteFilters,
  farmDeleteSupplyWriteFilters,
  farmDetailKey,
  farmDetailWriteFilters,
  farmDetailWritePending,
  farmListKey,
  farmNotFound,
  farmSupplyKey,
  holdFarmDetailWrite,
  isFarmGone,
  retireFarmAccess,
  retireFarmQueries,
  retryFarmAccess,
  useFarmAccess,
  useFarmFarmerLinkBlocksDelete,
} from "@/lib/farm-query";
import { farmDeleteCapability, getFarm, saveFarm } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { mediaUrlForWidth } from "@/lib/media";
import type { Farm } from "@/lib/types";

type Props = { farmId: string; productId?: string };
type FarmAction = "delete" | "activate" | "deactivate";
type HeaderIntent = { action: FarmAction; before: Farm };
type HeaderRecovery = { intent: HeaderIntent; conflict: boolean };

export function FarmDetail({ farmId, productId }: Props) {
  return (
    <FarmDetailContent key={`${farmId}:${productId ?? ""}`} farmId={farmId} productId={productId} />
  );
}

function FarmDetailContent({ farmId, productId }: Props) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const router = useRouter();
  const search = useSearchParams();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const queryClient = useQueryClient();
  const access = useFarmAccess();
  const tab = readFarmDetailTab(search);
  const [visited, setVisited] = useState({
    products: tab === "products",
    information: tab === "information",
  });
  const [unavailable, setUnavailable] = useState<{ cause: unknown } | null>(null);
  const [actionError, setActionError] = useState("");
  const [dialog, setDialog] = useState<HeaderIntent | null>(null);
  const [headerRecovery, setHeaderRecovery] = useState<HeaderRecovery | null>(null);
  const [busyOwner, setBusyOwner] = useState<"header" | "information" | null>(null);
  const [informationLocked, setInformationLocked] = useState(false);
  const [ownToggle, setOwnToggle] = useState<{ from: number; to: number }>();
  const mounted = useRef(false);
  const mutation = useRef<"header" | "information" | null>(null);
  const recordEpoch = useRef(0);
  const deleteNavigation = useRef(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const information = useRef<FarmInformationHandle>(null);
  const detailKey = farmDetailKey(farmId);
  const deletionFlow = useFarmDeletion(farmId);
  const detailWriting = useIsMutating(farmDetailWriteFilters(farmId)) > 0;
  const linkBlocksDelete = useFarmFarmerLinkBlocksDelete(farmId);
  const supplyWrites = farmDeleteSupplyWriteFilters(farmId);
  const supplyWriting = useMutationState({ filters: supplyWrites, select: () => true }).length > 0;
  const farmQuery = useQuery({
    queryKey: detailKey,
    queryFn: async ({ signal }) => {
      try {
        const before = captureFarmDetail(queryClient, farmId);
        const row = await getFarm(farmId, signal);
        if (signal.aborted || !isCurrent() || isFarmGone(queryClient, farmId))
          throw new CancelledError();
        return farmDetailRead(row, before);
      } catch (cause) {
        if (isCurrent() && farmAccessDenied(cause)) retireFarmAccess(queryClient, cause);
        throw cause;
      }
    },
    enabled: !access.error && !unavailable && isCurrent() && !isFarmGone(queryClient, farmId),
    // Leaf navigation shares this parent snapshot. Focus and reconnect still revalidate it.
    structuralSharing: shareFarmDetail,
    refetchOnMount: (query) => farmDetailNeedsRead(query.state),
  });
  const gone = farmQuery.data === null || isFarmGone(queryClient, farmId);
  const error = access.error ?? unavailable?.cause ?? farmQuery.error;
  const farm =
    isCurrent() && !access.error && !unavailable && !gone && !recordUnavailable(farmQuery.error)
      ? farmQuery.data
      : null;
  const name = farm ? (locale === "vi" ? farm.name_vi : farm.name_en) : "";
  const listHref = farmHref(search);
  const items = useMemo(() => {
    const list = { label: c.list, href: listHref };
    if (!productId) return [list, { label: name || t.breadcrumb.farmDetails }];
    return [list, { label: t.breadcrumb.productDetails }];
  }, [c.list, listHref, name, productId, t.breadcrumb.farmDetails, t.breadcrumb.productDetails]);
  const breadcrumb = (
    <AdminBreadcrumbForRoute
      pathname={farmHref(null, { id: farmId, productId })}
      search={search?.toString() ?? ""}
      items={items}
    />
  );

  const retireRecord = useCallback(
    (cause: unknown) => {
      if (!isCurrent()) return;
      if (farmAccessDenied(cause)) retireFarmAccess(queryClient, cause);
      if (!mounted.current) return;
      recordEpoch.current += 1;
      setDialog(null);
      setHeaderRecovery(null);
      if (!farmAccessDenied(cause)) {
        if (
          farmNotFound(cause) &&
          (deleteNavigation.current ||
            queryClient.getMutationCache().find(farmDeleteFilters(farmId)))
        ) {
          deleteNavigation.current = true;
          confirmFarmGone(queryClient, farmId);
        } else {
          setUnavailable({ cause });
          retireFarmQueries(queryClient, farmId);
        }
      }
    },
    [farmId, isCurrent, queryClient],
  );

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setVisited((current) => (current[tab] ? current : { ...current, [tab]: true }));
  }, [tab]);
  useEffect(() => {
    if (!access.error && !unavailable && isCurrent() && recordUnavailable(farmQuery.error)) {
      retireRecord(farmQuery.error);
    }
  }, [access.error, farmQuery.error, isCurrent, retireRecord, unavailable]);

  useEffect(() => {
    if (!access.error) return;
    setDialog(null);
    setHeaderRecovery(null);
    setActionError("");
  }, [access.error]);

  useEffect(() => {
    if (productId) return;
    if (gone) {
      if (deleteNavigation.current && isCurrent() && !access.error) router.replace(listHref);
      deleteNavigation.current = false;
    } else if (deletionFlow.pending || deletionFlow.issue?.kind === "uncertain") {
      deleteNavigation.current = true;
    }
  }, [
    access.error,
    deletionFlow.issue,
    deletionFlow.pending,
    gone,
    isCurrent,
    listHref,
    productId,
    router,
  ]);

  const reload = () => {
    if (access.error) retryFarmAccess(queryClient);
    else if (unavailable) setUnavailable(null);
    else void farmQuery.refetch();
  };

  function claimWrite(owner: "header" | "information", checking = false) {
    if (
      !mounted.current ||
      !isCurrent() ||
      farmAccess(queryClient).error ||
      mutation.current ||
      farmDetailWritePending(queryClient, farmId) ||
      (!checking && farmDeleteBlocksWrite(queryClient, farmId)) ||
      (owner === "header" && informationLocked && !checking)
    )
      return;
    const releaseLease = holdFarmDetailWrite(queryClient, farmId);
    mutation.current = owner;
    setBusyOwner(owner);
    return () => {
      releaseLease();
      mutation.current = null;
      if (mounted.current) setBusyOwner(null);
    };
  }

  function writeScope() {
    const epoch = recordEpoch.current;
    const permitted = () =>
      isCurrent() &&
      farmAccess(queryClient).revision === access.revision &&
      !farmAccess(queryClient).error &&
      !isFarmGone(queryClient, farmId);
    return {
      permitted,
      current: () => mounted.current && permitted() && recordEpoch.current === epoch,
    };
  }

  async function adoptHeaderSnapshot(
    snapshot: Farm,
    intent: HeaderIntent,
    current: () => boolean,
    started: ReturnType<typeof captureFarmDetail>,
    type: "read" | "write",
  ) {
    if (!current()) return;
    const cached = queryClient.getQueryData<Farm>(detailKey);
    const own = (!cached || cached.version <= snapshot.version) && confirmsToggle(snapshot, intent);
    if (own) setOwnToggle({ from: intent.before.version, to: snapshot.version });
    publishFarmDetail(queryClient, snapshot, started, type);
    void queryClient.invalidateQueries({ queryKey: farmListKey });
    void queryClient.invalidateQueries({ queryKey: farmSupplyKey(farmId) });
    if (own) await information.current?.syncTracker();
    if (!current()) return;
    setHeaderRecovery(null);
    setActionError(own ? "" : c.conflict);
  }

  function currentDeleteCapability() {
    return farmDeleteCapability(verifiedFarmDetail(queryClient, farmId)?.capabilities);
  }

  async function changeFarm(intent: HeaderIntent) {
    if (!farm || headerRecovery) return;
    const started = captureFarmDetail(queryClient, farmId);
    const latest = started?.data;
    if (intent.action === "delete") {
      if (
        mutation.current ||
        informationLocked ||
        !latest ||
        currentDeleteCapability()?.allowed !== true
      )
        return;
      if (latest.version !== intent.before.version) {
        setDialog({ ...intent, before: latest });
        setActionError(c.deleteReviewChanged);
        return;
      }
      const operation = deletionFlow.run("delete");
      if (!operation) return;
      deleteNavigation.current = true;
      setActionError("");
      const { current } = writeScope();
      const result = await operation;
      if (current()) {
        if (result.issue?.kind !== "uncertain") deleteNavigation.current = false;
        if (result.rejection) setActionError(requestErrorMessage(result.rejection, t));
      }
      return;
    }
    const release = claimWrite("header");
    if (!release) return;
    const { permitted, current } = writeScope();
    setActionError("");
    try {
      if (latest?.version !== intent.before.version) {
        setDialog(null);
        setHeaderRecovery({ intent, conflict: true });
        setActionError(c.conflict);
        return;
      }
      const updated = await saveFarm(farm.id, {
        version: intent.before.version,
        is_active: intent.action === "activate",
      });
      if (!permitted()) return;
      if (!confirmsToggle(updated, intent)) throw invalidApiResponse();
      if (!current()) {
        publishFarmDetail(queryClient, updated, started, "write");
        void queryClient.invalidateQueries({ queryKey: farmListKey });
        void queryClient.invalidateQueries({ queryKey: farmSupplyKey(farm.id) });
        return;
      }
      await adoptHeaderSnapshot(updated, intent, current, started, "write");
      if (current()) setDialog(null);
    } catch (cause) {
      if (farmAccessDenied(cause)) {
        retireRecord(cause);
        return;
      }
      if (!current()) return;
      if (recordUnavailable(cause)) {
        retireRecord(cause);
        return;
      }
      const problem = cause as ClientApiError | undefined;
      const conflict = problem?.status === 409;
      const unknown =
        !problem?.status ||
        problem.status === 404 ||
        problem.status === 408 ||
        problem.status >= 500 ||
        problem.message === "request_timeout" ||
        problem.message === "invalid_response";
      if (conflict && problem?.message === "stock_reserved") {
        setActionError(c.deactivateBlocked);
      } else if (conflict || unknown) {
        setDialog(null);
        setHeaderRecovery({ intent, conflict });
        setActionError(conflict ? c.conflict : c.saveUncertain);
      } else {
        setActionError(requestErrorMessage(cause, t));
      }
    } finally {
      release();
    }
  }

  async function checkHeader() {
    if (!headerRecovery) return;
    const release = claimWrite("header", true);
    if (!release) return;
    const { current } = writeScope();
    const { intent, conflict } = headerRecovery;
    const started = captureFarmDetail(queryClient, farmId);
    try {
      const snapshot = await getFarm(farmId);
      if (!current()) return;
      if (
        snapshot.version < intent.before.version ||
        (!conflict && snapshot.version === intent.before.version)
      ) {
        setActionError(c.saveStillUncertain);
        return;
      }
      await adoptHeaderSnapshot(snapshot, intent, current, started, "read");
    } catch (cause) {
      if (farmAccessDenied(cause)) {
        retireRecord(cause);
        return;
      }
      if (!current()) return;
      if (farmNotFound(cause)) {
        retireRecord(cause);
      } else {
        setActionError(requestErrorMessage(cause, t));
      }
    } finally {
      release();
    }
  }

  const recovery = gone ? (
    <Text role="status">{c.farmMissing}</Text>
  ) : (
    error && (
      <RecoveryAlert
        message={farmNotFound(error) ? c.farmMissing : requestErrorMessage(error, t)}
        retryLabel={t.common.retry}
        onRetry={reload}
      />
    )
  );
  if (!farm)
    return (
      <>
        {breadcrumb}
        <PageHeading
          title={productId ? t.breadcrumb.productDetails : t.breadcrumb.farmDetails}
          visuallyHiddenTitle
        />
        {!isCurrent() ? (
          <RecoveryAlert
            message={t.common.sessionChanged}
            retryLabel={t.common.reloadPage}
            onRetry={() => window.location.reload()}
          />
        ) : (
          (recovery ?? <DataState kind="loading" title={c.loading} />)
        )}
      </>
    );
  const { pending: deleting, issue: deleteIssue } = deletionFlow;
  const uncertainDelete = deleteIssue?.kind === "uncertain";
  const rejectedDelete = deleteIssue?.rejection;
  const deleteMessage =
    [
      uncertainDelete ? c.deleteOutcomeUnknown : "",
      rejectedDelete?.code === "farm_delete_protected"
        ? c.deleteProtectedDependency
        : rejectedDelete && !uncertainDelete
          ? c.deleteConflict
          : "",
    ]
      .filter(Boolean)
      .join(" ") || c.deleteUnverified;
  function checkDelete() {
    const operation = deletionFlow.run("verify");
    if (!operation) return;
    if (!productId) deleteNavigation.current = true;
    void operation.then(({ issue }) => {
      if (issue?.kind !== "uncertain" && !isFarmGone(queryClient, farmId)) {
        deleteNavigation.current = false;
      }
    });
  }
  if (productId) {
    return (
      <>
        {(deleting || deleteIssue) &&
          (deleting ? (
            <DataState kind="loading" title={c.loading} />
          ) : (
            <RecoveryAlert
              message={deleteMessage}
              retryLabel={c.checkLatestFarm}
              onRetry={checkDelete}
            />
          ))}
        <FarmSourceDetail farm={farm} productId={productId} onAccessLost={retireRecord} />
      </>
    );
  }

  const labels: Record<FarmDetailTab, string> = {
    products: c.productsAndSupply,
    information: c.overview,
  };
  const location = locale === "vi" ? farm.location_vi : farm.location_en;
  const activate = farm.is_active ? "deactivate" : "activate";
  const actionLabel = (action: FarmAction) =>
    action === "delete" ? c.farmDelete : action === "activate" ? c.activate : c.deactivate;
  const actionPrompt = (action: FarmAction) =>
    (action === "delete"
      ? c.deleteFarmPrompt
      : action === "activate"
        ? c.activatePrompt
        : c.deactivatePrompt
    ).replace("{name}", name);
  const headerLocked =
    detailWriting || deleting || Boolean(headerRecovery || error || uncertainDelete);
  const actionsDisabled = busyOwner !== null || headerLocked || informationLocked;
  const deleteDialog = dialog?.action === "delete";
  const deletion =
    deleteDialog && !supplyWriting && !linkBlocksDelete ? currentDeleteCapability() : undefined;
  const canReviewDelete = !deleting && deletionFlow.mayConfirmAgain;
  const canReopenDelete =
    canReviewDelete &&
    currentDeleteCapability()?.allowed === true &&
    !supplyWriting &&
    !linkBlocksDelete;
  const canConfirmDelete =
    deletion?.allowed === true && !deleting && (!deleteIssue || canReviewDelete);
  const canConfirmDialog = !deleteDialog || canConfirmDelete;
  const rejectedReasons =
    deleteIssue?.verification === "failed" ? rejectedDelete?.reasons : undefined;
  const open = (action: FarmAction) => {
    if (actionsDisabled || mutation.current) return;
    setActionError("");
    setDialog({ action, before: farm });
  };
  const reviewDelete = () => {
    setActionError("");
    setDialog({ action: "delete", before: farm });
  };
  return (
    <>
      {breadcrumb}
      <Stack gap="md" miw={0}>
        <Group component="header" gap="sm" align="flex-start" wrap="nowrap">
          {farm.image && (
            <Image
              component={NextImage}
              alt=""
              src={mediaUrlForWidth(farm.image, 160)}
              width={72}
              height={60}
              w={72}
              h={60}
              flex="0 0 auto"
              radius="md"
              fit="cover"
              unoptimized
            />
          )}
          <Stack gap="xs" miw={0} flex={1}>
            <Title ref={heading} tabIndex={-1} order={1} style={{ overflowWrap: "anywhere" }}>
              {name}
            </Title>
            {location && (
              <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                {location}
              </Text>
            )}
            <Group gap="xs">
              <Status
                status={farm.is_active ? "active" : "inactive"}
                label={farm.is_active ? c.active : c.inactive}
                color={farm.is_active ? "success" : "neutral"}
              />
            </Group>
          </Stack>
          <Menu position="bottom-end" returnFocus>
            <Menu.Target>
              <ActionIcon
                ref={menuTrigger}
                flex="0 0 auto"
                variant="default"
                aria-label={c.moreActions}
                disabled={actionsDisabled}
              >
                <IconDots size={18} aria-hidden />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => open(activate)}>{actionLabel(activate)}</Menu.Item>
              <Menu.Item color="danger" onClick={() => open("delete")}>
                {c.farmDelete}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
        {!deleteDialog && recovery}
        {!deleteDialog &&
          (deleting || deleteIssue) &&
          (deleting ? (
            <DataState kind="loading" title={c.loading} />
          ) : (
            <RecoveryAlert
              message={deleteMessage}
              retryLabel={canReopenDelete ? c.reviewDelete : c.checkLatestFarm}
              onRetry={canReopenDelete ? reviewDelete : checkDelete}
            />
          ))}
        {headerRecovery ? (
          <RecoveryAlert
            message={actionError}
            retryLabel={c.checkLatestFarm}
            onRetry={() => void checkHeader()}
            loading={busyOwner === "header"}
          />
        ) : actionError && !dialog ? (
          <Text size="sm" c="danger" role="alert">
            {actionError}
          </Text>
        ) : null}
        <Tabs
          value={tab}
          onChange={(value) => {
            if (value === "products" || value === "information") {
              router.push(farmHref(search, { id: farm.id, tab: value }), { scroll: false });
            }
          }}
        >
          <Tabs.List mb="md" aria-label={c.detailSections}>
            {farmDetailTabs.map((value) => (
              <Tabs.Tab key={value} value={value} px="sm">
                {labels[value]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="products">
            {(visited.products || tab === "products") && (
              <FarmProducts
                farm={farm}
                isTabActive={tab === "products"}
                onAccessLost={retireRecord}
              />
            )}
          </Tabs.Panel>
          <Tabs.Panel value="information">
            <Stack gap="md">
              {tab === "information" && (
                <FarmFarmerLink
                  key={farm.id}
                  farmId={farm.id}
                  writeBlocked={headerLocked || Boolean(dialog)}
                  claimWrite={() => claimWrite("information")}
                  onAccessLost={retireRecord}
                />
              )}
              {(visited.information || tab === "information") && (
                <FarmInformation
                  ref={information}
                  farm={farm}
                  active={tab === "information"}
                  headerLocked={headerLocked || Boolean(dialog)}
                  ownToggle={ownToggle}
                  claimWrite={() => claimWrite("information")}
                  setInformationLocked={setInformationLocked}
                  onAccessLost={retireRecord}
                />
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
      {dialog && (
        <ConfirmationDialog
          title={actionLabel(dialog.action)}
          busy={busyOwner === "header" || (deleteDialog && deleting)}
          cancelLabel={canConfirmDialog ? c.cancel : t.common.close}
          {...(canConfirmDialog
            ? {
                busyLabel: c.saving,
                confirmLabel: deleteDialog ? c.confirmDeleteFarm : actionLabel(dialog.action),
                onConfirm: () => void changeFarm(dialog),
              }
            : { busyLabel: undefined, confirmLabel: undefined, onConfirm: undefined })}
          confirmDisabled={
            deleteDialog
              ? informationLocked || busyOwner !== null || detailWriting
              : actionsDisabled
          }
          danger={deleteDialog}
          error={actionError}
          returnFocusRef={menuTrigger}
          fallbackFocusRef={heading}
          onCancel={() => {
            setDialog(null);
            setActionError("");
          }}
        >
          {canConfirmDialog ? (
            <>
              {deleteDialog && canReviewDelete && (
                <RecoveryAlert
                  message={c.deleteOutcomeUnknown}
                  retryLabel={c.checkLatestFarm}
                  onRetry={checkDelete}
                />
              )}
              <Text>{actionPrompt(dialog.action)}</Text>
            </>
          ) : (
            <>
              {linkBlocksDelete ? (
                <Text>{c.deleteLinkUnconfirmed}</Text>
              ) : deleting || (farmQuery.isFetching && !deleteIssue) ? (
                <DataState kind="loading" title={c.loading} />
              ) : deleteIssue || !deletion ? (
                <RecoveryAlert
                  message={
                    deleteIssue
                      ? [
                          deleteMessage,
                          deleteIssue.verification === "failed" ? c.deleteUnverified : "",
                        ]
                          .filter(Boolean)
                          .join(" ")
                      : error
                        ? requestErrorMessage(error, t)
                        : c.deleteUnverified
                  }
                  retryLabel={c.checkLatestFarm}
                  onRetry={deleteIssue ? checkDelete : reload}
                />
              ) : null}
              {deletion?.allowed === false && deleteIssue?.verification !== "failed" && (
                <>
                  <Text>{c.protectedFarm}</Text>
                  <FarmDeleteReasons farmId={farm.id} search={search} reasons={deletion.reasons} />
                  <Text size="sm" c="dimmed">
                    {c.deleteRepresentativeReasons}
                  </Text>
                </>
              )}
              {rejectedReasons && (
                <>
                  <Text>{c.deletePreviousReasons}</Text>
                  <FarmDeleteReasons farmId={farm.id} search={search} reasons={rejectedReasons} />
                  <Text size="sm" c="dimmed">
                    {c.deleteRepresentativeReasons}
                  </Text>
                </>
              )}
            </>
          )}
        </ConfirmationDialog>
      )}
    </>
  );
}

function confirmsToggle(farm: Farm, intent: HeaderIntent) {
  return (
    farm.id.toLowerCase() === intent.before.id.toLowerCase() &&
    farm.version === intent.before.version + 1 &&
    farm.is_active === (intent.action === "activate") &&
    sameFarmInformation(farm, intent.before)
  );
}

function recordUnavailable(cause: unknown) {
  return farmAccessDenied(cause) || farmNotFound(cause);
}
