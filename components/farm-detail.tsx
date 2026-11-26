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
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmProducts } from "@/components/farm-products";
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
import { deleteFarm, getFarm, saveFarm } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { mediaUrlForWidth } from "@/lib/media";
import type { Farm } from "@/lib/types";

export function FarmDetail({ farmId }: { farmId: string }) {
  return <FarmDetailContent key={farmId} farmId={farmId} />;
}

function FarmDetailContent({ farmId }: { farmId: string }) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const router = useRouter();
  const search = useSearchParams();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const tab = readFarmDetailTab(search);
  const [visited, setVisited] = useState({
    products: tab === "products",
    tracker: tab === "tracker",
  });
  const [record, setFarm] = useState<Farm | null>(null);
  const [error, setError] = useState<{ cause: unknown } | null>(null);
  const [actionError, setActionError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(false);
  const mutation = useRef(false);
  const activeRead = useRef<AbortController | null>(null);
  const recordEpoch = useRef(0);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const farm = isCurrent() ? record : null;
  const name = farm ? (locale === "vi" ? farm.name_vi : farm.name_en) : t.breadcrumb.farmDetails;
  const listHref = farmHref(search);
  const items = useMemo(
    () => [{ label: c.list, href: listHref }, { label: name }],
    [c.list, listHref, name],
  );
  const breadcrumb = (
    <AdminBreadcrumbForRoute
      pathname={farmHref(null, { id: farmId })}
      search={search?.toString() ?? ""}
      items={items}
    />
  );

  const retireRecord = useCallback((cause: unknown) => {
    recordEpoch.current += 1;
    activeRead.current?.abort();
    setFarm(null);
    setDialog(false);
    setBusy(false);
    setError({ cause });
  }, []);

  useEffect(() => {
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
    const controller = new AbortController();
    activeRead.current = controller;
    const current = () => !controller.signal.aborted && isCurrent();
    setError(null);
    getFarm(farmId, controller.signal)
      .then((row) => {
        if (current()) setFarm(row);
      })
      .catch((cause: unknown) => {
        if (!current()) return;
        if (recordUnavailable(cause)) retireRecord(cause);
        else setError({ cause });
      });
    return () => controller.abort();
  }, [farmId, isCurrent, retireRecord, retry]);

  const reload = useCallback(() => {
    setRetry((value) => value + 1);
  }, []);

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
        activeRead.current?.abort();
        setFarm(null);
        router.replace(listHref);
      } else {
        const updated = await saveFarm(farm.id, { version: farm.version, is_active: false });
        if (!current()) return;
        activeRead.current?.abort();
        setFarm(updated);
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
      message={requestErrorMessage(error.cause, t)}
      retryLabel={t.common.retry}
      onRetry={reload}
    />
  );
  if (!farm)
    return (
      <>
        {breadcrumb}
        <PageHeading title={t.breadcrumb.farmDetails} visuallyHiddenTitle />
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
              <Tabs.Tab key={value} value={value}>
                {labels[value]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="products">
            {(visited.products || tab === "products") && (
              <FarmProducts
                farmId={farm.id}
                inStockCount={farm.in_stock_product_count}
                outOfStockCount={farm.out_of_stock_product_count}
                onInventoryChanged={reload}
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
              <FarmTrackerProfileEditor farm={farm} onAccessLost={retireRecord} />
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
  return isProtectedDataError(cause) || (cause as ClientApiError | undefined)?.status === 404;
}
