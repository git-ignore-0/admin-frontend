"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import type {
  Locale,
  MediaAsset,
  Testimonial,
  TestimonialStatus,
  TestimonialTranslation,
  TestimonialType,
} from "@/lib/types";

type TranslationForm = Pick<TestimonialTranslation, "role" | "location" | "quote" | "full_story">;
type TranslationState = Record<Locale, TranslationForm>;

const emptyTranslation = (): TranslationForm => ({
  role: "",
  location: "",
  quote: "",
  full_story: "",
});

const emptyTranslations = (): TranslationState => ({
  vi: emptyTranslation(),
  en: emptyTranslation(),
});

function translationsFromTestimonial(testimonial: Testimonial): TranslationState {
  const byLocale = new Map(
    testimonial.translations.map((translation) => [translation.locale, translation]),
  );
  return {
    vi: {
      role: byLocale.get("vi")?.role ?? "",
      location: byLocale.get("vi")?.location ?? "",
      quote: byLocale.get("vi")?.quote ?? "",
      full_story: byLocale.get("vi")?.full_story ?? "",
    },
    en: {
      role: byLocale.get("en")?.role ?? "",
      location: byLocale.get("en")?.location ?? "",
      quote: byLocale.get("en")?.quote ?? "",
      full_story: byLocale.get("en")?.full_story ?? "",
    },
  };
}

function completeTranslation(value: TranslationForm) {
  return Object.values(value).every((field) => field.trim());
}

function parseSortOrder(value: string): number | null {
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

export function testimonialIsPublishable({
  consentConfirmed,
  displayName,
  sortOrder,
  translations,
}: {
  consentConfirmed: boolean;
  displayName: string;
  sortOrder: string;
  translations: TranslationState;
}) {
  return Boolean(
    displayName.trim() &&
    parseSortOrder(sortOrder) !== null &&
    consentConfirmed &&
    completeTranslation(translations.vi) &&
    completeTranslation(translations.en),
  );
}

export function TestimonialEditor({ testimonialId }: { testimonialId?: string }) {
  const { t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const savingRef = useRef(false);
  const persistedIdRef = useRef(testimonialId);
  const versionRef = useRef<number | null>(null);
  const imageRef = useRef<MediaAsset | null>(null);
  const selectedImageRef = useRef<File | null>(null);
  const preparedPublishRef = useRef<Testimonial | null>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(Boolean(testimonialId));
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [dialogConflict, setDialogConflict] = useState(false);
  const [serverConflict, setServerConflict] = useState<Testimonial | null>(null);
  const [editorConflict, setEditorConflict] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [type, setType] = useState<TestimonialType>("customer");
  const [status, setStatus] = useState<TestimonialStatus>("draft");
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [sortOrderError, setSortOrderError] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [image, setImage] = useState<MediaAsset | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [translations, setTranslations] = useState<TranslationState>(emptyTranslations);
  const busy = loading || saving || uploading;
  const canPublish = useMemo(
    () =>
      status !== "published" &&
      !editorConflict &&
      testimonialIsPublishable({ consentConfirmed, displayName, sortOrder, translations }),
    [consentConfirmed, displayName, editorConflict, sortOrder, status, translations],
  );

  useEffect(() => {
    if (!testimonialId) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void api<Testimonial>(`admin/testimonials/${testimonialId}`, { signal: controller.signal })
      .then((testimonial) => {
        if (controller.signal.aborted) return;
        applyAuthoritative(testimonial);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setLoadError(() => caught);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadAttempt, testimonialId]);

  useEffect(() => {
    if (!selectedImage || typeof URL.createObjectURL !== "function") {
      setPreviewUrl("");
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(selectedImage);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedImage]);

  function updateTranslation(locale: Locale, field: keyof TranslationForm, value: string) {
    setTranslations((current) => ({
      ...current,
      [locale]: { ...current[locale], [field]: value },
    }));
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(t.testimonials.imageTypeError);
      return;
    }
    setError("");
    selectedImageRef.current = file;
    setSelectedImage(file);
  }

  function applyAuthoritative(testimonial: Testimonial) {
    persistedIdRef.current = testimonial.id;
    versionRef.current = testimonial.version;
    imageRef.current = testimonial.image;
    selectedImageRef.current = null;
    setDisplayName(testimonial.display_name);
    setType(testimonial.type);
    setStatus(testimonial.status);
    setFeatured(testimonial.featured);
    setSortOrder(String(testimonial.sort_order));
    setConsentConfirmed(testimonial.consent_confirmed);
    setImage(testimonial.image);
    setSelectedImage(null);
    setTranslations(translationsFromTestimonial(testimonial));
  }

  async function persist(): Promise<Testimonial> {
    const parsedSortOrder = parseSortOrder(sortOrder);
    if (parsedSortOrder === null) {
      setSortOrderError(t.testimonials.sortOrderError);
      throw new Error("testimonial_sort_order_invalid");
    }
    if (!displayName.trim()) throw new Error("testimonial_display_name_required");
    let savedImage = imageRef.current;
    if (selectedImageRef.current) {
      setUploading(true);
      const body = new FormData();
      body.append("image", selectedImageRef.current);
      savedImage = await api<MediaAsset>("admin/testimonials/media", {
        method: "POST",
        body,
      });
      imageRef.current = savedImage;
      selectedImageRef.current = null;
      setImage(savedImage);
      setSelectedImage(null);
      setUploading(false);
    }
    const payload = {
      display_name: displayName.trim(),
      type,
      featured,
      sort_order: parsedSortOrder,
      image_id: savedImage?.id ?? null,
      consent_confirmed: consentConfirmed,
      translations: (["vi", "en"] as const).map((locale) => ({
        locale,
        role: translations[locale].role.trim(),
        location: translations[locale].location.trim(),
        quote: translations[locale].quote.trim(),
        full_story: translations[locale].full_story.trim(),
      })),
    };
    const persistedId = persistedIdRef.current;
    const saved = await api<Testimonial>(
      persistedId ? `admin/testimonials/${persistedId}` : "admin/testimonials",
      {
        method: persistedId ? "PATCH" : "POST",
        body: JSON.stringify(persistedId ? { ...payload, version: versionRef.current } : payload),
      },
    );
    if (!persistedId) {
      window.history.replaceState(window.history.state, "", `/testimonials/${saved.id}/edit`);
    }
    applyAuthoritative(saved);
    return saved;
  }

  async function captureServerConflict() {
    const persistedId = persistedIdRef.current;
    if (!persistedId) return;
    try {
      setServerConflict(await api<Testimonial>(`admin/testimonials/${persistedId}`));
    } catch {
      setServerConflict(null);
    }
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || uploading || editorConflict) return;
    setError("");
    setSortOrderError("");
    if (!displayName.trim()) {
      setError(t.common.invalidField.replace("{field}", t.testimonials.displayName));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await persist();
      toast(testimonialId ? t.testimonials.updated : t.testimonials.created);
      if (!testimonialId) router.replace(`/testimonials/${saved.id}`);
    } catch (caught) {
      if (caught instanceof Error && caught.message === "testimonial_sort_order_invalid") return;
      const apiError = caught as Error & { status?: number };
      if (apiError.status === 409) {
        setEditorConflict(true);
        setError(t.testimonials.editConflict);
        await captureServerConflict();
      } else {
        setError(requestErrorMessage(caught, t));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
      setUploading(false);
    }
  }

  function openPublishDialog() {
    if (!canPublish || busy) return;
    setDialogError("");
    setDialogConflict(false);
    preparedPublishRef.current = null;
    setDialogOpen(true);
  }

  async function confirmPublish() {
    if (!canPublish || dialogConflict || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setDialogError("");
    try {
      const saved = preparedPublishRef.current ?? (await persist());
      preparedPublishRef.current = saved;
      const published = await api<Testimonial>(`admin/testimonials/${saved.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ version: saved.version }),
      });
      applyAuthoritative(published);
      setDialogOpen(false);
      toast(t.testimonials.actionSuccess.publish);
      router.replace(`/testimonials/${published.id}`);
    } catch (caught) {
      const apiError = caught as Error & { status?: number };
      if (apiError.status === 409) {
        setDialogConflict(true);
        const persistedId = persistedIdRef.current;
        if (persistedId) {
          try {
            applyAuthoritative(await api<Testimonial>(`admin/testimonials/${persistedId}`));
          } catch {
            // Keep the conflict state and the last authoritative persisted draft.
          }
        }
      }
      setDialogError(
        apiError.status === 409
          ? t.testimonials.conflict
          : apiError.status === 400
            ? t.testimonials.validationError
            : requestErrorMessage(caught, t),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
      setUploading(false);
    }
  }

  if (loading) return <div className="panel">{t.testimonials.loadingDetail}</div>;
  if (loadError)
    return (
      <div className="panel load-error-state">
        <p className="error-box" role="alert">
          {requestErrorMessage(loadError, t)}
        </p>
        <button className="button secondary" onClick={() => setLoadAttempt((value) => value + 1)}>
          {t.common.retry}
        </button>
      </div>
    );

  return (
    <>
      <form className="testimonial-editor" noValidate onSubmit={saveDraft}>
        {error && (
          <div className="error-box retry-error" role="alert">
            <span>{error}</span>
            {editorConflict && (
              <button
                className="button secondary"
                onClick={() => {
                  void (async () => {
                    let latest = serverConflict;
                    if (!latest && persistedIdRef.current) {
                      try {
                        latest = await api<Testimonial>(
                          `admin/testimonials/${persistedIdRef.current}`,
                        );
                      } catch {
                        return;
                      }
                    }
                    if (!latest) return;
                    applyAuthoritative(latest);
                    setServerConflict(null);
                    setEditorConflict(false);
                    setError("");
                    preparedPublishRef.current = null;
                  })();
                }}
                type="button"
              >
                {t.testimonials.loadServerVersion}
              </button>
            )}
          </div>
        )}
        <section className="panel testimonial-basics" aria-labelledby="testimonial-basics-title">
          <div className="panel-head">
            <h2 id="testimonial-basics-title">{t.testimonials.basics}</h2>
          </div>
          <div className="testimonial-image-field">
            <div className="testimonial-image-preview">
              {previewUrl || image ? (
                <Image
                  alt={displayName || t.testimonials.imageAlt}
                  height={240}
                  src={previewUrl || mediaUrlForWidth(image!, 480)}
                  unoptimized
                  width={240}
                />
              ) : (
                <span>{t.testimonials.noImage}</span>
              )}
            </div>
            <div className="testimonial-image-actions">
              <label className="button secondary testimonial-upload-button">
                <span>
                  {uploading
                    ? t.testimonials.uploading
                    : selectedImage?.name || t.testimonials.chooseImage}
                </span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={selectImage}
                  type="file"
                />
              </label>
              {(image || selectedImage) && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    imageRef.current = null;
                    selectedImageRef.current = null;
                    setImage(null);
                    setSelectedImage(null);
                  }}
                  type="button"
                >
                  {t.testimonials.removeImage}
                </button>
              )}
              <small className="muted-copy">{t.testimonials.imageHelp}</small>
            </div>
          </div>

          <div className="form-grid testimonial-general-fields">
            <label className="field">
              <span>{t.testimonials.displayName} *</span>
              <input
                className="input"
                disabled={busy}
                maxLength={240}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
            <label className="field">
              <span>{t.testimonials.typeLabel} *</span>
              <select
                className="input"
                disabled={busy}
                onChange={(event) => setType(event.target.value as TestimonialType)}
                value={type}
              >
                {(Object.keys(t.testimonials.types) as TestimonialType[]).map((value) => (
                  <option key={value} value={value}>
                    {t.testimonials.types[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.testimonials.sortOrder}</span>
              <input
                aria-invalid={Boolean(sortOrderError)}
                className="input"
                disabled={busy}
                inputMode="numeric"
                onChange={(event) => {
                  setSortOrder(event.target.value.replace(/\D/g, ""));
                  setSortOrderError("");
                }}
                value={sortOrder}
              />
              {sortOrderError && (
                <small className="field-error" role="alert">
                  {sortOrderError}
                </small>
              )}
            </label>
            <div className="testimonial-checkboxes">
              <label className="checkbox field">
                <input
                  checked={featured}
                  disabled={busy}
                  onChange={(event) => setFeatured(event.target.checked)}
                  type="checkbox"
                />
                <span>{t.testimonials.featuredHelp}</span>
              </label>
              <label className="checkbox field">
                <input
                  checked={consentConfirmed}
                  disabled={busy}
                  onChange={(event) => setConsentConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>{t.testimonials.consent}</span>
              </label>
              <small className="muted-copy">{t.testimonials.consentHelp}</small>
            </div>
          </div>
        </section>

        <section className="testimonial-translation-grid" aria-label={t.testimonials.translations}>
          {(["vi", "en"] as const).map((locale) => {
            const complete = completeTranslation(translations[locale]);
            return (
              <div className="panel" key={locale}>
                <div className="panel-head">
                  <div>
                    <h2>{locale === "vi" ? t.common.vietnamese : t.common.english}</h2>
                    <p className="muted-copy">{t.testimonials.translationHelp}</p>
                  </div>
                  <span className={`badge ${complete ? "" : "warm"}`}>
                    {complete ? t.testimonials.complete : t.testimonials.incomplete}
                  </span>
                </div>
                <div className="form-grid one">
                  <label className="field">
                    <span>{t.testimonials.role}</span>
                    <input
                      className="input"
                      disabled={busy}
                      maxLength={240}
                      onChange={(event) => updateTranslation(locale, "role", event.target.value)}
                      value={translations[locale].role}
                    />
                  </label>
                  <label className="field">
                    <span>{t.testimonials.location}</span>
                    <input
                      className="input"
                      disabled={busy}
                      maxLength={240}
                      onChange={(event) =>
                        updateTranslation(locale, "location", event.target.value)
                      }
                      value={translations[locale].location}
                    />
                  </label>
                  <label className="field">
                    <span>{t.testimonials.quote}</span>
                    <textarea
                      className="textarea"
                      disabled={busy}
                      maxLength={800}
                      onChange={(event) => updateTranslation(locale, "quote", event.target.value)}
                      value={translations[locale].quote}
                    />
                  </label>
                  <label className="field">
                    <span>{t.testimonials.fullStory}</span>
                    <textarea
                      className="textarea testimonial-story-input"
                      disabled={busy}
                      maxLength={20_000}
                      onChange={(event) =>
                        updateTranslation(locale, "full_story", event.target.value)
                      }
                      value={translations[locale].full_story}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </section>

        <div className="form-actions">
          <Link
            aria-disabled={busy}
            className="button secondary"
            href={
              persistedIdRef.current ? `/testimonials/${persistedIdRef.current}` : "/testimonials"
            }
            onClick={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            {t.testimonials.cancel}
          </Link>
          <button className="button secondary" disabled={busy || editorConflict} type="submit">
            {saving ? t.testimonials.saving : t.testimonials.save}
          </button>
          {status !== "published" && (
            <button
              className="button"
              disabled={busy || !canPublish}
              onClick={openPublishDialog}
              ref={publishButtonRef}
              type="button"
            >
              {t.testimonials.publish}
            </button>
          )}
          {!canPublish && status !== "published" && (
            <small className="form-action-help">{t.testimonials.publishUnavailable}</small>
          )}
        </div>
      </form>

      {dialogOpen && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={t.testimonials.processing}
          cancelLabel={t.testimonials.cancel}
          confirmDisabled={dialogConflict}
          confirmLabel={t.testimonials.confirmAction.publish}
          error={dialogError}
          onCancel={() => {
            if (saving) return;
            setDialogOpen(false);
            setDialogConflict(false);
            preparedPublishRef.current = null;
          }}
          onConfirm={confirmPublish}
          returnFocusRef={publishButtonRef}
          title={t.testimonials.actionTitle.publish}
        >
          <p>{t.testimonials.actionBody.publish.replace("{name}", displayName.trim())}</p>
        </ConfirmationDialog>
      )}
    </>
  );
}
