"use client";

import { ActionIcon, Group, Image, Menu, Stack, Tabs, Text, Title } from "@mantine/core";
import { IconDots } from "@tabler/icons-react";
import { CancelledError, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
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
import {
  invalidApiResponse,
  isApiObject,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import {
  farmDetailTabs,
  farmHref,
  readFarmDetailTab,
  type FarmDetailTab,
} from "@/lib/farm-navigation";
import {
  farmAccess,
  farmAccessDenied,
  farmDeleteSupplyWriteFilters,
  farmDetailKey,
  farmListKey,
  farmSupplyKey,
  retireFarmAccess,
  retireFarmQueries,
  retryFarmAccess,
  useFarmAccess,
} from "@/lib/farm-query";
import { deleteFarm, farmDeleteCapability, getFarm, saveFarm } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { mediaUrlForWidth } from "@/lib/media";
import type { Farm } from "@/lib/types";

type Props = { farmId: string; productId?: string };
type FarmAction = "delete" | "activate" | "deactivate";
type HeaderIntent = { action: FarmAction; before: Farm };
type HeaderRecovery = { intent: HeaderIntent; conflict: boolean };
type DeleteRecovery = { before: Farm; conflict: boolean; message: string };

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
  const [deleteRecovery, setDeleteRecovery] = useState<DeleteRecovery | null>(null);
  const [busyOwner, setBusyOwner] = useState<"header" | "information" | null>(null);
  const [informationLocked, setInformationLocked] = useState(false);
  const [ownToggle, setOwnToggle] = useState<{ from: number; to: number }>();
  const mounted = useRef(false);
  const mutation = useRef<"header" | "information" | null>(null);
  const recordEpoch = useRef(0);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const information = useRef<FarmInformationHandle>(null);
  const detailKey = farmDetailKey(farmId);
  const supplyWrites = farmDeleteSupplyWriteFilters(farmId);
  const supplyWriting = useMutationState({ filters: supplyWrites, select: () => true }).length > 0;
  const farmQuery = useQuery({
    queryKey: detailKey,
    queryFn: async ({ signal }) => {
      try {
        const row = await getFarm(farmId, signal);
        if (signal.aborted || !isCurrent()) throw new CancelledError();
        return row;
      } catch (cause) {
        if (isCurrent() && farmAccessDenied(cause)) retireFarmAccess(queryClient, cause);
        throw cause;
      }
    },
    enabled: !access.error && !unavailable && isCurrent(),
    // Leaf navigation shares this parent snapshot. Focus and reconnect still revalidate it.
    refetchOnMount: (query) => query.state.isInvalidated || query.state.status === "error",
  });
  const error = access.error ?? unavailable?.cause ?? farmQuery.error;
  const farm =
    isCurrent() && !access.error && !unavailable && !recordUnavailable(farmQuery.error)
      ? farmQuery.data
      : null;
  const name = farm ? (locale === "vi" ? farm.name_vi : farm.name_en) : t.breadcrumb.farmDetails;
  const listHref = farmHref(search);
  const items = useMemo(
    () => [
      { label: c.list, href: listHref },
      productId
        ? { label: name, href: farmHref(search, { id: farmId, tab: "products" }) }
        : { label: name },
      ...(productId ? [{ label: t.breadcrumb.productDetails }] : []),
    ],
    [c.list, farmId, listHref, name, productId, search, t.breadcrumb.productDetails],
  );
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
      setDeleteRecovery(null);
      if (!farmAccessDenied(cause)) {
        setUnavailable({ cause });
        retireFarmQueries(queryClient, farmId);
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
    setDeleteRecovery(null);
    setActionError("");
  }, [access.error]);

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
      (owner === "header" && informationLocked && !checking)
    )
      return;
    mutation.current = owner;
    setBusyOwner(owner);
    return () => {
      mutation.current = null;
      if (mounted.current) setBusyOwner(null);
    };
  }

  function writeScope() {
    const epoch = recordEpoch.current;
    const permitted = () => isCurrent() && farmAccess(queryClient).revision === access.revision;
    return {
      permitted,
      current: () => mounted.current && permitted() && recordEpoch.current === epoch,
    };
  }

  async function adoptHeaderSnapshot(snapshot: Farm, intent: HeaderIntent, current: () => boolean) {
    const id = snapshot.id;
    const detailKey = farmDetailKey(id);
    await queryClient.cancelQueries({ queryKey: detailKey });
    if (!current()) return;
    const cached = queryClient.getQueryData<Farm>(detailKey);
    const latest = cached && cached.version > snapshot.version ? cached : snapshot;
    const own =
      latest === snapshot && intent.action !== "delete" && confirmsToggle(snapshot, intent);
    if (own) setOwnToggle({ from: intent.before.version, to: latest.version });
    queryClient.setQueryData(detailKey, latest);
    void queryClient.invalidateQueries({ queryKey: farmListKey });
    void queryClient.invalidateQueries({ queryKey: farmSupplyKey(id) });
    if (own) await information.current?.syncTracker();
    if (!current()) return;
    setHeaderRecovery(null);
    setActionError(own ? "" : c.conflict);
  }

  function currentDeleteCapability() {
    const latest = queryClient.getQueryState<Farm>(detailKey);
    if (latest?.status === "success" && latest.fetchStatus === "idle" && !latest.isInvalidated) {
      return farmDeleteCapability(latest.data?.capabilities);
    }
  }

  function canDeleteNow() {
    return (
      !deleteRecovery &&
      !queryClient.getMutationCache().find(supplyWrites) &&
      currentDeleteCapability()?.allowed === true
    );
  }

  function finishDeletion(current: boolean) {
    if (current) {
      setDialog(null);
      setDeleteRecovery(null);
      // The router may commit the list later. Keep the deleted route from reloading its record.
      setUnavailable({ cause: null });
      retireFarmQueries(queryClient, farmId);
      router.replace(listHref);
    } else {
      void queryClient.resetQueries({ queryKey: detailKey });
      void queryClient.resetQueries({ queryKey: farmSupplyKey(farmId) });
    }
    void queryClient.invalidateQueries({ queryKey: farmListKey });
  }

  async function readDeleteOutcome(check: DeleteRecovery, current: () => boolean) {
    try {
      const beforeRead = queryClient.getQueryState<Farm>(detailKey);
      const snapshot = await getFarm(farmId);
      if (!current()) return;
      const afterRead = queryClient.getQueryState<Farm>(detailKey);
      // A supply-triggered refresh can be newer even when Farm.version has not changed.
      if (
        afterRead === beforeRead &&
        afterRead?.fetchStatus === "idle" &&
        snapshot.version >= Math.max(check.before.version, afterRead.data?.version ?? 0)
      ) {
        queryClient.setQueryData(detailKey, snapshot);
      }
      const cached = queryClient.getQueryState<Farm>(detailKey);
      const verified =
        cached?.status === "success" &&
        cached.fetchStatus === "idle" &&
        !cached.isInvalidated &&
        cached.dataUpdateCount > (beforeRead?.dataUpdateCount ?? 0)
          ? cached.data
          : undefined;
      const capability = farmDeleteCapability(verified?.capabilities);
      // Supply can change independently of the Farm's version. A 409 followed by
      // the same allowed capability provides no evidence that Delete can proceed.
      if (
        verified &&
        verified.version >= check.before.version &&
        (capability?.allowed === false ||
          (!check.conflict &&
            capability?.allowed === true &&
            verified.version > check.before.version))
      ) {
        setDeleteRecovery(null);
      } else {
        setDeleteRecovery({
          ...check,
          message: check.conflict ? c.deleteConflict : c.saveStillUncertain,
        });
      }
    } catch (cause) {
      if (farmAccessDenied(cause)) {
        retireRecord(cause);
        return;
      }
      if (!current()) return;
      if (farmNotFound(cause)) finishDeletion(true);
      else setDeleteRecovery({ ...check, message: requestErrorMessage(cause, t) });
    }
  }

  async function changeFarm(intent: HeaderIntent) {
    if (!farm || headerRecovery || (intent.action === "delete" && !canDeleteNow())) return;
    const release = claimWrite("header");
    if (!release) return;
    const { permitted, current } = writeScope();
    setActionError("");
    try {
      const latest = queryClient.getQueryData<Farm>(detailKey);
      if (latest?.version !== intent.before.version) {
        setDialog(null);
        if (intent.action !== "delete") setHeaderRecovery({ intent, conflict: true });
        setActionError(c.conflict);
        return;
      }
      if (intent.action === "delete") {
        await deleteFarm(farm.id);
        if (!permitted()) return;
        finishDeletion(current());
      } else {
        const updated = await saveFarm(farm.id, {
          version: intent.before.version,
          is_active: intent.action === "activate",
        });
        if (!permitted()) return;
        if (!current()) {
          void queryClient.invalidateQueries({ queryKey: farmDetailKey(farm.id) });
          void queryClient.invalidateQueries({ queryKey: farmListKey });
          void queryClient.invalidateQueries({ queryKey: farmSupplyKey(farm.id) });
          return;
        }
        if (!confirmsToggle(updated, intent)) throw invalidApiResponse();
        await adoptHeaderSnapshot(updated, intent, current);
      }
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
      if (intent.action === "delete" && (conflict || unknown)) {
        const check = {
          before: intent.before,
          conflict,
          message: conflict ? c.deleteConflict : c.saveUncertain,
        };
        setDeleteRecovery(check);
        if (conflict) await readDeleteOutcome(check, current);
      } else if (conflict && problem?.message === "stock_reserved") {
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
      await adoptHeaderSnapshot(snapshot, intent, current);
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

  async function checkDelete() {
    if (!deleteRecovery) return;
    const release = claimWrite("header", true);
    if (!release) return;
    try {
      await readDeleteOutcome(deleteRecovery, writeScope().current);
    } finally {
      release();
    }
  }

  const recovery = error && (
    <RecoveryAlert
      message={farmNotFound(error) ? c.farmMissing : requestErrorMessage(error, t)}
      retryLabel={t.common.retry}
      onRetry={reload}
    />
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
  if (productId) {
    return <FarmSourceDetail farm={farm} productId={productId} onAccessLost={retireRecord} />;
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
    busyOwner === "header" ||
    Boolean(headerRecovery || error || (deleteRecovery && !deleteRecovery.conflict));
  const actionsDisabled = busyOwner !== null || headerLocked || informationLocked;
  const deleteDialog = dialog?.action === "delete";
  const deletion =
    deleteDialog && !deleteRecovery && !supplyWriting ? currentDeleteCapability() : undefined;
  const canConfirmDialog = !deleteDialog || deletion?.allowed === true;
  const open = (action: FarmAction) => {
    if (actionsDisabled || mutation.current) return;
    setActionError("");
    setDialog({ action, before: farm });
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
        {deleteRecovery && !deleteDialog && (
          <RecoveryAlert
            message={deleteRecovery.message}
            retryLabel={c.checkLatestFarm}
            onRetry={() => void checkDelete()}
            loading={busyOwner === "header"}
          />
        )}
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
          </Tabs.Panel>
        </Tabs>
      </Stack>
      {dialog && (
        <ConfirmationDialog
          title={actionLabel(dialog.action)}
          busy={busyOwner === "header"}
          cancelLabel={canConfirmDialog ? c.cancel : t.common.close}
          {...(canConfirmDialog
            ? {
                busyLabel: c.saving,
                confirmLabel: deleteDialog ? c.confirmDeleteFarm : actionLabel(dialog.action),
                onConfirm: () => void changeFarm(dialog),
              }
            : { busyLabel: undefined, confirmLabel: undefined, onConfirm: undefined })}
          confirmDisabled={actionsDisabled}
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
            <Text>{actionPrompt(dialog.action)}</Text>
          ) : deletion ? (
            <>
              <Text>{c.protectedFarm}</Text>
              <FarmDeleteReasons farmId={farm.id} search={search} reasons={deletion.reasons} />
            </>
          ) : farmQuery.isFetching && !deleteRecovery ? (
            <DataState kind="loading" title={c.loading} />
          ) : (
            <RecoveryAlert
              message={
                deleteRecovery?.message ??
                (error ? requestErrorMessage(error, t) : c.deleteUnverified)
              }
              retryLabel={c.checkLatestFarm}
              onRetry={deleteRecovery ? () => void checkDelete() : reload}
              loading={busyOwner === "header"}
            />
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

function farmNotFound(cause: unknown) {
  const error = cause as ClientApiError | undefined;
  const payload: unknown = error?.payload;
  // Django REST Framework's Http404 uses a detail body without an error code.
  return (
    error?.status === 404 &&
    (error.message === "not_found" ||
      (error.message === "request_failed" &&
        isApiObject(payload) &&
        typeof payload.detail === "string" &&
        Boolean(payload.detail.trim())))
  );
}
