"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { useToast } from "@/components/toast-provider";
import { formatAdminDateTime } from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import type { Locale, Testimonial, TestimonialStatus, TestimonialTranslation } from "@/lib/types";

type TestimonialAction = "publish" | "hide" | "unpublish";

function canPublish(item: Testimonial) {
  const byLocale = new Map(
    item.translations.map((translation) => [translation.locale, translation]),
  );
  return (
    item.consent_confirmed && byLocale.get("vi")?.is_complete && byLocale.get("en")?.is_complete
  );
}

export function TestimonialDetail({ testimonialId }: { testimonialId: string }) {
  const { t } = useAdminI18n();
  const toast = useToast();
  const savingRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const [item, setItem] = useState<Testimonial | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [action, setAction] = useState<TestimonialAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionConflict, setActionConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const sequence = ++requestSequenceRef.current;
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    try {
      const testimonial = await api<Testimonial>(`admin/testimonials/${testimonialId}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || sequence !== requestSequenceRef.current) return null;
      setItem(testimonial);
      setLoadError(null);
      return testimonial;
    } catch (caught) {
      if (controller.signal.aborted || sequence !== requestSequenceRef.current) return null;
      setLoadError(() => caught);
      return null;
    } finally {
      if (!controller.signal.aborted && sequence === requestSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [testimonialId]);

  useEffect(() => {
    void load();
    return () => {
      requestSequenceRef.current += 1;
      loadControllerRef.current?.abort();
    };
  }, [load]);

  function openAction(nextAction: TestimonialAction, button: HTMLButtonElement) {
    if (saving) return;
    actionButtonRef.current = button;
    setAction(nextAction);
    setActionError("");
    setActionConflict(false);
  }

  function closeAction() {
    if (saving) return;
    setAction(null);
    setActionError("");
    setActionConflict(false);
  }

  async function confirmAction() {
    if (!item || !action || actionConflict || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      const updated = await api<Testimonial>(`admin/testimonials/${item.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ version: item.version }),
      });
      setItem(updated);
      setAction(null);
      toast(t.testimonials.actionSuccess[action]);
      window.setTimeout(() => headingRef.current?.focus(), 0);
    } catch (caught) {
      const apiError = caught as Error & { status?: number };
      if (apiError.status === 409) {
        setActionConflict(true);
        await load();
      }
      setActionError(
        apiError.status === 409
          ? t.testimonials.conflict
          : apiError.status === 400
            ? t.testimonials.validationError
            : requestErrorMessage(caught, t),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loadError && !item)
    return (
      <div className="panel load-error-state">
        <p className="error-box" role="alert">
          {requestErrorMessage(loadError, t)}
        </p>
        <button className="button secondary" disabled={loading} onClick={() => void load()}>
          {t.common.retry}
        </button>
      </div>
    );
  if (!item) return <div className="panel">{t.testimonials.loadingDetail}</div>;

  const publishReady = Boolean(canPublish(item));
  const statusLabels: Record<TestimonialStatus, string> = t.testimonials.statuses;
  const translations = new Map(
    item.translations.map((translation) => [translation.locale, translation]),
  );

  return (
    <>
      <DetailPageHeading
        backHref="/testimonials"
        backLabel={t.testimonials.backLabel}
        description={`${t.testimonials.types[item.type]} · ${statusLabels[item.status]}`}
        title={t.testimonials.detailTitle}
      />
      {loadError && (
        <div className="error-box retry-error" role="alert">
          <span>{requestErrorMessage(loadError, t)}</span>
          <button className="button secondary" disabled={loading} onClick={() => void load()}>
            {t.common.retry}
          </button>
        </div>
      )}

      <section className="testimonial-hero" aria-labelledby="testimonial-detail-name">
        <div className="testimonial-hero-identity">
          {item.image ? (
            <Image
              alt={item.display_name}
              className="testimonial-detail-image"
              height={160}
              src={mediaUrlForWidth(item.image, 480)}
              unoptimized
              width={160}
            />
          ) : (
            <span className="testimonial-detail-image placeholder">
              {item.display_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <span className={`badge testimonial-status ${item.status}`}>
              {statusLabels[item.status]}
            </span>
            <h2 id="testimonial-detail-name" ref={headingRef} tabIndex={-1}>
              {item.display_name}
            </h2>
            <p>
              {t.testimonials.types[item.type]} ·{" "}
              {item.featured ? t.testimonials.featured : t.testimonials.notFeatured}
            </p>
          </div>
        </div>
        <div className="testimonial-detail-actions" aria-label={t.testimonials.statusLabel}>
          <Link className="button secondary" href={`/testimonials/${item.id}/edit`}>
            {t.testimonials.edit}
          </Link>
          {item.status !== "published" && (
            <button
              aria-describedby={!publishReady ? "testimonial-publish-help" : undefined}
              className="button"
              disabled={saving || !publishReady}
              onClick={(event) => openAction("publish", event.currentTarget)}
              type="button"
            >
              {t.testimonials.publish}
            </button>
          )}
          {item.status !== "hidden" && (
            <button
              className="button danger"
              disabled={saving}
              onClick={(event) => openAction("hide", event.currentTarget)}
              type="button"
            >
              {t.testimonials.hide}
            </button>
          )}
          {item.status !== "draft" && (
            <button
              className="button secondary"
              disabled={saving}
              onClick={(event) => openAction("unpublish", event.currentTarget)}
              type="button"
            >
              {t.testimonials.moveToDraft}
            </button>
          )}
        </div>
      </section>
      {!publishReady && item.status !== "published" && (
        <p className="notice-box" id="testimonial-publish-help">
          {t.testimonials.publishUnavailable}
        </p>
      )}

      <div className="testimonial-detail-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>{t.testimonials.generalInformation}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow label={t.testimonials.typeLabel} value={t.testimonials.types[item.type]} />
            <DetailRow
              label={t.testimonials.featured}
              value={item.featured ? t.testimonials.featured : t.testimonials.notFeatured}
            />
            <DetailRow label={t.testimonials.sortOrder} value={String(item.sort_order)} />
            <DetailRow
              label={t.testimonials.consent}
              value={item.consent_confirmed ? t.testimonials.complete : t.testimonials.incomplete}
            />
            <DetailRow
              label={t.testimonials.createdAt}
              value={formatAdminDateTime(item.created_at)}
            />
            <DetailRow
              label={t.testimonials.updatedAt}
              value={formatAdminDateTime(item.updated_at)}
            />
            <DetailRow
              label={t.testimonials.publishedAt}
              value={formatAdminDateTime(item.published_at)}
            />
            <DetailRow label={t.testimonials.createdBy} value={item.created_by?.name || "—"} />
            <DetailRow label={t.testimonials.updatedBy} value={item.updated_by?.name || "—"} />
          </dl>
        </section>

        <section className="testimonial-detail-translations" aria-label={t.testimonials.content}>
          {(["vi", "en"] as const).map((locale) => (
            <TranslationDetail
              key={locale}
              label={locale === "vi" ? t.common.vietnamese : t.common.english}
              locale={locale}
              translation={translations.get(locale)}
            />
          ))}
        </section>
      </div>

      {action && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={t.testimonials.processing}
          cancelLabel={t.testimonials.cancel}
          confirmDisabled={actionConflict}
          confirmLabel={t.testimonials.confirmAction[action]}
          danger={action === "hide"}
          error={actionError}
          fallbackFocusRef={headingRef}
          onCancel={closeAction}
          onConfirm={confirmAction}
          returnFocusRef={actionButtonRef}
          title={t.testimonials.actionTitle[action]}
        >
          <p>{t.testimonials.actionBody[action].replace("{name}", item.display_name)}</p>
        </ConfirmationDialog>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TranslationDetail({
  label,
  locale,
  translation,
}: {
  label: string;
  locale: Locale;
  translation?: TestimonialTranslation;
}) {
  const { t } = useAdminI18n();
  return (
    <article className="panel testimonial-translation-detail">
      <div className="panel-head">
        <div>
          <h2>{label}</h2>
          <span className="locale-code">{locale.toUpperCase()}</span>
        </div>
        <span className={`badge ${translation?.is_complete ? "" : "warm"}`}>
          {translation?.is_complete ? t.testimonials.complete : t.testimonials.incomplete}
        </span>
      </div>
      <dl className="detail-list testimonial-content-list">
        <DetailRow label={t.testimonials.role} value={translation?.role || "—"} />
        <DetailRow label={t.testimonials.location} value={translation?.location || "—"} />
        <DetailRow label={t.testimonials.quote} value={translation?.quote || "—"} />
        <DetailRow label={t.testimonials.fullStory} value={translation?.full_story || "—"} />
      </dl>
    </article>
  );
}
