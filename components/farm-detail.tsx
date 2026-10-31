"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyboardEvent, useEffect, useRef, useState } from "react";

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
  const tabRefs = useRef<Record<DetailTab, HTMLButtonElement | null>>({
    products: null,
    information: null,
    tracker: null,
  });
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

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const current = detailTabs.indexOf(tab);
    let next: DetailTab;
    if (event.key === "Home") next = detailTabs[0];
    else if (event.key === "End") next = detailTabs[detailTabs.length - 1];
    else if (event.key === "ArrowRight") next = detailTabs[(current + 1) % detailTabs.length];
    else if (event.key === "ArrowLeft") {
      next = detailTabs[(current - 1 + detailTabs.length) % detailTabs.length];
    } else return;
    event.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  if (error) {
    return (
      <div className="error-box" role="alert">
        {error}
        <button className="button secondary" type="button" onClick={() => setRetry((n) => n + 1)}>
          {t.common.retry}
        </button>
      </div>
    );
  }
  if (!farm) return <p role="status">{c.loading}</p>;

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
              <span className={`farm-status ${farm.is_active ? "active" : "inactive"}`}>
                {farm.is_active ? c.active : c.inactive}
              </span>
            </div>
            <p>{location}</p>
          </div>
        </div>
        <div className="farm-detail-actions">
          <Link className="button secondary" href={`/farms/${farm.id}/edit`}>
            {c.edit}
          </Link>
          <button className="button danger" onClick={() => setDialog(true)} type="button">
            {c.farmDelete}
          </button>
        </div>
      </header>

      <div className="farm-detail-tabs" role="tablist" aria-label={c.detailSections}>
        {detailTabs.map((item) => (
          <button
            key={item}
            ref={(node) => {
              tabRefs.current[item] = node;
            }}
            id={`farm-${item}-tab`}
            type="button"
            role="tab"
            aria-controls={`farm-${item}-panel`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            onKeyDown={moveTab}
            onClick={() => setTab(item)}
          >
            {labels[item]}
          </button>
        ))}
      </div>

      <section
        id="farm-products-panel"
        role="tabpanel"
        aria-labelledby="farm-products-tab"
        hidden={tab !== "products"}
      >
        <FarmProducts
          farmId={farm.id}
          inStockCount={farm.in_stock_product_count}
          outOfStockCount={farm.out_of_stock_product_count}
          onInventoryChanged={() => setRetry((value) => value + 1)}
        />
      </section>
      <section
        id="farm-information-panel"
        role="tabpanel"
        aria-labelledby="farm-information-tab"
        hidden={tab !== "information"}
      >
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
      </section>
      <section
        id="farm-tracker-panel"
        role="tabpanel"
        aria-labelledby="farm-tracker-tab"
        hidden={tab !== "tracker"}
      >
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
          <Link className="button secondary" href={`/tracker-farms/${farm.id}`}>
            {c.trackerEdit}
          </Link>
        </div>
      </section>

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
