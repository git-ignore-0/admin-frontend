"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyboardEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { FarmProducts } from "@/components/farm-products";
import { requestErrorMessage } from "@/lib/client-error";
import { deleteFarm, getFarm, getFarmTracker, saveFarm } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { mediaUrlForWidth } from "@/lib/media";
import type { Farm } from "@/lib/types";

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
  const [tab, setTab] = useState<"overview" | "products">("overview");
  const [productsVisited, setProductsVisited] = useState(false);
  const overviewTabRef = useRef<HTMLButtonElement>(null);
  const productsTabRef = useRef<HTMLButtonElement>(null);
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
    let next: "overview" | "products";
    if (event.key === "Home") next = "overview";
    else if (event.key === "End") next = "products";
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      next = tab === "overview" ? "products" : "overview";
    } else return;
    event.preventDefault();
    if (next === "products") setProductsVisited(true);
    setTab(next);
    (next === "overview" ? overviewTabRef : productsTabRef).current?.focus();
  }

  if (error)
    return (
      <div className="error-box" role="alert">
        {error}
        <button className="button secondary" type="button" onClick={() => setRetry((n) => n + 1)}>
          {t.common.retry}
        </button>
      </div>
    );
  if (!farm) return <p role="status">{c.loading}</p>;
  const name = locale === "vi" ? farm.name_vi : farm.name_en;
  return (
    <div className="farm-detail-page">
      <DetailPageHeading
        backHref="/farms"
        backLabel={c.list}
        title={name}
        description={locale === "vi" ? farm.location_vi : farm.location_en}
      />
      <div className="farm-detail-toolbar">
        <span className={`farm-status ${farm.is_active ? "active" : "inactive"}`}>
          {farm.is_active ? c.active : c.inactive}
        </span>
        <div className="farm-detail-actions">
          <Link
            aria-label={c.edit}
            className="button secondary icon-only-action"
            href={`/farms/${farm.id}/edit`}
            title={c.edit}
          >
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <path
                d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="m13.5 8.5 3 3"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </Link>
          <button
            aria-label={c.farmDelete}
            className="button danger icon-only-action"
            onClick={() => setDialog(true)}
            title={c.farmDelete}
            type="button"
          >
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <path
                d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="farm-detail-tabs" role="tablist" aria-label={c.detailSections}>
        <button
          ref={overviewTabRef}
          id="farm-overview-tab"
          type="button"
          role="tab"
          aria-controls="farm-overview-panel"
          aria-selected={tab === "overview"}
          tabIndex={tab === "overview" ? 0 : -1}
          onKeyDown={moveTab}
          onClick={() => setTab("overview")}
        >
          {c.overview}
        </button>
        <button
          ref={productsTabRef}
          id="farm-products-tab"
          type="button"
          role="tab"
          aria-controls="farm-products-panel"
          aria-selected={tab === "products"}
          tabIndex={tab === "products" ? 0 : -1}
          onKeyDown={moveTab}
          onClick={() => {
            setProductsVisited(true);
            setTab("products");
          }}
        >
          {c.productsAndSupply}
        </button>
      </div>
      <section
        id="farm-overview-panel"
        role="tabpanel"
        aria-labelledby="farm-overview-tab"
        hidden={tab !== "overview"}
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
                <dd>{locale === "vi" ? farm.location_vi : farm.location_en}</dd>
              </div>
              <div>
                <dt>{c.status}</dt>
                <dd>{farm.is_active ? c.active : c.inactive}</dd>
              </div>
            </dl>
          </div>
        </div>
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
      <section
        id="farm-products-panel"
        role="tabpanel"
        aria-labelledby="farm-products-tab"
        hidden={tab !== "products"}
      >
        {productsVisited && <FarmProducts key={farm.id} farmId={farm.id} />}
      </section>
      {dialog && (
        <ConfirmationDialog
          title={c.farmDelete}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={locale === "vi" ? "Hủy" : "Cancel"}
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
