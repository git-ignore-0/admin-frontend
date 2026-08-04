"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import {
  numericInputErrorMessage,
  parsePositiveInteger,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";
import type { Locale, MediaAsset, Reward } from "@/lib/types";

type TranslationForm = { name: string; shortDescription: string };
type TranslationState = Record<Locale, TranslationForm>;

const emptyTranslations: TranslationState = {
  vi: { name: "", shortDescription: "" },
  en: { name: "", shortDescription: "" },
};

function translationsFromReward(reward: Reward): TranslationState {
  const byLocale = new Map(
    reward.translations.map((translation) => [translation.locale, translation]),
  );
  return {
    vi: {
      name: byLocale.get("vi")?.name ?? "",
      shortDescription: byLocale.get("vi")?.short_description ?? "",
    },
    en: {
      name: byLocale.get("en")?.name ?? "",
      shortDescription: byLocale.get("en")?.short_description ?? "",
    },
  };
}

export function RewardEditor({ rewardId }: { rewardId?: string }) {
  const { t } = useAdminI18n();
  const toast = useToast();
  const router = useRouter();
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(Boolean(rewardId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pointCost, setPointCost] = useState("100");
  const [pointCostError, setPointCostError] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [image, setImage] = useState<MediaAsset | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [translations, setTranslations] = useState<TranslationState>(emptyTranslations);

  useEffect(() => {
    if (!rewardId) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    api<Reward>(`admin/rewards/${rewardId}`, { signal: controller.signal })
      .then((reward) => {
        if (controller.signal.aborted) return;
        setPointCost(String(reward.point_cost));
        setIsActive(reward.is_active);
        setImage(reward.image);
        setSelectedImage(null);
        setTranslations(translationsFromReward(reward));
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setLoadError(() => caught);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadAttempt, rewardId]);

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
      setError(t.rewards.imageTypeError);
      return;
    }
    setError("");
    setSelectedImage(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || uploading) return;
    setError("");
    const parsedPointCost = parsePositiveInteger(pointCost);
    if (parsedPointCost.error) {
      setPointCostError(numericInputErrorMessage(parsedPointCost.error, t.common.numericInput));
      return;
    }
    setPointCostError("");
    if (!translations.vi.name.trim() || !translations.en.name.trim()) {
      setError(t.rewards.namesRequired);
      return;
    }
    if (!image && !selectedImage) {
      setError(t.rewards.imageRequired);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    let keepLockedForNavigation = false;
    try {
      let savedImage = image;
      if (selectedImage) {
        setUploading(true);
        const body = new FormData();
        body.append("image", selectedImage);
        savedImage = await api<MediaAsset>("admin/rewards/media", { method: "POST", body });
        setImage(savedImage);
        setSelectedImage(null);
        setUploading(false);
      }
      if (!savedImage) throw new Error("reward_image_missing");
      const payload = {
        point_cost: parsedPointCost.value,
        image_id: savedImage.id,
        is_active: isActive,
        translations: (["vi", "en"] as const).map((locale) => ({
          locale,
          name: translations[locale].name.trim(),
          short_description: translations[locale].shortDescription.trim(),
        })),
      };
      const reward = await api<Reward>(rewardId ? `admin/rewards/${rewardId}` : "admin/rewards", {
        method: rewardId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      toast(rewardId ? t.rewards.updated : t.rewards.created);
      if (!rewardId) {
        router.replace(`/rewards/${reward.id}`);
        keepLockedForNavigation = true;
      } else {
        setPointCost(String(reward.point_cost));
        setIsActive(reward.is_active);
        setImage(reward.image);
        setTranslations(translationsFromReward(reward));
      }
    } catch (caught) {
      setError(requestErrorMessage(caught, t));
    } finally {
      setUploading(false);
      if (!keepLockedForNavigation) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  if (loading) return <div className="panel">{t.rewards.loadingDetail}</div>;
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
    <form className="reward-editor" noValidate onSubmit={submit}>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <section className="panel reward-basics" aria-labelledby="reward-basics-title">
        <div className="panel-head">
          <div>
            <h2 id="reward-basics-title">{t.rewards.basics}</h2>
            <p className="muted-copy">{t.rewards.basicsHelp}</p>
          </div>
        </div>
        <div className="reward-image-field">
          <div className="reward-image-preview">
            {previewUrl || image ? (
              <Image
                alt={translations.vi.name || t.rewards.imageAlt}
                height={180}
                src={previewUrl || mediaUrlForWidth(image!, 480)}
                unoptimized
                width={240}
              />
            ) : (
              <span>{t.rewards.noImage}</span>
            )}
          </div>
          <div>
            <label className="button secondary reward-upload-button">
              <span>
                {uploading ? t.rewards.uploading : selectedImage?.name || t.rewards.chooseImage}
              </span>
              <input
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading || saving}
                onChange={selectImage}
                type="file"
              />
            </label>
            <small className="muted-copy">{t.rewards.imageHelp}</small>
          </div>
        </div>
        <div className="form-grid reward-number-fields">
          <label className="field">
            <span>{t.rewards.pointCost} *</span>
            <input
              aria-invalid={Boolean(pointCostError)}
              className="input"
              disabled={saving}
              inputMode="numeric"
              onChange={(event) => {
                setPointCost(sanitizeIntegerInput(event.target.value));
                setPointCostError("");
              }}
              required
              type="text"
              value={pointCost}
            />
            {pointCostError ? (
              <small className="field-error" role="alert">
                {pointCostError}
              </small>
            ) : null}
          </label>
          <label className="checkbox field full">
            <input
              checked={isActive}
              disabled={saving}
              onChange={(event) => setIsActive(event.target.checked)}
              type="checkbox"
            />
            <span>{t.rewards.activeHelp}</span>
          </label>
        </div>
      </section>

      <section className="reward-translation-grid" aria-label={t.rewards.translations}>
        {(["vi", "en"] as const).map((locale) => (
          <div className="panel" key={locale}>
            <div className="panel-head">
              <h2>{locale === "vi" ? t.common.vietnamese : t.common.english}</h2>
              <span className="locale-code">{locale.toUpperCase()}</span>
            </div>
            <div className="form-grid one">
              <label className="field">
                <span>{t.rewards.name} *</span>
                <input
                  className="input"
                  disabled={saving}
                  maxLength={240}
                  onChange={(event) => updateTranslation(locale, "name", event.target.value)}
                  required
                  value={translations[locale].name}
                />
              </label>
              <label className="field">
                <span>{t.rewards.shortDescription}</span>
                <textarea
                  className="textarea"
                  disabled={saving}
                  maxLength={800}
                  onChange={(event) =>
                    updateTranslation(locale, "shortDescription", event.target.value)
                  }
                  value={translations[locale].shortDescription}
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
          href="/rewards"
          onClick={(event) => {
            if (saving || uploading) event.preventDefault();
          }}
        >
          {t.rewards.cancel}
        </Link>
        <button className="button" disabled={saving || uploading} type="submit">
          {saving ? t.rewards.saving : t.rewards.save}
        </button>
      </div>
    </form>
  );
}
