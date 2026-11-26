"use client";
import {
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconGripVertical,
  IconTrash,
} from "@tabler/icons-react";
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Image,
  Paper,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DragEvent, Ref } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requireResponseEntity, requireResponseList } from "@/lib/api-response";
import { farmHref } from "@/lib/farm-navigation";
import { disableFarmTracker } from "@/lib/farms-api";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import { trackerMilestone } from "@/lib/tracker-milestone";
import type { TrackerFarm } from "@/lib/types";
import styles from "./tracker-farm-manager.module.css";

const milestoneIcons: Record<ReturnType<typeof trackerMilestone>, string> = {
  communityLeader: "🌳 🌱",
  providingForFamily: "🌳",
  gettingStarted: "🌱",
  seedPlanted: "🌰",
};

function FarmThumbnail({ farm, name }: { farm: TrackerFarm; name: string }) {
  const primaryPhoto = farm.photos?.[0] ?? farm.image;
  if (primaryPhoto) {
    return (
      <Image
        component={NextImage}
        alt={name}
        height={48}
        width={48}
        h={48}
        w={48}
        radius="md"
        flex="0 0 auto"
        src={mediaUrlForWidth(primaryPhoto, 96)}
        unoptimized
      />
    );
  }

  return (
    <Center aria-label={name} role="img" h={48} w={48} flex="0 0 auto" bg="gray.0" bdrs="md">
      {milestoneIcons[trackerMilestone(farm.signup_count)]}
    </Center>
  );
}

export type TrackerFarmManagerHandle = { requestNavigation: (navigate: () => void) => void };

export function TrackerFarmManager({ ref }: { ref?: Ref<TrackerFarmManagerHandle> }) {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const [savedFarms, setSavedFarms] = useState<TrackerFarm[] | null>(null);
  const [draftFarms, setDraftFarms] = useState<TrackerFarm[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TrackerFarm | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const [reorderError, setReorderError] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const loadRequest = useRef<AbortController | null>(null);
  const deletingRef = useRef(false);
  const savingOrderRef = useRef(false);
  const dictionaryRef = useRef(t);
  dictionaryRef.current = t;
  const retireRows = useCallback((cause: unknown) => {
    setLoadError(requestErrorMessage(cause, dictionaryRef.current));
    setSavedFarms(null);
    setDraftFarms(null);
    setPendingNavigation(null);
    setDeleteTarget(null);
    setDraggedId("");
  }, []);
  const loadFarms = useCallback(
    async (showLoading = true) => {
      loadRequest.current?.abort();
      const request = new AbortController();
      loadRequest.current = request;
      if (showLoading) setLoading(true);
      setLoadError("");
      try {
        const latest = requireResponseList(
          await api<TrackerFarm[]>("admin/tracker-farms", { signal: request.signal }),
          requireResponseEntity,
        );
        if (request.signal.aborted || !isCurrent()) return false;
        setSavedFarms(latest);
        setDraftFarms(null);
        return true;
      } catch (caught) {
        if (!request.signal.aborted && isCurrent()) {
          if (isProtectedDataError(caught)) retireRows(caught);
          else setLoadError(requestErrorMessage(caught, dictionaryRef.current));
        }
        return false;
      } finally {
        if (showLoading && !request.signal.aborted) setLoading(false);
      }
    },
    [isCurrent, retireRows],
  );
  useEffect(() => {
    void loadFarms();
    return () => loadRequest.current?.abort();
  }, [loadFarms]);
  const farms = draftFarms ?? savedFarms;
  const orderDirty = draftFarms !== null;
  const orderLocked = savingOrder || deleting;
  const mutationLocked = orderDirty || orderLocked;
  const enableHref = farmHref(searchParams, { view: "farms", setup: true });
  function moveFarm(sourceId: string, targetIndex: number) {
    if (orderLocked || !savedFarms) return;
    setDraftFarms((current) => {
      const order = current ?? savedFarms;
      const sourceIndex = order.findIndex((farm) => farm.id === sourceId);
      if (
        sourceIndex < 0 ||
        sourceIndex === targetIndex ||
        targetIndex < 0 ||
        targetIndex >= order.length
      ) {
        return current;
      }
      const reordered = [...order];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered.every((farm, index) => farm.id === savedFarms[index]?.id) ? null : reordered;
    });
    setReorderError("");
  }
  function startDragging(event: DragEvent<HTMLButtonElement>, farmId: string) {
    if (orderLocked) {
      event.preventDefault();
      return;
    }
    setDraggedId(farmId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", farmId);
  }
  async function saveOrderChanges() {
    const scope = loadRequest.current?.signal;
    const current = () => isCurrent() && scope && !scope.aborted;
    if (!draftFarms || !current() || savingOrderRef.current || deletingRef.current) return false;
    savingOrderRef.current = true;
    setSavingOrder(true);
    setReorderError("");
    try {
      const saved = await api<TrackerFarm[]>("admin/tracker-farms/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          items: draftFarms.map((farm, index) => ({
            id: farm.id,
            sort_order: index,
            version: farm.version,
          })),
        }),
      });
      if (!current()) return false;
      requireResponseList(saved, requireResponseEntity);
      setSavedFarms(saved);
      setDraftFarms(null);
      toast(t.trackerFarms.orderSaved);
      return true;
    } catch (caught) {
      if (!current()) return false;
      if (isProtectedDataError(caught)) {
        retireRows(caught);
        return false;
      }
      const status = caught instanceof Error ? (caught as Error & { status?: number }).status : 0;
      if (status === 409) {
        if (await loadFarms(false)) {
          setPendingNavigation(null);
          setReorderError(t.trackerFarms.conflict);
        }
        if (isCurrent() && !loadRequest.current?.signal.aborted)
          toast(t.trackerFarms.conflict, "error");
      } else setReorderError(requestErrorMessage(caught, t));
      return false;
    } finally {
      savingOrderRef.current = false;
      setSavingOrder(false);
      setDraggedId("");
    }
  }
  function requestNavigation(navigate: () => void) {
    if (savingOrderRef.current || deletingRef.current) return;
    if (!orderDirty) {
      navigate();
      return;
    }
    setReorderError("");
    setPendingNavigation(() => navigate);
  }
  useImperativeHandle(ref, () => ({ requestNavigation }));

  function guardLink(event: { preventDefault: () => void }, href: string) {
    if (!mutationLocked) return;
    event.preventDefault();
    requestNavigation(() => router.push(href));
  }
  async function saveOrderAndNavigate() {
    const navigate = pendingNavigation;
    if (!navigate || !(await saveOrderChanges())) return;
    setPendingNavigation(null);
    navigate();
  }
  function discardOrder() {
    setDraftFarms(null);
    setDraggedId("");
    setReorderError("");
  }
  function discardOrderAndNavigate() {
    discardOrder();
    setPendingNavigation(null);
    pendingNavigation?.();
  }
  async function confirmDelete() {
    const scope = loadRequest.current?.signal;
    const current = () => isCurrent() && scope && !scope.aborted;
    if (!deleteTarget || !current() || draftFarms || savingOrderRef.current || deletingRef.current)
      return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await disableFarmTracker(deleteTarget.id);
      if (!current()) return;
      setSavedFarms((current) => current?.filter((farm) => farm.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
      toast(t.trackerFarms.deleted);
    } catch (caught) {
      if (!current()) return;
      if (isProtectedDataError(caught)) retireRows(caught);
      else setDeleteError(requestErrorMessage(caught, t));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }
  const copy = t.trackerFarms;
  return (
    <Stack gap="md" miw={0}>
      <ListToolbar
        primaryAction={
          <Button
            component={AdminNavigationLink}
            aria-haspopup={orderDirty ? "dialog" : undefined}
            aria-disabled={orderLocked || undefined}
            href={enableHref}
            onNavigate={(event) => guardLink(event, enableHref)}
          >
            {copy.create}
          </Button>
        }
      />
      <Paper w="100%" miw={0} style={{ overflow: "hidden" }} aria-busy={loading || orderLocked}>
        <Box p={loadError ? "md" : undefined}>
          <ListState
            embedded
            empty={copy.empty}
            error={loadError}
            hasData={farms !== null}
            isEmpty={farms?.length === 0}
            loading={loading}
            loadingLabel={copy.loading}
            onRetry={() => void loadFarms()}
            retryLabel={t.common.retry}
          />
        </Box>
        {reorderError && (
          <Box p="md">
            <Alert color="red" role="alert">
              {reorderError}
            </Alert>
          </Box>
        )}
        {farms && farms.length > 0 && (
          <>
            {farms.length > 1 && (
              <>
                <Group px="md" py="sm" gap="sm" justify="space-between">
                  <Text size="sm" c="dimmed">
                    {copy.reorderHelp}
                  </Text>
                  {orderDirty && (
                    <Group gap="xs">
                      <Button
                        variant="default"
                        disabled={savingOrder}
                        onClick={discardOrder}
                        type="button"
                      >
                        {copy.cancelOrder}
                      </Button>
                      <Button
                        disabled={savingOrder}
                        onClick={() => void saveOrderChanges()}
                        type="button"
                      >
                        {savingOrder ? copy.savingOrder : copy.saveOrder}
                      </Button>
                    </Group>
                  )}
                </Group>
                <Divider />
              </>
            )}
            <Table.ScrollContainer
              type="native"
              minWidth={740}
              role="region"
              aria-label={t.common.trackerFarms}
              tabIndex={0}
              style={{ outlineOffset: -2 }}
            >
              <Table aria-label={t.common.trackerFarms} withRowBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th scope="col">{copy.order}</Table.Th>
                    <Table.Th scope="col">{copy.farmName}</Table.Th>
                    <Table.Th scope="col">{copy.signups}</Table.Th>
                    <Table.Th scope="col">{copy.milestone}</Table.Th>
                    <Table.Th scope="col">{copy.visibility}</Table.Th>
                    <Table.Th scope="col">{copy.actions}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {farms.map((farm, index) => {
                    const name = locale === "vi" ? farm.name_vi : farm.name_en;
                    const location = locale === "vi" ? farm.location_vi : farm.location_en;
                    const editLabel = copy.edit.replace("{name}", name);
                    const deleteLabel = copy.delete.replace("{name}", name);
                    const href = farmHref(searchParams, {
                      id: farm.id,
                      tab: "tracker",
                      view: "tracker",
                    });
                    const dragging = draggedId === farm.id;

                    return (
                      <Table.Tr
                        data-selected={dragging || undefined}
                        key={farm.id}
                        onDragOver={(event) => {
                          if (!orderLocked && draggedId && !dragging) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDrop={(event) => {
                          if (!draggedId || orderLocked) return;
                          event.preventDefault();
                          moveFarm(draggedId, index);
                          setDraggedId("");
                        }}
                      >
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <ActionIcon
                              aria-label={copy.drag.replace("{name}", name)}
                              className={styles.dragHandle}
                              disabled={orderLocked || farms.length < 2}
                              draggable={!orderLocked && farms.length > 1}
                              onDragEnd={() => setDraggedId("")}
                              onDragStart={(event) => startDragging(event, farm.id)}
                              tabIndex={-1}
                              variant="default"
                              type="button"
                            >
                              <IconGripVertical aria-hidden size={18} />
                            </ActionIcon>
                            <Group gap={4} wrap="nowrap">
                              <ActionIcon
                                aria-label={copy.moveUp.replace("{name}", name)}
                                disabled={orderLocked || index === 0}
                                onClick={() => moveFarm(farm.id, index - 1)}
                                variant="default"
                                type="button"
                              >
                                <IconArrowUp aria-hidden size={16} />
                              </ActionIcon>
                              <ActionIcon
                                aria-label={copy.moveDown.replace("{name}", name)}
                                disabled={orderLocked || index === farms.length - 1}
                                onClick={() => moveFarm(farm.id, index + 1)}
                                variant="default"
                                type="button"
                              >
                                <IconArrowDown aria-hidden size={16} />
                              </ActionIcon>
                            </Group>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="sm" wrap="nowrap" miw={0}>
                            <FarmThumbnail farm={farm} name={name} />
                            <Stack gap={4} miw={0} style={{ overflowWrap: "anywhere" }}>
                              <Anchor
                                component={AdminNavigationLink}
                                aria-haspopup={orderDirty ? "dialog" : undefined}
                                aria-disabled={orderLocked || undefined}
                                fw={600}
                                href={href}
                                lang={locale}
                                onNavigate={(event) => guardLink(event, href)}
                              >
                                {name}
                              </Anchor>
                              <Text size="sm" c="dimmed" lang={locale}>
                                {location}
                              </Text>
                            </Stack>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text span fw={600}>
                            {farm.signup_count}
                          </Text>
                        </Table.Td>
                        <Table.Td>{copy[trackerMilestone(farm.signup_count)]}</Table.Td>
                        <Table.Td>
                          <Status
                            domain="visibility"
                            status={farm.is_visible ? "visible" : "hidden"}
                            label={farm.is_visible ? copy.visible : copy.hidden}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <ActionIcon
                              component={AdminNavigationLink}
                              aria-label={editLabel}
                              aria-haspopup={orderDirty ? "dialog" : undefined}
                              aria-disabled={orderLocked || undefined}
                              href={href}
                              onNavigate={(event) => guardLink(event, href)}
                              title={editLabel}
                              variant="default"
                            >
                              <IconEdit aria-hidden size={18} stroke={1.8} />
                            </ActionIcon>
                            <ActionIcon
                              aria-label={deleteLabel}
                              color="red"
                              disabled={mutationLocked}
                              onClick={() => {
                                setDeleteError("");
                                setDeleteTarget(farm);
                              }}
                              title={deleteLabel}
                              type="button"
                            >
                              <IconTrash aria-hidden size={18} stroke={1.8} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </>
        )}
      </Paper>
      {deleteTarget && (
        <ConfirmationDialog
          busy={deleting}
          busyLabel={t.trackerFarms.deleting}
          cancelLabel={t.trackerFarms.cancel}
          confirmLabel={t.trackerFarms.confirmDelete}
          danger
          error={deleteError}
          onCancel={() => !deleting && setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
          title={t.trackerFarms.deleteTitle}
        >
          <p>
            {t.trackerFarms.deleteBody.replace(
              "{name}",
              locale === "vi" ? deleteTarget.name_vi : deleteTarget.name_en,
            )}
          </p>
        </ConfirmationDialog>
      )}
      {pendingNavigation && (
        <ConfirmationDialog
          alternateLabel={t.trackerFarms.discardOrder}
          busy={savingOrder}
          busyLabel={t.trackerFarms.savingOrder}
          cancelLabel={t.trackerFarms.stayOnList}
          confirmLabel={t.trackerFarms.saveOrder}
          error={reorderError}
          onAlternate={discardOrderAndNavigate}
          onCancel={() => !savingOrder && setPendingNavigation(null)}
          onConfirm={() => void saveOrderAndNavigate()}
          title={t.trackerFarms.unsavedOrderTitle}
        >
          <p>{t.trackerFarms.unsavedOrderBody}</p>
        </ConfirmationDialog>
      )}
    </Stack>
  );
}
