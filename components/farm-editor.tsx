"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminImagePicker } from "@/components/admin-image-picker";
import {
  BilingualContentFields,
  emptyBilingualContent,
} from "@/components/bilingual-content-fields";
import { PageHeading } from "@/components/page-heading";
import { useToast } from "@/components/toast-provider";
import type { AdminLocale } from "@/lib/admin-i18n";
import { requestErrorMessage } from "@/lib/client-error";
import { deleteFarmImage, getFarm, saveFarm, uploadFarmImage } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { isSupportedImageFile } from "@/lib/image-validation";
import { mediaUrlForWidth } from "@/lib/media";
import type { Farm, MediaAsset } from "@/lib/types";

type Form = {
  name_en: string;
  name_vi: string;
  location_en: string;
  location_vi: string;
  description_en: string;
  description_vi: string;
  photos: MediaAsset[];
  is_active: boolean;
  version?: number;
};
const emptyForm: Form = {
  name_en: "",
  name_vi: "",
  location_en: "",
  location_vi: "",
  description_en: "",
  description_vi: "",
  photos: [],
  is_active: true,
};
function fromFarm(farm: Farm): Form {
  return {
    name_en: farm.name_en,
    name_vi: farm.name_vi,
    location_en: farm.location_en,
    location_vi: farm.location_vi,
    description_en: farm.description_en,
    description_vi: farm.description_vi,
    photos: farm.photos.length ? farm.photos : farm.image ? [farm.image] : [],
    is_active: farm.is_active,
    version: farm.version,
  };
}

export function FarmEditor({ farmId }: { farmId?: string }) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<Form>(emptyForm);
  const [loading, setLoading] = useState(Boolean(farmId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [activeLocale, setActiveLocale] = useState<AdminLocale>(locale);
  const [retry, setRetry] = useState(0);
  const translationRef = useRef(t);
  translationRef.current = t;
  const formRef = useRef<HTMLFormElement>(null);
  const pendingFocus = useRef<"name" | "location" | null>(null);
  const temporaryIds = useRef(new Set<string>());
  const mounted = useRef(false);
  const saveLock = useRef(false);
  const initialContent = emptyBilingualContent();

  useEffect(() => {
    const temp = temporaryIds.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const id of temp) void deleteFarmImage(id, { keepalive: true }).catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    if (!farmId) return;
    let live = true;
    setLoading(true);
    setError("");
    getFarm(farmId)
      .then((farm) => {
        if (live) {
          const retained = new Set([
            ...farm.photos.map((photo) => photo.id),
            ...(farm.image ? [farm.image.id] : []),
          ]);
          for (const id of temporaryIds.current) {
            if (retained.has(id)) {
              temporaryIds.current.delete(id);
            } else {
              void deleteFarmImage(id)
                .then(() => temporaryIds.current.delete(id))
                .catch(() => undefined);
            }
          }
          setForm(fromFarm(farm));
          setConflict(false);
        }
      })
      .catch((caught) => live && setError(requestErrorMessage(caught, translationRef.current)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [farmId, retry]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const selector =
      pendingFocus.current === "name"
        ? ".bilingual-content-editor .catalog-language-panel input"
        : "[data-farm-location]";
    formRef.current?.querySelector<HTMLInputElement>(selector)?.focus();
    pendingFocus.current = null;
  }, [activeLocale, error]);

  async function upload(files: File[]) {
    if (!files.length) return;
    if (files.some((file) => !isSupportedImageFile(file))) {
      setPhotoError(c.photoInvalid);
      return;
    }
    if (form.photos.length + files.length > 12) {
      setPhotoError(c.photoLimit);
      return;
    }
    setPhotoError("");
    setUploading(true);
    try {
      for (const file of files) {
        const asset = await uploadFarmImage(file);
        if (!mounted.current) {
          void deleteFarmImage(asset.id, { keepalive: true }).catch(() => undefined);
          break;
        }
        temporaryIds.current.add(asset.id);
        setForm((current) => ({ ...current, photos: [...current.photos, asset] }));
      }
    } catch (caught) {
      setPhotoError(requestErrorMessage(caught, t));
    } finally {
      setUploading(false);
    }
  }

  function movePhoto(index: number, direction: -1 | 1) {
    setForm((current) => {
      const next = [...current.photos];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, photos: next };
    });
  }
  function setCover(index: number) {
    setForm((current) => {
      const next = [...current.photos];
      const [cover] = next.splice(index, 1);
      next.unshift(cover);
      return { ...current, photos: next };
    });
  }
  function removePhoto(id: string) {
    setForm((current) => ({
      ...current,
      photos: current.photos.filter((photo) => photo.id !== id),
    }));
    if (temporaryIds.current.has(id)) {
      void deleteFarmImage(id)
        .then(() => temporaryIds.current.delete(id))
        .catch((caught) => {
          if (mounted.current) setPhotoError(requestErrorMessage(caught, t));
        });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current || uploading || conflict) return;
    for (const language of ["vi", "en"] as const) {
      const missing = !form[`name_${language}`].trim()
        ? "name"
        : !form[`location_${language}`].trim()
          ? "location"
          : null;
      if (missing) {
        const selector =
          missing === "name"
            ? ".bilingual-content-editor .catalog-language-panel input"
            : "[data-farm-location]";
        if (activeLocale === language) {
          formRef.current?.querySelector<HTMLInputElement>(selector)?.focus();
        } else {
          pendingFocus.current = missing;
          setActiveLocale(language);
        }
        setError(c.requiredBilingual);
        return;
      }
    }
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await saveFarm(farmId, {
        name_vi: form.name_vi.trim(),
        name_en: form.name_en.trim(),
        location_vi: form.location_vi.trim(),
        location_en: form.location_en.trim(),
        description_vi: form.description_vi,
        description_en: form.description_en,
        is_active: form.is_active,
        photo_ids: form.photos.map((photo) => photo.id),
        ...(farmId ? { version: form.version } : {}),
      });
      for (const photo of form.photos) temporaryIds.current.delete(photo.id);
      toast(locale === "vi" ? "Đã lưu trang trại." : "Farm saved.");
      router.replace(`/farms/${result.id}`);
      router.refresh();
    } catch (caught) {
      if ((caught as { status?: number }).status === 409) {
        setConflict(true);
        setError(c.conflict);
      } else setError(requestErrorMessage(caught, t));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  if (loading) return <p role="status">{c.loading}</p>;
  if (error && farmId && !form.version)
    return (
      <div className="error-box" role="alert">
        {error}
        <button className="button secondary" onClick={() => setRetry((n) => n + 1)}>
          {t.common.retry}
        </button>
      </div>
    );
  const content = {
    vi: { ...initialContent.vi, name: form.name_vi, description: form.description_vi },
    en: { ...initialContent.en, name: form.name_en, description: form.description_en },
  };
  return (
    <div className="farm-editor-page">
      <PageHeading
        title={farmId ? c.editFarm : c.create}
        description={c.editorDescription}
        backHref={farmId ? `/farms/${farmId}` : "/farms"}
        backLabel={farmId ? form[`name_${locale}`] || c.list : c.list}
      />
      <form className="catalog-editor farm-editor-form" noValidate onSubmit={submit} ref={formRef}>
        <BilingualContentFields
          activeLocale={activeLocale}
          busy={saving}
          completionLabels={{
            complete: locale === "vi" ? "Đã nhập" : "Complete",
            incomplete: locale === "vi" ? "Chưa nhập" : "Incomplete",
          }}
          defaultLocale={locale}
          descriptionLabel={c.descriptionField}
          isLocaleComplete={(language) =>
            Boolean(form[`name_${language}`].trim() && form[`location_${language}`].trim())
          }
          languageLabels={{ vi: "Tiếng Việt", en: "English" }}
          nameLabel={c.nameField}
          onLocaleChange={setActiveLocale}
          renderAfterName={(language) => (
            <label className="field full">
              <span>{c.location} *</span>
              <input
                className="input"
                data-farm-location
                disabled={saving}
                maxLength={240}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [`location_${language}`]: event.target.value,
                  }))
                }
                required
                value={form[`location_${language}`]}
              />
            </label>
          )}
          title={c.shared}
          value={content}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              name_vi: value.vi.name,
              name_en: value.en.name,
              description_vi: value.vi.description,
              description_en: value.en.description,
            }))
          }
        />
        <section className="catalog-editor-section admin-image-picker-section">
          <h2>
            {c.photos} <small className="admin-image-picker-count">{form.photos.length}/12</small>
          </h2>
          <AdminImagePicker
            items={form.photos.map((photo, index) => ({
              id: photo.id,
              src: mediaUrlForWidth(photo, 160),
              alt: `${c.photos} ${index + 1}`,
            }))}
            maxItems={12}
            busy={uploading || saving}
            error={photoError}
            help={c.photoHint}
            labels={{
              choose: c.upload,
              replace: c.upload,
              empty: locale === "vi" ? "Chưa có ảnh" : "No images yet",
              cover: locale === "vi" ? "Ảnh đại diện" : "Cover image",
              setCover: locale === "vi" ? "Đặt làm đại diện" : "Set as cover",
              moveEarlier: c.moveEarlier,
              moveLater: c.moveLater,
              remove: c.removePhoto,
              uploading: locale === "vi" ? "Đang tải ảnh…" : "Uploading images…",
              select: locale === "vi" ? "Chọn ảnh số" : "Select image",
            }}
            onChooseFiles={upload}
            onMove={movePhoto}
            onSetCover={setCover}
            onRemove={removePhoto}
          />
        </section>
        <label className="farm-editor-status">
          <span>{c.status}</span>
          <select
            className="input"
            value={String(form.is_active)}
            onChange={(event) =>
              setForm((current) => ({ ...current, is_active: event.target.value === "true" }))
            }
          >
            <option value="true">{c.active}</option>
            <option value="false">{c.inactive}</option>
          </select>
        </label>
        {error && (
          <div className="error-box" role="alert">
            {error}
            {conflict && (
              <button
                className="button secondary"
                type="button"
                onClick={() => setRetry((n) => n + 1)}
              >
                {c.reload}
              </button>
            )}
          </div>
        )}
        <div className="farm-editor-actions">
          <Link className="button secondary" href={farmId ? `/farms/${farmId}` : "/farms"}>
            {c.cancel}
          </Link>
          <button className="button" type="submit" disabled={saving || uploading || conflict}>
            {saving ? c.saving : farmId ? c.save : c.create}
          </button>
        </div>
      </form>
    </div>
  );
}
