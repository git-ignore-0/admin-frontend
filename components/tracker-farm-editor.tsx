"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, ClipboardEvent, FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { isSupportedImageFile } from "@/lib/image-validation";
import { mediaUrlForWidth } from "@/lib/media";
import type { MediaAsset, TrackerFarm } from "@/lib/types";
import { trackerMilestone } from "@/components/tracker-farm-manager";

type FormState = Omit<
  TrackerFarm,
  "id" | "created_at" | "updated_at" | "sort_order" | "image" | "signup_count"
> & {
  id?: string;
  image: MediaAsset | null;
  selectedImage: File | null;
  signup_count: string;
};
const emptyForm: FormState = {
  name_en: "",
  name_vi: "",
  location_en: "",
  location_vi: "",
  description_en: "",
  description_vi: "",
  image: null,
  selectedImage: null,
  signup_count: "0",
  is_visible: true,
  version: 0,
};
function fromFarm(farm: TrackerFarm): FormState {
  return {
    ...farm,
    image: farm.image,
    selectedImage: null,
    signup_count: String(farm.signup_count),
  };
}
function icon(count: number) {
  return count >= 30 ? "🌳 🌱" : count >= 20 ? "🌳" : count >= 10 ? "🌱" : "🌰";
}

export function TrackerFarmEditor({ farmId }: { farmId?: string }) {
  const { t } = useAdminI18n();
  const toast = useToast();
  const router = useRouter();
  const savingRef = useRef(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(Boolean(farmId));
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloadingLatest, setReloadingLatest] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!farmId) return;
    let live = true;
    setLoading(true);
    api<TrackerFarm[]>("admin/tracker-farms")
      .then((farms) => {
        const farm = farms.find((item) => item.id === farmId);
        if (!farm) throw new Error("tracker_farm_not_found");
        if (live) setForm(fromFarm(farm));
      })
      .catch((caught) => live && setLoadError(requestErrorMessage(caught, t)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [attempt, farmId, t]);
  useEffect(() => {
    if (!form.selectedImage || typeof URL.createObjectURL !== "function") {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(form.selectedImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [form.selectedImage]);
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
  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isSupportedImageFile(file)) {
      setError(t.trackerFarms.imageTypeError);
      return;
    }
    setForm((current) => ({ ...current, selectedImage: file }));
    setError("");
  }
  async function reloadLatest() {
    if (!farmId || reloadingLatest) return;
    setReloadingLatest(true);
    setError("");
    try {
      const farms = await api<TrackerFarm[]>("admin/tracker-farms");
      const fresh = farms.find((farm) => farm.id === farmId);
      if (!fresh) throw new Error("tracker_farm_not_found");
      setForm(fromFarm(fresh));
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
    if (savingRef.current || uploading || conflict) return;
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
      let image = form.image;
      if (form.selectedImage) {
        setUploading(true);
        try {
          const body = new FormData();
          body.append("image", form.selectedImage);
          image = await api<MediaAsset>("admin/tracker-farms/media", { method: "POST", body });
          setForm((current) => ({ ...current, image, selectedImage: null }));
        } catch {
          setError(t.trackerFarms.imageUploadFailed);
          return;
        } finally {
          setUploading(false);
        }
      }
      const payload = {
        name_en: form.name_en.trim(),
        name_vi: form.name_vi.trim(),
        location_en: form.location_en.trim(),
        location_vi: form.location_vi.trim(),
        description_en: form.description_en.trim(),
        description_vi: form.description_vi.trim(),
        image_id: image?.id ?? null,
        signup_count: Number(form.signup_count),
        is_visible: form.is_visible,
      };
      await api<TrackerFarm>(farmId ? `admin/tracker-farms/${farmId}` : "admin/tracker-farms", {
        method: farmId ? "PATCH" : "POST",
        body: JSON.stringify(farmId ? { ...payload, version: form.version } : payload),
      });
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
      setUploading(false);
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
          <div className="reward-image-field">
            <div className="reward-image-preview">
              {previewUrl || form.image ? (
                <Image
                  alt={form.name_en || t.trackerFarms.image}
                  height={180}
                  src={previewUrl || mediaUrlForWidth(form.image!, 480)}
                  unoptimized
                  width={240}
                />
              ) : (
                <span aria-label={t.trackerFarms.noImage} role="img">
                  {icon(count)}
                </span>
              )}
            </div>
            <div>
              <label className="button secondary reward-upload-button">
                <span>
                  {uploading
                    ? t.trackerFarms.uploading
                    : form.selectedImage?.name || form.image
                      ? t.trackerFarms.changeImage
                      : t.trackerFarms.chooseImage}
                </span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={saving || uploading}
                  onChange={selectImage}
                  type="file"
                />
              </label>
              {(form.image || form.selectedImage) && (
                <button
                  className="button secondary"
                  disabled={saving || uploading}
                  onClick={() =>
                    setForm((current) => ({ ...current, image: null, selectedImage: null }))
                  }
                  type="button"
                >
                  {t.trackerFarms.removeImage}
                </button>
              )}
              <small className="muted-copy">{t.trackerFarms.imageHelp}</small>
            </div>
          </div>
          <div className="tracker-farm-signup-cluster">
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
            <label className="checkbox field">
              <input
                checked={form.is_visible}
                disabled={saving || uploading}
                onChange={(event) => update("is_visible", event.target.checked)}
                type="checkbox"
              />
              <span>{t.trackerFarms.visibleToggle}</span>
            </label>
          </div>
        </div>
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
          onClick={(event) => {
            if (saving || uploading) event.preventDefault();
          }}
        >
          {t.trackerFarms.cancel}
        </Link>
        <button
          className="button"
          disabled={saving || uploading || conflict || reloadingLatest}
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
