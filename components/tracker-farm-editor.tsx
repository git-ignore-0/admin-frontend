"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { isSupportedImageFile } from "@/lib/image-validation";
import { mediaUrlForWidth } from "@/lib/media";
import type { MediaAsset, TrackerFarm } from "@/lib/types";
import { trackerMilestone } from "@/components/tracker-farm-manager";

type FormState = Omit<
  TrackerFarm,
  "id" | "created_at" | "updated_at" | "sort_order" | "image" | "photos" | "signup_count"
> & {
  id?: string;
  photos: MediaAsset[];
  signup_count: string;
};
type UploadItem = {
  id: number;
  name: string;
  status: "queued" | "uploading" | "error";
  message?: string;
};

const MAX_PHOTOS = 12;
const emptyForm: FormState = {
  name_en: "",
  name_vi: "",
  location_en: "",
  location_vi: "",
  description_en: "",
  description_vi: "",
  photos: [],
  signup_count: "0",
  is_visible: true,
  version: 0,
};
function fromFarm(farm: TrackerFarm): FormState {
  const photos = Array.isArray(farm.photos) ? farm.photos : farm.image ? [farm.image] : [];
  return {
    name_en: farm.name_en,
    name_vi: farm.name_vi,
    location_en: farm.location_en,
    location_vi: farm.location_vi,
    description_en: farm.description_en,
    description_vi: farm.description_vi,
    photos,
    signup_count: String(farm.signup_count),
    is_visible: farm.is_visible,
    version: farm.version,
  };
}
function icon(count: number) {
  return count >= 30 ? "🌳 🌱" : count >= 20 ? "🌳" : count >= 10 ? "🌱" : "🌰";
}

export function TrackerFarmEditor({ farmId }: { farmId?: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const router = useRouter();
  const savingRef = useRef(false);
  const uploadingRef = useRef(false);
  const mountedRef = useRef(false);
  const uploadIdRef = useRef(0);
  const persistedPhotoIdsRef = useRef(new Set<string>());
  const sessionUploadedPhotoIdsRef = useRef(new Set<string>());
  const cleanupRequestsRef = useRef(new Map<string, Promise<void>>());
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(Boolean(farmId));
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [galleryError, setGalleryError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reloadingLatest, setReloadingLatest] = useState(false);
  const cleanupTemporaryPhoto = useCallback((photoId: string) => {
    if (
      !sessionUploadedPhotoIdsRef.current.has(photoId) ||
      persistedPhotoIdsRef.current.has(photoId)
    ) {
      return Promise.resolve();
    }
    const pending = cleanupRequestsRef.current.get(photoId);
    if (pending) return pending;
    const request = Promise.resolve()
      .then(() => apiEnvelope(`admin/tracker-farms/media/${photoId}`, { method: "DELETE" }))
      .then(() => {
        sessionUploadedPhotoIdsRef.current.delete(photoId);
      })
      .catch(() => undefined)
      .finally(() => {
        cleanupRequestsRef.current.delete(photoId);
      });
    cleanupRequestsRef.current.set(photoId, request);
    return request;
  }, []);
  const cleanupTemporaryPhotos = useCallback(async () => {
    const photoIds = [...sessionUploadedPhotoIdsRef.current].filter(
      (photoId) => !persistedPhotoIdsRef.current.has(photoId),
    );
    await Promise.all(photoIds.map(cleanupTemporaryPhoto));
  }, [cleanupTemporaryPhoto]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void cleanupTemporaryPhotos();
    };
  }, [cleanupTemporaryPhotos]);
  useEffect(() => {
    if (!farmId) return;
    let live = true;
    setLoading(true);
    api<TrackerFarm[]>("admin/tracker-farms")
      .then((farms) => {
        const farm = farms.find((item) => item.id === farmId);
        if (!farm) throw new Error("tracker_farm_not_found");
        if (live) {
          const draft = fromFarm(farm);
          persistedPhotoIdsRef.current = new Set(draft.photos.map((photo) => photo.id));
          setForm(draft);
        }
      })
      .catch((caught) => live && setLoadError(requestErrorMessage(caught, t)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [attempt, farmId, t]);
  const uploading = uploadItems.some((item) => item.status !== "error");
  const hasUploadErrors = uploadItems.some((item) => item.status === "error");
  function update(field: keyof FormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setError("");
  }
  function signup(value: string) {
    if (value && !/^\d+$/.test(value)) {
      setErrors((current) => ({ ...current, signup_count: t.trackerFarms.signupInvalid }));
      return;
    }
    update("signup_count", value);
  }
  function paste(event: ClipboardEvent<HTMLInputElement>) {
    if (!/^\d+$/.test(event.clipboardData.getData("text"))) {
      event.preventDefault();
      setErrors((current) => ({ ...current, signup_count: t.trackerFarms.signupInvalid }));
    }
  }
  async function selectPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || uploadingRef.current) return;

    const supportedFiles = files.filter(isSupportedImageFile);
    if (supportedFiles.length > MAX_PHOTOS - form.photos.length) {
      setGalleryError(t.trackerFarms.photoLimit);
      return;
    }

    setGalleryError("");
    setError("");
    const invalidItems = files
      .filter((file) => !isSupportedImageFile(file))
      .map<UploadItem>((file) => ({
        id: ++uploadIdRef.current,
        name: file.name,
        status: "error",
        message: t.trackerFarms.imageTypeError,
      }));
    const uploadJobs = supportedFiles.map((file) => ({
      file,
      item: {
        id: ++uploadIdRef.current,
        name: file.name,
        status: "queued" as const,
      },
    }));
    setUploadItems((current) => [
      ...current,
      ...invalidItems,
      ...uploadJobs.map(({ item }) => item),
    ]);
    if (!uploadJobs.length) return;

    uploadingRef.current = true;
    for (const { file, item } of uploadJobs) {
      if (!mountedRef.current) break;
      setUploadItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id ? { ...currentItem, status: "uploading" } : currentItem,
        ),
      );
      try {
        const body = new FormData();
        body.append("image", file);
        const photo = await api<MediaAsset>("admin/tracker-farms/media", {
          method: "POST",
          body,
        });
        if (!persistedPhotoIdsRef.current.has(photo.id)) {
          sessionUploadedPhotoIdsRef.current.add(photo.id);
        }
        if (!mountedRef.current) {
          void cleanupTemporaryPhoto(photo.id);
          break;
        }
        setForm((current) => ({ ...current, photos: [...current.photos, photo] }));
        setUploadItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      } catch {
        if (!mountedRef.current) break;
        setUploadItems((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? {
                  ...currentItem,
                  status: "error",
                  message: t.trackerFarms.photoUploadFailed.replace("{name}", file.name),
                }
              : currentItem,
          ),
        );
      }
    }
    uploadingRef.current = false;
  }
  function movePhoto(index: number, offset: -1 | 1) {
    setForm((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.photos.length) return current;
      const photos = [...current.photos];
      [photos[index], photos[target]] = [photos[target], photos[index]];
      return { ...current, photos };
    });
  }
  function removePhoto(index: number) {
    const photo = form.photos[index];
    if (!photo) return;
    void cleanupTemporaryPhoto(photo.id);
    setForm((current) => ({
      ...current,
      photos: current.photos.filter((_photo, photoIndex) => photoIndex !== index),
    }));
  }
  async function reloadLatest() {
    if (!farmId || reloadingLatest) return;
    setReloadingLatest(true);
    setError("");
    try {
      const farms = await api<TrackerFarm[]>("admin/tracker-farms");
      const fresh = farms.find((farm) => farm.id === farmId);
      if (!fresh) throw new Error("tracker_farm_not_found");
      await cleanupTemporaryPhotos();
      const draft = fromFarm(fresh);
      persistedPhotoIdsRef.current = new Set(draft.photos.map((photo) => photo.id));
      setForm(draft);
      setUploadItems([]);
      setGalleryError("");
      setErrors({});
      setConflict(false);
    } catch (caught) {
      setError(requestErrorMessage(caught, t));
    } finally {
      setReloadingLatest(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || uploading || hasUploadErrors || conflict) return;
    const next: Record<string, string> = {};
    for (const key of ["name_en", "name_vi", "location_en", "location_vi"] as const)
      if (!form[key].trim()) next[key] = t.trackerFarms.required;
    if (!form.signup_count) next.signup_count = t.trackerFarms.required;
    else if (!/^\d+$/.test(form.signup_count) || !Number.isSafeInteger(Number(form.signup_count)))
      next.signup_count = t.trackerFarms.signupInvalid;
    setErrors(next);
    if (Object.keys(next).length) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const payload = {
        name_en: form.name_en.trim(),
        name_vi: form.name_vi.trim(),
        location_en: form.location_en.trim(),
        location_vi: form.location_vi.trim(),
        description_en: form.description_en.trim(),
        description_vi: form.description_vi.trim(),
        photo_ids: form.photos.map((photo) => photo.id),
        signup_count: Number(form.signup_count),
        is_visible: form.is_visible,
      };
      await api<TrackerFarm>(farmId ? `admin/tracker-farms/${farmId}` : "admin/tracker-farms", {
        method: farmId ? "PATCH" : "POST",
        body: JSON.stringify(farmId ? { ...payload, version: form.version } : payload),
      });
      sessionUploadedPhotoIdsRef.current.clear();
      toast(farmId ? t.trackerFarms.updated : t.trackerFarms.created);
      router.replace("/tracker-farms");
      router.refresh();
    } catch (caught) {
      const status = caught instanceof Error ? (caught as Error & { status?: number }).status : 0;
      if (status === 409 && farmId) {
        setConflict(true);
        setError("");
        toast(t.trackerFarms.editorConflict, "error");
      } else setError(requestErrorMessage(caught, t));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  if (loading) return <div className="panel">{t.trackerFarms.loading}</div>;
  if (loadError)
    return (
      <div className="panel load-error-state">
        <p className="error-box" role="alert">
          {loadError}
        </p>
        <button
          className="button secondary"
          onClick={() => setAttempt((value) => value + 1)}
          type="button"
        >
          {t.common.retry}
        </button>
      </div>
    );
  const count = /^\d+$/.test(form.signup_count) ? Number(form.signup_count) : 0;
  async function cancel(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (saving || uploading) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    await cleanupTemporaryPhotos();
    router.push("/tracker-farms");
  }
  return (
    <form className="reward-editor tracker-farm-editor" noValidate onSubmit={submit}>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {conflict && (
        <div className="error-box tracker-farm-conflict" role="alert">
          <p>{t.trackerFarms.editorConflict}</p>
          <button
            className="button secondary"
            disabled={reloadingLatest}
            onClick={() => void reloadLatest()}
            type="button"
          >
            {reloadingLatest ? t.trackerFarms.reloadingLatest : t.trackerFarms.reloadLatest}
          </button>
        </div>
      )}
      <section className="panel reward-basics" aria-labelledby="tracker-basics">
        <div className="panel-head">
          <div>
            <h2 id="tracker-basics">{t.trackerFarms.basics}</h2>
            <p className="muted-copy">{t.trackerFarms.basicsHelp}</p>
          </div>
          <span className={`badge ${form.is_visible ? "" : "warm"}`}>
            {form.is_visible ? t.trackerFarms.visible : t.trackerFarms.hidden}
          </span>
        </div>
        <div className="tracker-farm-basics-layout">
          <label className="field tracker-farm-signup-field">
            <span>{t.trackerFarms.totalSignups} *</span>
            <input
              aria-label={`${t.trackerFarms.totalSignups} *`}
              aria-invalid={Boolean(errors.signup_count)}
              className="input"
              disabled={saving || uploading}
              inputMode="numeric"
              onChange={(event) => signup(event.target.value)}
              onPaste={paste}
              type="text"
              value={form.signup_count}
            />
            {errors.signup_count && <small className="field-error">{errors.signup_count}</small>}
          </label>
          <div className="tracker-milestone-preview" role="status">
            {t.trackerFarms.milestonePreview.replace(
              "{milestone}",
              t.trackerFarms[trackerMilestone(count)],
            )}
          </div>
          <label className="checkbox field tracker-farm-visibility">
            <input
              checked={form.is_visible}
              disabled={saving || uploading}
              onChange={(event) => update("is_visible", event.target.checked)}
              type="checkbox"
            />
            <span>{t.trackerFarms.visibleToggle}</span>
          </label>
        </div>
      </section>
      <section className="panel tracker-photo-section" aria-labelledby="tracker-photos-title">
        <div className="panel-head">
          <div>
            <h2 id="tracker-photos-title">{t.trackerFarms.photos}</h2>
            <p className="muted-copy">{t.trackerFarms.imageHelp}</p>
          </div>
          <span className="badge tracker-photo-count">
            {t.trackerFarms.photoCount.replace("{count}", String(form.photos.length))}
          </span>
        </div>
        <div className="tracker-photo-upload-row">
          <label className="button secondary reward-upload-button">
            <span>
              {uploading
                ? t.trackerFarms.uploading
                : form.photos.length
                  ? t.trackerFarms.addPhotos
                  : t.trackerFarms.choosePhotos}
            </span>
            <input
              accept="image/jpeg,image/png,image/webp"
              disabled={saving || uploading || form.photos.length >= MAX_PHOTOS}
              multiple
              onChange={(event) => void selectPhotos(event)}
              type="file"
            />
          </label>
          {galleryError && (
            <p className="field-error" role="alert">
              {galleryError}
            </p>
          )}
        </div>
        {uploadItems.length > 0 && (
          <ul className="tracker-photo-upload-status" aria-live="polite">
            {uploadItems.map((item) => (
              <li className={item.status === "error" ? "is-error" : undefined} key={item.id}>
                <span>
                  {item.status === "queued"
                    ? t.trackerFarms.waitingToUpload.replace("{name}", item.name)
                    : item.status === "uploading"
                      ? t.trackerFarms.uploadingFile.replace("{name}", item.name)
                      : item.message}
                </span>
                {item.status === "error" && (
                  <button
                    aria-label={t.trackerFarms.dismissUploadError.replace("{name}", item.name)}
                    className="button secondary tracker-upload-dismiss"
                    onClick={() =>
                      setUploadItems((current) =>
                        current.filter((currentItem) => currentItem.id !== item.id),
                      )
                    }
                    type="button"
                  >
                    {t.common.close}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {form.photos.length > 0 ? (
          <ul className="tracker-photo-gallery">
            {form.photos.map((photo, index) => {
              const position = String(index + 1);
              const farmName = locale === "vi" ? form.name_vi : form.name_en;
              const removeLabel = t.trackerFarms.removePhoto.replace("{position}", position);
              return (
                <li className="tracker-photo-item" key={photo.id}>
                  <div className="tracker-photo-preview">
                    <Image
                      alt={farmName || `${t.trackerFarms.photos} ${position}`}
                      height={180}
                      src={mediaUrlForWidth(photo, 480)}
                      unoptimized
                      width={240}
                    />
                    {index === 0 && (
                      <span className="badge tracker-photo-primary">
                        {t.trackerFarms.primaryPhoto}
                      </span>
                    )}
                  </div>
                  <div className="tracker-photo-actions">
                    <button
                      aria-label={t.trackerFarms.movePhotoEarlier.replace("{position}", position)}
                      className="button secondary"
                      disabled={saving || uploading || index === 0}
                      onClick={() => movePhoto(index, -1)}
                      type="button"
                    >
                      <span aria-hidden="true">←</span>
                    </button>
                    <button
                      aria-label={t.trackerFarms.movePhotoLater.replace("{position}", position)}
                      className="button secondary"
                      disabled={saving || uploading || index === form.photos.length - 1}
                      onClick={() => movePhoto(index, 1)}
                      type="button"
                    >
                      <span aria-hidden="true">→</span>
                    </button>
                    <button
                      aria-label={removeLabel}
                      className="button danger icon-only-action"
                      disabled={saving || uploading}
                      onClick={() => removePhoto(index)}
                      title={removeLabel}
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
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="tracker-photo-empty">
            <span aria-label={t.trackerFarms.noImage} role="img">
              {icon(count)}
            </span>
            <p className="muted-copy">{t.trackerFarms.noImage}</p>
          </div>
        )}
      </section>
      <section className="reward-translation-grid" aria-label={t.trackerFarms.translations}>
        {(["en", "vi"] as const).map((locale) => (
          <div className="panel" key={locale}>
            <div className="panel-head">
              <h2>{locale === "en" ? t.common.english : t.common.vietnamese}</h2>
              <span className="locale-code">{locale.toUpperCase()}</span>
            </div>
            <div className="form-grid one">
              <label className="field">
                <span>{locale === "en" ? t.trackerFarms.nameEn : t.trackerFarms.nameVi} *</span>
                <input
                  aria-label={`${locale === "en" ? t.trackerFarms.nameEn : t.trackerFarms.nameVi} *`}
                  aria-invalid={Boolean(errors[`name_${locale}`])}
                  className="input"
                  disabled={saving || uploading}
                  lang={locale}
                  onChange={(event) =>
                    update(`name_${locale}` as keyof FormState, event.target.value)
                  }
                  value={form[`name_${locale}`]}
                />
                {errors[`name_${locale}`] && (
                  <small className="field-error">{errors[`name_${locale}`]}</small>
                )}
              </label>
              <label className="field">
                <span>
                  {locale === "en" ? t.trackerFarms.locationEn : t.trackerFarms.locationVi} *
                </span>
                <input
                  aria-label={`${locale === "en" ? t.trackerFarms.locationEn : t.trackerFarms.locationVi} *`}
                  aria-invalid={Boolean(errors[`location_${locale}`])}
                  className="input"
                  disabled={saving || uploading}
                  lang={locale}
                  onChange={(event) =>
                    update(`location_${locale}` as keyof FormState, event.target.value)
                  }
                  value={form[`location_${locale}`]}
                />
                {errors[`location_${locale}`] && (
                  <small className="field-error">{errors[`location_${locale}`]}</small>
                )}
              </label>
              <label className="field">
                <span>
                  {locale === "en" ? t.trackerFarms.descriptionEn : t.trackerFarms.descriptionVi}
                </span>
                <textarea
                  aria-label={
                    locale === "en" ? t.trackerFarms.descriptionEn : t.trackerFarms.descriptionVi
                  }
                  className="textarea"
                  disabled={saving || uploading}
                  lang={locale}
                  onChange={(event) =>
                    update(`description_${locale}` as keyof FormState, event.target.value)
                  }
                  value={form[`description_${locale}`]}
                />
              </label>
            </div>
          </div>
        ))}
      </section>
      <div className="form-actions">
        <Link
          aria-disabled={saving || uploading}
          className="button secondary"
          href="/tracker-farms"
          onClick={(event) => void cancel(event)}
        >
          {t.trackerFarms.cancel}
        </Link>
        <button
          className="button"
          disabled={saving || uploading || hasUploadErrors || conflict || reloadingLatest}
          type="submit"
        >
          {saving
            ? t.trackerFarms.saving
            : farmId
              ? t.trackerFarms.saveAction
              : t.trackerFarms.createAction}
        </button>
      </div>
    </form>
  );
}
