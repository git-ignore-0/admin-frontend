"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminImagePicker } from "@/components/admin-image-picker";
import {
  BilingualContentFields,
  emptyBilingualContent,
} from "@/components/bilingual-content-fields";
import { useToast } from "@/components/toast-provider";
import {
  deleteStoreProductImage,
  getStoreProduct,
  listStoreCategories,
  saveStoreProduct,
  uploadStoreProductImage,
} from "@/lib/commerce-api";
import { requestErrorMessage } from "@/lib/client-error";
import { isSupportedImageFile } from "@/lib/image-validation";
import { listActiveQuotaGroups } from "@/lib/membership-catalog-adapter";
import { mediaUrlForWidth } from "@/lib/media";
import { localizedCatalogTranslation } from "@/lib/membership-translations";
import {
  formatDecimalInput,
  parsePositiveBigInteger,
  parsePositiveDecimal,
  parsePositiveInteger,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";
import { categoryPath } from "@/lib/store-categories";
import type { MediaAsset, MembershipProduct, StoreCategory, StoreProduct } from "@/lib/types";

export function StoreProductEditor({ productId }: { productId?: string }) {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const router = useRouter();
  const toast = useToast();
  const savingRef = useRef(false);
  const mountedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const pendingImageIdRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const translationRef = useRef(t);
  translationRef.current = t;
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [groups, setGroups] = useState<
    Array<Pick<MembershipProduct, "id" | "name" | "translations">>
  >([]);
  const [groupPage, setGroupPage] = useState(1);
  const [moreGroups, setMoreGroups] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadRetry, setLoadRetry] = useState(0);
  const [groupRetry, setGroupRetry] = useState(0);
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [originalCategoryId, setOriginalCategoryId] = useState("");
  const [unitSize, setUnitSize] = useState("");
  const [unitVi, setUnitVi] = useState("");
  const [unitEn, setUnitEn] = useState("");
  const [price, setPrice] = useState("");
  const [csa, setCsa] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [quotaCost, setQuotaCost] = useState("");
  const [image, setImage] = useState<MediaAsset | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [pendingImageId, setPendingImageId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [published, setPublished] = useState(false);
  const [content, setContent] = useState(emptyBilingualContent());
  const [longDescriptions, setLongDescriptions] = useState({ vi: "", en: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setPendingImage(next: string | null) {
    pendingImageIdRef.current = next;
    setPendingImageId(next);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveInFlightRef.current) return;
      const imageId = pendingImageIdRef.current;
      if (imageId) {
        void deleteStoreProductImage(imageId, { keepalive: true }).catch(() => undefined);
        pendingImageIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedImage || typeof URL.createObjectURL !== "function") {
      setPreviewUrl("");
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(selectedImage);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedImage]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError("");
    Promise.all([
      listStoreCategories(),
      productId ? getStoreProduct(productId) : Promise.resolve(null),
    ])
      .then(([categoryRows, item]) => {
        if (cancelled) return;
        setCategories(categoryRows);
        if (item) hydrate(item);
        setLoadError("");
        setLoaded(true);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(requestErrorMessage(caught, translationRef.current));
      });
    return () => {
      cancelled = true;
    };
  }, [productId, loadRetry]);

  useEffect(() => {
    let cancelled = false;
    setGroupLoading(true);
    listActiveQuotaGroups(groupPage)
      .then(({ data, meta }) => {
        if (cancelled) return;
        setGroups((current) => {
          const next = new Map(current.map((value) => [value.id, value]));
          data.forEach((value) => next.set(value.id, value));
          return [...next.values()];
        });
        setMoreGroups(Boolean(meta && meta.page * meta.page_size < meta.total));
        setGroupError("");
      })
      .catch((caught) => {
        if (!cancelled) setGroupError(requestErrorMessage(caught, translationRef.current));
      })
      .finally(() => {
        if (!cancelled) setGroupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupPage, groupRetry]);

  function hydrate(item: StoreProduct) {
    setSku(item.sku);
    setCategoryId(item.category_id);
    setOriginalCategoryId(item.category_id);
    setUnitSize(formatDecimalInput(item.unit_size));
    setUnitVi(item.unit_label_vi);
    setUnitEn(item.unit_label_en);
    setPrice(String(item.retail_price_vnd));
    setCsa(Boolean(item.csa_quota_group_id));
    setGroupId(item.csa_quota_group_id ?? "");
    setQuotaCost(String(item.csa_quota_cost || ""));
    setImage(item.primary_image);
    setActive(item.is_active);
    setPublished(item.is_published);
    if (item.csa_quota_group)
      setGroups((current) =>
        current.some((value) => value.id === item.csa_quota_group!.id)
          ? current
          : [...current, item.csa_quota_group!],
      );
    const next = emptyBilingualContent();
    const full = { vi: "", en: "" };
    for (const translation of item.translations) {
      next[translation.locale] = {
        name: translation.name,
        description: translation.short_description,
      };
      full[translation.locale] = translation.description;
    }
    setContent(next);
    setLongDescriptions(full);
  }

  function fail(message: string, field?: string) {
    setError(message);
    requestAnimationFrame(() => {
      const input = field ? formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`) : null;
      (input ?? errorRef.current)?.focus();
    });
  }

  async function removeImage() {
    setSelectedImage(null);
    if (pendingImageId) {
      try {
        await deleteStoreProductImage(pendingImageId);
        setPendingImage(null);
        setImage(null);
      } catch (caught) {
        fail(requestErrorMessage(caught, t));
      }
    } else setImage(null);
  }

  async function cancel() {
    if (pendingImageId) {
      try {
        await deleteStoreProductImage(pendingImageId);
        setPendingImage(null);
      } catch (caught) {
        fail(requestErrorMessage(caught, t));
        return;
      }
    }
    router.back();
  }

  function isSelectableCategory(item: StoreCategory) {
    return (
      !item.has_children &&
      (item.is_active || (Boolean(productId) && !published && item.id === originalCategoryId))
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const leaf = categories.find((item) => item.id === categoryId && isSelectableCategory(item));
    const parsedSize = parsePositiveDecimal(unitSize);
    const parsedPrice = parsePositiveBigInteger(price);
    const parsedQuota = csa ? parsePositiveInteger(quotaCost) : { value: 0 };
    const translations = (["vi", "en"] as const).flatMap((language) => {
      const value = content[language];
      return value.name.trim()
        ? [
            {
              locale: language,
              name: value.name.trim(),
              short_description: value.description.trim(),
              description: longDescriptions[language].trim(),
            },
          ]
        : [];
    });
    const firstInvalid = !sku.trim()
      ? "sku"
      : !leaf
        ? "category_id"
        : parsedSize.error
          ? "unit_size"
          : !unitVi.trim()
            ? "unit_label_vi"
            : !unitEn.trim()
              ? "unit_label_en"
              : parsedPrice.error
                ? "retail_price_vnd"
                : null;
    if (firstInvalid) return fail(copy.invalidForm, firstInvalid);
    if (
      (["vi", "en"] as const).some(
        (language) =>
          (content[language].description.trim() || longDescriptions[language].trim()) &&
          !content[language].name.trim(),
      )
    )
      return fail(copy.invalidForm);
    if (published && (!active || translations.length !== 2)) return fail(copy.translationsRequired);
    if (published && !image && !selectedImage) return fail(copy.imageRequired);
    if (csa && (!groupId || parsedQuota.error))
      return fail(copy.quotaRequired, !groupId ? "csa_quota_group_id" : "csa_quota_cost");
    savingRef.current = true;
    setBusy(true);
    setError("");
    try {
      let savedImage = image;
      if (selectedImage) {
        if (pendingImageId) {
          await deleteStoreProductImage(pendingImageId);
          setPendingImage(null);
        }
        if (!mountedRef.current) return;
        savedImage = await uploadStoreProductImage(selectedImage);
        if (!mountedRef.current) {
          void deleteStoreProductImage(savedImage.id, { keepalive: true }).catch(() => undefined);
          return;
        }
        setImage(savedImage);
        setSelectedImage(null);
        setPendingImage(savedImage.id);
      }
      saveInFlightRef.current = true;
      const item = await saveStoreProduct(
        {
          sku: sku.trim().toUpperCase(),
          category_id: categoryId,
          unit_size: String(parsedSize.value),
          unit_label_vi: unitVi.trim(),
          unit_label_en: unitEn.trim(),
          retail_price_vnd: parsedPrice.value!.toString(),
          csa_quota_group_id: csa ? groupId : null,
          csa_quota_cost: parsedQuota.value!,
          primary_image_id: savedImage?.id ?? null,
          is_active: active,
          is_published: published,
          translations,
        },
        productId,
      );
      saveInFlightRef.current = false;
      pendingImageIdRef.current = null;
      if (!mountedRef.current) return;
      setPendingImage(null);
      toast(copy.success);
      router.replace(`/store-catalog/products/${item.id}`);
    } catch (caught) {
      saveInFlightRef.current = false;
      if (!mountedRef.current) {
        const imageId = pendingImageIdRef.current;
        if (imageId) {
          pendingImageIdRef.current = null;
          void deleteStoreProductImage(imageId, { keepalive: true }).catch(() => undefined);
        }
        return;
      }
      const field = (caught as { field?: string }).field;
      if (caught instanceof Error && caught.message === "product_unit_in_use") {
        fail(copy.productUnitInUse, "unit_size");
        savingRef.current = false;
        setBusy(false);
        return;
      }
      fail(
        requestErrorMessage(caught, t, {
          sku: copy.sku,
          category_id: copy.category,
          unit_size: copy.unitSize,
          unit_label_vi: copy.unitVi,
          unit_label_en: copy.unitEn,
          retail_price_vnd: copy.price,
          csa_quota_group_id: copy.quotaGroup,
          csa_quota_cost: copy.quotaCost,
          primary_image_id: copy.image,
          translations: copy.translationSection,
        }),
        field,
      );
      savingRef.current = false;
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <div className="panel">
        <p className="error-box" role="alert">
          {loadError}
        </p>
        <button className="button secondary" onClick={() => setLoadRetry((value) => value + 1)}>
          {t.common.retry}
        </button>
      </div>
    );
  if (!loaded) return <p role="status">{copy.loading}</p>;
  const leafCategories = categories.filter(isSelectableCategory);
  return (
    <form className="catalog-editor" noValidate onSubmit={submit} ref={formRef}>
      {error && (
        <p className="error-box" ref={errorRef} role="alert" tabIndex={-1}>
          {error}
        </p>
      )}
      <section className="catalog-editor-section">
        <h2>{copy.products}</h2>
        <div className="form-grid">
          <label className="field">
            <span>{copy.sku} *</span>
            <input
              aria-describedby="store-product-sku-help"
              className="input"
              disabled={busy}
              maxLength={80}
              name="sku"
              placeholder={copy.skuPlaceholder}
              value={sku}
              onChange={(event) => setSku(event.target.value)}
            />
            <small className="field-help" id="store-product-sku-help">
              {copy.skuHelp}
            </small>
          </label>
          <label className="field">
            <span>{copy.productCategory} *</span>
            <select
              aria-describedby="store-product-category-help"
              className="input"
              disabled={busy}
              name="category_id"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">{copy.selectLeaf}</option>
              {leafCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryPath(category, categories, locale)}
                </option>
              ))}
            </select>
            <small className="field-help" id="store-product-category-help">
              {copy.categoryHelp}
            </small>
          </label>
          <label className="field">
            <span>{copy.unitVi} *</span>
            <input
              className="input"
              disabled={busy}
              maxLength={40}
              name="unit_label_vi"
              placeholder={copy.unitViPlaceholder}
              value={unitVi}
              onChange={(event) => setUnitVi(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{copy.unitEn} *</span>
            <input
              className="input"
              disabled={busy}
              maxLength={40}
              name="unit_label_en"
              placeholder={copy.unitEnPlaceholder}
              value={unitEn}
              onChange={(event) => setUnitEn(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{copy.unitSize} *</span>
            <input
              aria-describedby="store-product-unit-size-help"
              className="input"
              disabled={busy}
              inputMode="decimal"
              name="unit_size"
              placeholder={copy.unitSizePlaceholder}
              value={unitSize}
              onChange={(event) => setUnitSize(sanitizeDecimalInput(event.target.value))}
            />
            <small className="field-help" id="store-product-unit-size-help">
              {copy.unitSizeHelp}
            </small>
          </label>
          <label className="field">
            <span>{copy.price} *</span>
            <input
              className="input"
              disabled={busy}
              inputMode="numeric"
              name="retail_price_vnd"
              value={price}
              onChange={(event) => setPrice(sanitizeIntegerInput(event.target.value))}
            />
          </label>
        </div>
      </section>
      <BilingualContentFields
        busy={busy}
        completionLabels={{ complete: copy.complete, incomplete: copy.incomplete }}
        defaultLocale={locale}
        descriptionLabel={copy.shortDescription}
        languageLabels={{ vi: t.common.vietnamese, en: t.common.english }}
        longDescription={{
          label: copy.descriptionLabel,
          maxLength: 10_000,
          onChange: setLongDescriptions,
          value: longDescriptions,
        }}
        nameLabel={copy.productName}
        onChange={setContent}
        requireNames={published}
        title={copy.translationSection}
        value={content}
      />
      <section className="catalog-editor-section">
        <h2>{copy.saleType}</h2>
        <label className="field">
          <span>{copy.saleType}</span>
          <select
            className="input"
            disabled={busy}
            value={csa ? "yes" : "no"}
            onChange={(event) => {
              const enabled = event.target.value === "yes";
              setCsa(enabled);
              if (!enabled) {
                setGroupId("");
                setQuotaCost("");
              }
            }}
          >
            <option value="no">{copy.retailOnly}</option>
            <option value="yes">{copy.csaSaleOption}</option>
          </select>
        </label>
        {csa && (
          <div className="form-grid">
            <label className="field">
              <span>{copy.quotaGroup} *</span>
              <select
                className="input"
                disabled={busy || groupLoading}
                name="csa_quota_group_id"
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
              >
                <option value="">{copy.quotaGroup}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {localizedCatalogTranslation(group.translations, locale)?.name || group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{copy.quotaCost} *</span>
              <input
                className="input"
                disabled={busy}
                inputMode="numeric"
                name="csa_quota_cost"
                value={quotaCost}
                onChange={(event) => setQuotaCost(sanitizeIntegerInput(event.target.value))}
              />
            </label>
            {groupError && (
              <p className="error-box" role="alert">
                {groupError}
                <button
                  className="button secondary"
                  onClick={() => setGroupRetry((value) => value + 1)}
                  type="button"
                >
                  {t.common.retry}
                </button>
              </p>
            )}
            {moreGroups && (
              <button
                className="button secondary"
                disabled={groupLoading}
                onClick={() => setGroupPage((value) => value + 1)}
                type="button"
              >
                {t.common.next}
              </button>
            )}
          </div>
        )}
      </section>
      <section className="catalog-editor-section admin-image-picker-section">
        <h2>{copy.image}</h2>
        <AdminImagePicker
          items={
            selectedImage && previewUrl
              ? [{ id: "selected-image", src: previewUrl, alt: copy.imagePreviewAlt }]
              : image
                ? [{ id: image.id, src: mediaUrlForWidth(image, 160), alt: copy.imagePreviewAlt }]
                : []
          }
          maxItems={1}
          busy={busy}
          fileName={selectedImage?.name}
          help={copy.imageHelp}
          labels={{
            choose: copy.chooseImage,
            replace: locale === "vi" ? "Thay ảnh" : "Replace image",
            empty: copy.noImage,
            remove: copy.removeImage,
          }}
          onChooseFiles={(files) => {
            const file = files[0];
            if (!isSupportedImageFile(file)) return fail(copy.imageTypeError);
            setSelectedImage(file);
          }}
          onRemove={removeImage}
        />
      </section>
      <section className="catalog-editor-section">
        <h2>{copy.status}</h2>
        <div className="form-grid">
          <label className="field">
            <span>{copy.activeLabel}</span>
            <select
              className="input"
              disabled={busy}
              value={active ? "true" : "false"}
              onChange={(event) => {
                const value = event.target.value === "true";
                setActive(value);
                if (!value) setPublished(false);
              }}
            >
              <option value="true">{copy.active}</option>
              <option value="false">{copy.inactive}</option>
            </select>
          </label>
          <label className="field">
            <span>{copy.publish}</span>
            <select
              className="input"
              disabled={busy}
              value={published ? "true" : "false"}
              onChange={(event) => setPublished(event.target.value === "true")}
            >
              <option value="false">{copy.draft}</option>
              <option value="true">{copy.published}</option>
            </select>
          </label>
        </div>
      </section>
      <div className="catalog-editor-actions">
        <button className="button secondary" disabled={busy} onClick={cancel} type="button">
          {copy.cancel}
        </button>
        <button className="button" disabled={busy} type="submit">
          {busy ? copy.saving : copy.save}
        </button>
      </div>
    </form>
  );
}
