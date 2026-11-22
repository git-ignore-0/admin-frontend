"use client";
import { DataState } from "@/components/nfv-controls";
import { Stack, Alert, Button, Tabs } from "@mantine/core";

import { Status } from "@/components/nfv-controls";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmProducts } from "@/components/farm-products";
import { requestErrorMessage } from "@/lib/client-error";
import { deleteFarm, getFarm, getFarmTracker, saveFarm } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { mediaUrlForWidth } from "@/lib/media";
import type { Farm } from "@/lib/types";

type DetailTab = "products" | "information" | "tracker";
const detailTabs: DetailTab[] = ["products", "information", "tracker"];

export function FarmDetail({ farmId }: { farmId: string }) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const router = useRouter();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<DetailTab>("products");
  const [trackerCount, setTrackerCount] = useState<number | null | undefined>(null);

  useEffect(() => {
    let live = true;
    setError("");
    getFarm(farmId)
      .then((row) => live && setFarm(row))
      .catch((caught) => live && setError(requestErrorMessage(caught, t)));
    return () => {
      live = false;
    };
  }, [farmId, retry, t]);

  useEffect(() => {
    let live = true;
    getFarmTracker(farmId)
      .then((profile) => live && setTrackerCount(profile.signup_count))
      .catch((caught) => live && setTrackerCount(caught?.status === 404 ? undefined : null));
    return () => {
      live = false;
    };
  }, [farmId, retry]);

  async function remove() {
    if (!farm) return;
    setBusy(true);
    setActionError("");
    try {
      await deleteFarm(farm.id);
      router.replace("/farms");
      router.refresh();
    } catch (caught) {
      setActionError(
        (caught as { status?: number }).status === 409
          ? c.protectedFarm
          : requestErrorMessage(caught, t),
      );
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!farm) return;
    setBusy(true);
    setActionError("");
    try {
      const updated = await saveFarm(farm.id, { version: farm.version, is_active: false });
      setFarm(updated);
      setDialog(false);
    } catch (caught) {
      setActionError(
        (caught as { status?: number }).status === 409
          ? c.conflict
          : requestErrorMessage(caught, t),
      );
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Alert color="red" role="alert">
        <Stack gap="sm" align="flex-start">
          {error}
          <Button variant="default" type="button" onClick={() => setRetry((n) => n + 1)}>
            {t.common.retry}
          </Button>
        </Stack>
      </Alert>
    );
  }
  if (!farm) return <DataState kind="loading" title={c.loading} />;

  const name = locale === "vi" ? farm.name_vi : farm.name_en;
  const location = locale === "vi" ? farm.location_vi : farm.location_en;
  const labels: Record<DetailTab, string> = {
    products: c.productsAndSupply,
    information: c.overview,
    tracker: c.tracker,
  };

  return (
    <div className="farm-detail-page">
      <Link className="farm-detail-back" href="/farms">
        ← {c.list}
      </Link>
      <header className="farm-detail-header">
        <div className="farm-detail-identity">
          {farm.image ? (
            <Image
              alt=""
              src={mediaUrlForWidth(farm.image, 160)}
              width={80}
              height={64}
              unoptimized
            />
          ) : (
            <span className="farm-detail-image-placeholder" aria-hidden="true" />
          )}
          <div>
            <div className="farm-detail-title-line">
              <h1>{name}</h1>
              <Status
                domain="availability"
                status={farm.is_active ? "active" : "inactive"}
                label={farm.is_active ? c.active : c.inactive}
              />
            </div>
            <p>{location}</p>
          </div>
        </div>
        <div className="farm-detail-actions">
          <Button component={Link} variant="default" href={`/farms/${farm.id}/edit`}>
            {c.edit}
          </Button>
          <Button color="red" onClick={() => setDialog(true)} type="button">
            {c.farmDelete}
          </Button>
        </div>
      </header>

      <Tabs value={tab} onChange={(value) => setTab(value as DetailTab)} keepMounted>
        <Tabs.List mb="md" className="farm-detail-tabs" aria-label={c.detailSections}>
          {detailTabs.map((item) => (
            <Tabs.Tab key={item} value={item}>
              {labels[item]}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="products">
          <FarmProducts
            farmId={farm.id}
            inStockCount={farm.in_stock_product_count}
            outOfStockCount={farm.out_of_stock_product_count}
            onInventoryChanged={() => setRetry((value) => value + 1)}
          />
        </Tabs.Panel>
        <Tabs.Panel value="information">
          <div className="farm-overview-grid">
            <div className="farm-detail-cover">
              {farm.image ? (
                <Image
                  alt={name}
                  src={mediaUrlForWidth(farm.image, 800)}
                  width={480}
                  height={320}
                  unoptimized
                />
              ) : (
                <span>{c.noCover}</span>
              )}
            </div>
            <div className="farm-overview-copy">
              <h2>{c.farmInfo}</h2>
              <p>{(locale === "vi" ? farm.description_vi : farm.description_en) || "—"}</p>
              <dl>
                <div>
                  <dt>{c.location}</dt>
                  <dd>{location}</dd>
                </div>
                <div>
                  <dt>{c.status}</dt>
                  <dd>{farm.is_active ? c.active : c.inactive}</dd>
                </div>
              </dl>
            </div>
          </div>
        </Tabs.Panel>
        <Tabs.Panel value="tracker">
          <div className="farm-overview-link">
            <div>
              <h2>{c.tracker}</h2>
              <p>
                {trackerCount === null
                  ? c.summaryUnavailable
                  : trackerCount === undefined
                    ? c.trackerNotEnabled
                    : `${trackerCount} ${c.trackerSignupSuffix}`}
              </p>
            </div>
            <Button component={Link} variant="default" href={`/tracker-farms/${farm.id}`}>
              {c.trackerEdit}
            </Button>
          </div>
        </Tabs.Panel>
      </Tabs>

      {dialog && (
        <ConfirmationDialog
          title={c.farmDelete}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={c.cancel}
          confirmLabel={c.farmDelete}
          alternateLabel={farm.is_active ? c.deactivate : undefined}
          onAlternate={farm.is_active ? () => void deactivate() : undefined}
          danger
          error={actionError}
          onCancel={() => !busy && setDialog(false)}
          onConfirm={() => void remove()}
        >
          <p>
            {locale === "vi"
              ? `Xóa ${name}? Nếu Farm đã có sản phẩm hoặc Growth Tracker, hãy tắt hoạt động.`
              : `Delete ${name}? If it has products or Growth Tracker, deactivate it instead.`}
          </p>
        </ConfirmationDialog>
      )}
    </div>
  );
}
