"use client";

import { FormInput, FormTextarea } from "@/components/nfv-controls";

import { Button, Checkbox, Alert } from "@mantine/core";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useAdminRecordScope } from "@/components/admin-query-provider";
import { useToast } from "@/components/toast-provider";
import { requireResponseEntity } from "@/lib/api-response";
import { api } from "@/lib/client-api";
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import { isSupportedImageFile } from "@/lib/image-validation";
import {
  numericInputErrorMessage,
  parsePositiveInteger,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";
import type { Locale, MediaAsset, Reward } from "@/lib/types";
import { requireReward } from "@/lib/rewards";

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
  return <RewardRecord key={rewardId ?? "new"} rewardId={rewardId} />;
}

function RewardRecord({ rewardId }: { rewardId?: string }) {
  const { t } = useAdminI18n();
  const toast = useToast();
  const router = useRouter();
  const savingRef = useRef(false);
  const scope = useAdminRecordScope(rewardId ?? "new-reward");
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
    const { signal, current } = scope.beginRead();
    setLoading(true);
    setLoadError(null);
    api<Reward>(`admin/rewards/${rewardId}`, { signal })
      .then((row) => {
        if (!current()) return;
        const reward = requireReward(row, rewardId);
        setPointCost(String(reward.point_cost));
        setIsActive(reward.is_active);
        setImage(reward.image);
        setSelectedImage(null);
        setTranslations(translationsFromReward(reward));
      })
      .catch((caught) => {
        if (!current()) return;
        if (isProtectedDataError(caught) || (caught as ClientApiError | null)?.status === 404) {
          scope.retire();
          setPointCost("");
          setImage(null);
          setSelectedImage(null);
          setTranslations(emptyTranslations);
          setLoading(false);
        }
        setLoadError(() => caught);
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
  }, [loadAttempt, rewardId, scope]);

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
    if (!isSupportedImageFile(file)) {
      setError(t.rewards.imageTypeError);
      return;
    }
    setError("");
    setSelectedImage(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const current = scope.capture();
    if (!current() || loadError || loading || savingRef.current || uploading) return;
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
        if (!current()) return;
        requireResponseEntity(savedImage);
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
      if (!current()) return;
      requireReward(reward, rewardId);
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
      if (!current()) return;
      if (isProtectedDataError(caught) || (caught as ClientApiError | null)?.status === 404) {
        scope.retire();
        setLoading(false);
        setUploading(false);
        savingRef.current = false;
        setSaving(false);
        setPointCost("");
        setImage(null);
        setSelectedImage(null);
        setTranslations(emptyTranslations);
        setLoadError(() => caught);
        return;
      }
      setError(requestErrorMessage(caught, t));
    } finally {
      if (current()) setUploading(false);
      if (current() && !keepLockedForNavigation) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  if (loading) return <div className="panel">{t.rewards.loadingDetail}</div>;
  if (loadError)
    return (
      <div className="panel load-error-state">
        <Alert color="red" role="alert">
          {requestErrorMessage(loadError, t)}
        </Alert>
        <Button variant="default" onClick={() => setLoadAttempt((value) => value + 1)}>
          {t.common.retry}
        </Button>
      </div>
    );

  return (
    <form className="reward-editor" noValidate onSubmit={submit}>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
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
            <Button component="label" className="reward-upload-button" variant="default">
              <span>
                {uploading ? t.rewards.uploading : selectedImage?.name || t.rewards.chooseImage}
              </span>
              <input
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading || saving}
                onChange={selectImage}
                type="file"
              />
            </Button>
            <small className="muted-copy">{t.rewards.imageHelp}</small>
          </div>
        </div>
        <div className="form-grid reward-number-fields">
          <label className="field">
            <span>{t.rewards.pointCost} *</span>
            <FormInput
              aria-invalid={Boolean(pointCostError)}
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
          <Checkbox
            className="field full"
            checked={isActive}
            disabled={saving}
            onChange={(event) => setIsActive(event.target.checked)}
            label={t.rewards.activeHelp}
          />
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
                <FormInput
                  disabled={saving}
                  maxLength={240}
                  onChange={(event) => updateTranslation(locale, "name", event.target.value)}
                  required
                  value={translations[locale].name}
                />
              </label>
              <label className="field">
                <span>{t.rewards.shortDescription}</span>
                <FormTextarea
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
        <Button
          component={Link}
          aria-disabled={saving || uploading}
          variant="default"
          href="/rewards"
          onClick={(event) => {
            if (saving || uploading) event.preventDefault();
          }}
        >
          {t.rewards.cancel}
        </Button>
        <Button disabled={saving || uploading} type="submit">
          {saving ? t.rewards.saving : t.rewards.save}
        </Button>
      </div>
    </form>
  );
}
