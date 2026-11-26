"use client";

import {
  ActionIcon,
  Button,
  Group,
  Image,
  Menu,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconDots } from "@tabler/icons-react";
import { CancelledError, useQuery, useQueryClient } from "@tanstack/react-query";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmProducts } from "@/components/farm-products";
import { FarmSourceDetail } from "@/components/farm-source-detail";
import { FarmTrackerProfileEditor } from "@/components/farm-tracker-profile-editor";
import { DataState, Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import {
  farmDetailTabs,
  farmHref,
  readFarmDetailTab,
  type FarmDetailTab,
} from "@/lib/farm-navigation";
import { farmDetailKey, farmListKey, farmSupplyKey, retireFarmQueries } from "@/lib/farm-query";
import { deleteFarm, getFarm, saveFarm } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { mediaUrlForWidth } from "@/lib/media";

type Props = { farmId: string; productId?: string };

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
  const tab = readFarmDetailTab(search);
  const [visited, setVisited] = useState({
    products: tab === "products",
    tracker: tab === "tracker",
  });
  const [unavailable, setUnavailable] = useState<{ cause: unknown } | null>(null);
  const [actionError, setActionError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const mutation = useRef(false);
  const recordEpoch = useRef(0);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const farmQuery = useQuery({
    queryKey: farmDetailKey(farmId),
    queryFn: async ({ signal }) => {
      const row = await getFarm(farmId, signal);
      if (signal.aborted || !isCurrent()) throw new CancelledError();
      return row;
    },
    enabled: !unavailable && isCurrent(),
    // Leaf navigation shares this parent snapshot. Focus and reconnect still revalidate it.
    refetchOnMount: (query) => query.state.isInvalidated || query.state.status === "error",
  });
  const error = unavailable?.cause ?? farmQuery.error;
  const farm =
    isCurrent() && !unavailable && !recordUnavailable(farmQuery.error) ? farmQuery.data : null;
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
      if (!mounted.current || !isCurrent()) return;
      recordEpoch.current += 1;
      setDialog(false);
      setBusy(false);
      setUnavailable({ cause });
      retireFarmQueries(queryClient, isProtectedDataError(cause) ? undefined : farmId);
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
    if (tab === "information") return;
    setVisited((current) => (current[tab] ? current : { ...current, [tab]: true }));
  }, [tab]);
  useEffect(() => {
    if (!unavailable && isCurrent() && recordUnavailable(farmQuery.error)) {
      retireRecord(farmQuery.error);
    }
  }, [farmQuery.error, isCurrent, retireRecord, unavailable]);

  const reload = () => {
    if (unavailable) setUnavailable(null);
    else void farmQuery.refetch();
  };

  async function changeFarm(action: "delete" | "deactivate") {
    if (!farm || !isCurrent() || mutation.current) return;
    const epoch = recordEpoch.current;
    const current = () => mounted.current && isCurrent() && recordEpoch.current === epoch;
    mutation.current = true;
    setBusy(true);
    setActionError("");
    try {
      if (action === "delete") {
        await deleteFarm(farm.id);
        if (!current()) return;
        retireFarmQueries(queryClient, farm.id);
        void queryClient.invalidateQueries({ queryKey: farmListKey });
        router.replace(listHref);
      } else {
        const updated = await saveFarm(farm.id, { version: farm.version, is_active: false });
        if (!current()) return;
        await queryClient.cancelQueries({ queryKey: farmDetailKey(farm.id) });
        if (!current()) return;
        queryClient.setQueryData(farmDetailKey(farm.id), updated);
        void queryClient.invalidateQueries({ queryKey: farmListKey });
        void queryClient.invalidateQueries({ queryKey: farmSupplyKey(farm.id) });
      }
      setDialog(false);
    } catch (cause) {
      if (!current()) return;
      if (recordUnavailable(cause)) {
        retireRecord(cause);
      } else {
        setActionError(
          (cause as ClientApiError | undefined)?.status === 409
            ? action === "delete"
              ? c.protectedFarm
              : c.conflict
            : requestErrorMessage(cause, t),
        );
      }
    } finally {
      mutation.current = false;
      if (current()) setBusy(false);
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
    tracker: c.tracker,
  };
  const localDescription = locale === "vi" ? farm.description_vi : farm.description_en;
  const alternate =
    locale === "vi"
      ? {
          locale: "en",
          label: t.common.english,
          name: farm.name_en,
          location: farm.location_en,
          description: farm.description_en,
        }
      : {
          locale: "vi",
          label: t.common.vietnamese,
          name: farm.name_vi,
          location: farm.location_vi,
          description: farm.description_vi,
        };
  const location = locale === "vi" ? farm.location_vi : farm.location_en;
  const album = farm.photos.filter((photo) => photo.id !== farm.image?.id);
  return (
    <>
      {breadcrumb}
      <Stack gap="md" miw={0}>
        <Paper component="header" withBorder p="md">
          <Group justify="space-between" align="flex-start" gap="md">
            <Group gap="sm" align="flex-start" miw={0} flex="1 1 16rem" wrap="nowrap">
              {farm.image && (
                <Image
                  component={NextImage}
                  alt=""
                  src={mediaUrlForWidth(farm.image, 144)}
                  width={72}
                  height={60}
                  w={72}
                  h={60}
                  radius="md"
                  flex="0 0 auto"
                  unoptimized
                />
              )}
              <Stack gap={4} miw={0} style={{ overflowWrap: "anywhere" }}>
                <Title order={1}>{name}</Title>
                <Text size="sm" c="dimmed">
                  {location}
                </Text>
                <Status
                  domain="availability"
                  status={farm.is_active ? "active" : "inactive"}
                  label={farm.is_active ? c.active : c.inactive}
                />
              </Stack>
            </Group>
            <Group gap="xs">
              <Button
                component={AdminNavigationLink}
                href={farmHref(search, { id: farm.id, mode: "edit" })}
                disabled={busy}
                aria-disabled={busy || undefined}
                tabIndex={busy ? -1 : undefined}
                onClick={(event) => {
                  if (mutation.current) event.preventDefault();
                }}
              >
                {c.edit}
              </Button>
              <Menu position="bottom-end" returnFocus>
                <Menu.Target>
                  <ActionIcon
                    ref={menuTrigger}
                    variant="default"
                    aria-label={c.moreActions}
                    disabled={busy}
                  >
                    <IconDots size={18} aria-hidden />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    color="danger"
                    onClick={() => {
                      setActionError("");
                      setDialog(true);
                    }}
                  >
                    {c.farmDelete}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </Paper>
        {recovery}
        <Tabs
          value={tab}
          onChange={(value) => {
            if (value === "products" || value === "information" || value === "tracker")
              router.push(farmHref(search, { id: farm.id, tab: value }), { scroll: false });
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
            {tab === "information" && (
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Title order={2}>{c.farmInfo}</Title>
                  <RecordDetailFields>
                    <RecordDetailField
                      label={locale === "vi" ? t.common.vietnamese : t.common.english}
                    >
                      <Text lang={locale} style={{ whiteSpace: "pre-wrap" }}>
                        {localDescription || "—"}
                      </Text>
                    </RecordDetailField>
                    <RecordDetailField label={alternate.label}>
                      <Stack gap={4} lang={alternate.locale}>
                        {alternate.name !== name && <Text fw={600}>{alternate.name}</Text>}
                        {alternate.location !== location && (
                          <Text size="sm" c="dimmed">
                            {alternate.location}
                          </Text>
                        )}
                        <Text style={{ whiteSpace: "pre-wrap" }}>
                          {alternate.description || "—"}
                        </Text>
                      </Stack>
                    </RecordDetailField>
                  </RecordDetailFields>
                  {album.length > 0 && (
                    <SimpleGrid
                      type="container"
                      cols={{ base: 2, "28rem": 4 }}
                      spacing="sm"
                      aria-label={c.photos}
                    >
                      {album.map((photo) => (
                        <Image
                          key={photo.id}
                          component={NextImage}
                          alt=""
                          src={mediaUrlForWidth(photo, 320)}
                          width={160}
                          height={112}
                          w="100%"
                          h={96}
                          radius="md"
                          unoptimized
                        />
                      ))}
                    </SimpleGrid>
                  )}
                </Stack>
              </Paper>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="tracker">
            {(visited.tracker || tab === "tracker") && (
              <FarmTrackerProfileEditor
                farm={farm}
                isTabActive={tab === "tracker"}
                onAccessLost={retireRecord}
              />
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>
      {dialog && (
        <ConfirmationDialog
          title={c.farmDelete}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={c.cancel}
          confirmLabel={c.farmDelete}
          alternateLabel={farm.is_active ? c.deactivate : undefined}
          onAlternate={farm.is_active ? () => void changeFarm("deactivate") : undefined}
          danger
          error={actionError}
          returnFocusRef={menuTrigger}
          onCancel={() => !busy && setDialog(false)}
          onConfirm={() => void changeFarm("delete")}
        >
          <Text>{c.deleteFarmPrompt.replace("{name}", name)}</Text>
        </ConfirmationDialog>
      )}
    </>
  );
}

function recordUnavailable(cause: unknown) {
  return isProtectedDataError(cause) || farmNotFound(cause);
}

function farmNotFound(cause: unknown) {
  return (cause as ClientApiError | undefined)?.status === 404;
}
