"use client";
import { DataState, FormField, FormInput, FormSelect } from "@/components/nfv-controls";
import { Alert, Button, Stack } from "@mantine/core";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminImagePicker } from "@/components/admin-image-picker";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import {
  BilingualContentFields,
  emptyBilingualContent,
} from "@/components/bilingual-content-fields";
import { ProductLifecycleStatus, ProductLockReasons } from "@/components/product-lifecycle-status";
import { LazyRichTextEditor } from "@/components/lazy-rich-text-editor";
import { normalizeTiptapLinks } from "@/lib/rich-text-links";
import {
  descriptionChanged,
  descriptionDocument,
  descriptionPayload,
  descriptionText,
} from "@/lib/store-product-description";
import { useToast } from "@/components/toast-provider";
import {
  deleteStoreProductImage,
  getStoreProduct,
  listStoreCategories,
  saveStoreProduct,
  uploadStoreProductImage,
} from "@/lib/commerce-api";
import {
  invalidApiResponse,
  isProtectedDataError,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import { isSupportedImageFile } from "@/lib/image-validation";
import { listActiveQuotaGroups } from "@/lib/membership-catalog-adapter";
import { mediaUrlForWidth } from "@/lib/media";
import { localizedCatalogTranslation } from "@/lib/membership-translations";
import {
  formatDecimalInput,
  parsePositiveBigInteger,
  parsePositiveDecimal,
  parsePositiveQuotaUnits,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";
import { categoryPath } from "@/lib/store-categories";
import type {
  MediaAsset,
  MembershipProduct,
  ProductCapabilities,
  ProductStatus,
  StoreCategory,
  StoreProduct,
  StoreProductDetail,
  TiptapDocument,
} from "@/lib/types";

export function StoreProductEditor({ productId }: { productId?: string }) {
  return <ProductEditorForm key={productId ?? "new"} productId={productId} />;
}

function ProductEditorForm({ productId }: { productId?: string }) {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const router = useRouter();
  const toast = useToast();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const accessRevoked = useRef(false);
  const recoveryRequest = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const pendingImageIdRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
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
  const [status, setStatus] = useState<ProductStatus>("draft");
  const [capabilities, setCapabilities] = useState<ProductCapabilities>();
  const identityLocked = capabilities?.edit_identity.allowed === false;
  const csaLocked = capabilities?.edit_csa.allowed === false;
  const selling = status === "active";
  const [content, setContent] = useState(emptyBilingualContent());
  const [longDescriptions, setLongDescriptions] = useState<Record<"vi" | "en", TiptapDocument>>(
    () => ({ vi: descriptionDocument(""), en: descriptionDocument("") }),
  );
  const originalDescriptions = useRef<
    Record<"vi" | "en", { text: string; document?: TiptapDocument | null }>
  >({ vi: { text: "" }, en: { text: "" } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessError, setAccessError] = useState("");
  const [recovery, setRecovery] = useState<{
    problem: ClientApiError;
    error: unknown;
  } | null>(null);

  function canAct() {
    return mountedRef.current && !accessRevoked.current && isCurrent();
  }

  function setPendingImage(next: string | null) {
    pendingImageIdRef.current = next;
    setPendingImageId(next);
  }

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recoveryRequest.current?.abort();
      if (saveInFlightRef.current || !isCurrent() || accessRevoked.current) return;
      const imageId = pendingImageIdRef.current;
      if (imageId) {
        void deleteStoreProductImage(imageId, { keepalive: true }).catch(() => undefined);
        pendingImageIdRef.current = null;
      }
    };
  }, [isCurrent]);

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
    setGroupLoading(true);
    listActiveQuotaGroups(groupPage)
      .then(({ data, meta }) => {
        if (cancelled || !isCurrent()) return;
        setGroups((current) => {
          const next = new Map(current.map((value) => [value.id, value]));
          data.forEach((value) => next.set(value.id, value));
          return [...next.values()];
        });
        setMoreGroups(Boolean(meta && meta.page * meta.page_size < meta.total));
        setGroupError("");
      })
      .catch((caught) => {
        if (!cancelled && isCurrent()) {
          if (isProtectedDataError(caught)) setGroups([]);
          setGroupError(requestErrorMessage(caught, translationRef.current));
        }
      })
      .finally(() => {
        if (!cancelled && isCurrent()) setGroupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupPage, groupRetry, isCurrent]);

  const hydrateIdentity = useCallback((item: StoreProduct) => {
    setSku(item.sku);
    setUnitSize(formatDecimalInput(item.unit_size));
    setUnitVi(item.unit_label_vi);
    setUnitEn(item.unit_label_en);
  }, []);

  const hydrateCsa = useCallback((item: StoreProduct) => {
    setCsa(Boolean(item.csa_quota_group_id));
    setGroupId(item.csa_quota_group_id ?? "");
    setQuotaCost(String(item.csa_quota_cost || ""));
    const group = item.csa_quota_group;
    if (group) {
      setGroups((current) => {
        if (current.some((value) => value.id === group.id)) {
          return current.map((value) => (value.id === group.id ? group : value));
        }
        return [...current, group];
      });
    }
  }, []);

  const hydrate = useCallback(
    (item: StoreProductDetail) => {
      hydrateIdentity(item);
      hydrateCsa(item);
      setCategoryId(item.category_id);
      setOriginalCategoryId(item.category_id);
      setPrice(String(item.retail_price_vnd));
      setImage(item.primary_image);
      setStatus(item.status);
      setCapabilities(item.capabilities);
      const next = emptyBilingualContent();
      const full = { vi: descriptionDocument(""), en: descriptionDocument("") };
      originalDescriptions.current = { vi: { text: "" }, en: { text: "" } };
      for (const translation of item.translations) {
        next[translation.locale] = {
          name: translation.name,
          description: translation.short_description,
        };
        full[translation.locale] = descriptionDocument(
          translation.description,
          translation.description_document,
        );
        originalDescriptions.current[translation.locale] = {
          text: translation.description,
          document: translation.description_document,
        };
      }
      setContent(next);
      setLongDescriptions(full);
    },
    [hydrateIdentity, hydrateCsa],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setLoadError("");
    Promise.all([
      listStoreCategories(undefined, controller.signal),
      productId ? getStoreProduct(productId, controller.signal) : Promise.resolve(null),
    ])
      .then(([categoryRows, item]) => {
        if (controller.signal.aborted || !isCurrent()) return;
        if (
          productId &&
          (!item?.capabilities || item.id.toLowerCase() !== productId.toLowerCase())
        ) {
          throw invalidApiResponse();
        }
        setCategories(categoryRows);
        if (item) hydrate(item);
        setLoadError("");
        setLoaded(true);
      })
      .catch((caught) => {
        if (!controller.signal.aborted && isCurrent())
          setLoadError(requestErrorMessage(caught, translationRef.current));
      });
    return () => controller.abort();
  }, [productId, loadRetry, isCurrent, hydrate]);

  function fail(message: string, field?: string) {
    setError(message);
    requestAnimationFrame(() => {
      if (!canAct()) return;
      const input = field
        ? formRef.current?.querySelector<HTMLElement>(
            `[data-focus-field="${field}"], [name="${field}"]:not([type="hidden"])`,
          )
        : null;
      (input ?? errorRef.current)?.focus();
    });
  }

  function hideProtectedData(caught: unknown) {
    if (!isProtectedDataError(caught) && (caught as ClientApiError | null)?.status !== 404)
      return false;
    accessRevoked.current = true;
    setAccessError(
      caught instanceof Error && ["session_expired", "session_changed"].includes(caught.message)
        ? t.common.sessionChanged
        : requestErrorMessage(caught, t),
    );
    return true;
  }

  function showSaveError(caught: unknown) {
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
      (caught as ClientApiError | null)?.field,
    );
  }

  async function refreshCapabilities(problem: ClientApiError) {
    if (!productId || !canAct()) return;
    const controller = new AbortController();
    recoveryRequest.current = controller;
    try {
      const latest = await getStoreProduct(productId, controller.signal);
      if (!canAct() || controller.signal.aborted) return;
      if (!latest?.capabilities || latest.id.toLowerCase() !== productId.toLowerCase()) {
        throw invalidApiResponse();
      }
      setStatus(latest.status);
      setCapabilities(latest.capabilities);
      setOriginalCategoryId(latest.category_id);
      if (!latest.capabilities.edit_identity.allowed) hydrateIdentity(latest);
      if (!latest.capabilities.edit_csa.allowed) hydrateCsa(latest);
      setRecovery(null);
      if (problem.message === "validation_error") showSaveError(problem);
      else fail(copy.statusConflict);
    } catch (caught) {
      if (!canAct() || controller.signal.aborted || hideProtectedData(caught)) return;
      setRecovery({ problem, error: caught });
      fail("");
    } finally {
      if (recoveryRequest.current === controller) recoveryRequest.current = null;
    }
  }

  async function retryCapabilities() {
    if (!recovery || savingRef.current || !canAct()) return;
    savingRef.current = true;
    setBusy(true);
    try {
      await refreshCapabilities(recovery.problem);
    } finally {
      if (canAct()) {
        savingRef.current = false;
        setBusy(false);
      }
    }
  }

  async function removeImage() {
    if (!canAct()) return;
    setSelectedImage(null);
    if (pendingImageId) {
      try {
        await deleteStoreProductImage(pendingImageId);
        if (!canAct()) return;
        setPendingImage(null);
        setImage(null);
      } catch (caught) {
        if (canAct() && !hideProtectedData(caught)) fail(requestErrorMessage(caught, t));
      }
    } else setImage(null);
  }

  async function cancel() {
    if (!canAct()) return;
    if (pendingImageId) {
      try {
        await deleteStoreProductImage(pendingImageId);
        if (!canAct()) return;
        setPendingImage(null);
      } catch (caught) {
        if (canAct() && !hideProtectedData(caught)) fail(requestErrorMessage(caught, t));
        return;
      }
    }
    router.back();
  }

  function isSelectableCategory(item: StoreCategory) {
    return (
      !item.has_children &&
      (item.is_active || (Boolean(productId) && !selling && item.id === originalCategoryId))
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || recovery || !canAct()) return;
    const leaf = categories.find((item) => item.id === categoryId && isSelectableCategory(item));
    const parsedSize = parsePositiveDecimal(unitSize);
    const parsedPrice = parsePositiveBigInteger(price);
    const parsedQuota = csa ? parsePositiveQuotaUnits(quotaCost) : { value: 0 };
    const translations = (["vi", "en"] as const).flatMap((language) => {
      const value = content[language];
      const original = originalDescriptions.current[language];
      const document = longDescriptions[language];
      // Normalize the submitted copy only; replacing the live editor value resets selection.
      const savedDocument = descriptionChanged(document, original.text, original.document)
        ? normalizeTiptapLinks(document)
        : document;
      return value.name.trim()
        ? [
            {
              locale: language,
              name: value.name.trim(),
              short_description: value.description.trim(),
              ...descriptionPayload(savedDocument, original.text, original.document),
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
          descriptionChanged(
            longDescriptions[language],
            originalDescriptions.current[language].text,
            originalDescriptions.current[language].document,
          ) && descriptionText(longDescriptions[language]).length > 10_000,
      )
    )
      return fail(copy.descriptionTooLong);
    if (
      (["vi", "en"] as const).some(
        (language) =>
          (content[language].description.trim() ||
            descriptionText(longDescriptions[language]).trim()) &&
          !content[language].name.trim(),
      )
    )
      return fail(copy.invalidForm);
    if (selling && translations.length !== 2) return fail(copy.translationsRequired);
    if (selling && !image && !selectedImage) return fail(copy.imageRequired);
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
          if (!canAct()) return;
          setPendingImage(null);
        }
        if (!canAct()) return;
        savedImage = await uploadStoreProductImage(selectedImage);
        if (!canAct()) {
          if (isCurrent())
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
          ...(!identityLocked && {
            sku: sku.trim().toUpperCase(),
            unit_size: String(parsedSize.value),
            unit_label_vi: unitVi.trim(),
            unit_label_en: unitEn.trim(),
          }),
          category_id: categoryId,
          retail_price_vnd: parsedPrice.value!.toString(),
          ...(!csaLocked && {
            csa_quota_group_id: csa ? groupId : null,
            csa_quota_cost: parsedQuota.value!,
          }),
          primary_image_id: savedImage?.id ?? null,
          translations,
        },
        productId,
      );
      saveInFlightRef.current = false;
      pendingImageIdRef.current = null;
      if (!canAct()) return;
      setPendingImage(null);
      toast(copy.success);
      router.replace(`/store-catalog/products/${item.id}`);
    } catch (caught) {
      saveInFlightRef.current = false;
      if (!canAct()) {
        const imageId = pendingImageIdRef.current;
        if (imageId && isCurrent() && !isProtectedDataError(caught)) {
          pendingImageIdRef.current = null;
          void deleteStoreProductImage(imageId, { keepalive: true }).catch(() => undefined);
        }
        return;
      }
      if (hideProtectedData(caught)) return;

      const problem = caught instanceof Error ? (caught as ClientApiError) : null;
      const locked =
        problem?.status === 409 &&
        ["product_unit_in_use", "product_csa_hold_in_use"].includes(problem.message);
      // A form opened before publication may now be subject to selling validation.
      const sellingValidation =
        !selling &&
        problem?.message === "validation_error" &&
        ["category_id", "retail_price_vnd", "translations", "primary_image_id"].includes(
          problem.field ?? "",
        );
      if (productId && problem && (locked || sellingValidation)) {
        await refreshCapabilities(problem);
      } else {
        showSaveError(caught);
      }
    } finally {
      if (canAct()) {
        savingRef.current = false;
        setBusy(false);
      }
    }
  }

  if (accessError)
    return (
      <DataState
        kind="error"
        title={accessError}
        action={{ label: t.common.reloadPage, onClick: () => window.location.reload() }}
      />
    );
  if (loadError)
    return (
      <DataState
        kind="error"
        title={loadError}
        action={{ label: t.common.retry, onClick: () => setLoadRetry((value) => value + 1) }}
      />
    );
  if (!loaded) return <DataState kind="loading" title={copy.loading} />;
  const leafCategories = categories.filter(isSelectableCategory);
  return (
    <form className="catalog-editor" noValidate onSubmit={submit} ref={formRef}>
      {(recovery || error) && (
        <Alert color="red" ref={errorRef} role="alert" tabIndex={-1}>
          {recovery ? (
            <Stack gap="sm" align="flex-start">
              <span>{copy.productCapabilitiesUnverified}</span>
              <span>{requestErrorMessage(recovery.error, t)}</span>
              <Button variant="default" type="button" disabled={busy} onClick={retryCapabilities}>
                {t.common.retry}
              </Button>
            </Stack>
          ) : (
            error
          )}
        </Alert>
      )}
      <section className="catalog-editor-section">
        <h2>{copy.products}</h2>
        <div className="form-grid">
          <FormField label={copy.sku + " *"} className="field">
            <FormInput
              aria-describedby="store-product-sku-help"

              disabled={busy || identityLocked}
              maxLength={80}
              name="sku"
              placeholder={copy.skuPlaceholder}
              value={sku}
              onChange={(event) => setSku(event.target.value)}
            />
            <small className="field-help" id="store-product-sku-help">
              {copy.skuHelp}
            </small>
          </FormField>
          <FormField label={copy.productCategory + " *"} className="field">
            <FormSelect
              aria-describedby="store-product-category-help"
              disabled={busy}
              data-focus-field="category_id"
              name="category_id"
              value={categoryId}
              onChange={(selection) => setCategoryId(selection ?? "")}
              data={[
                { value: "", label: copy.selectLeaf },
                ...leafCategories.map((category) => ({
                  value: category.id,
                  label: categoryPath(category, categories, locale),
                })),
              ]}
            />
            <small className="field-help" id="store-product-category-help">
              {copy.categoryHelp}
            </small>
          </FormField>
          <FormField label={copy.unitVi + " *"} className="field">
            <FormInput
              disabled={busy || identityLocked}
              maxLength={40}
              name="unit_label_vi"
              placeholder={copy.unitViPlaceholder}
              value={unitVi}
              onChange={(event) => setUnitVi(event.target.value)}
            />
          </FormField>
          <FormField label={copy.unitEn + " *"} className="field">
            <FormInput
              disabled={busy || identityLocked}
              maxLength={40}
              name="unit_label_en"
              placeholder={copy.unitEnPlaceholder}
              value={unitEn}
              onChange={(event) => setUnitEn(event.target.value)}
            />
          </FormField>
          <FormField label={copy.unitSize + " *"} className="field">
            <FormInput
              aria-describedby="store-product-unit-size-help"

              disabled={busy || identityLocked}
              inputMode="decimal"
              name="unit_size"
              placeholder={copy.unitSizePlaceholder}
              value={unitSize}
              onChange={(event) => setUnitSize(sanitizeDecimalInput(event.target.value))}
            />
            <small className="field-help" id="store-product-unit-size-help">
              {copy.unitSizeHelp}
            </small>
          </FormField>
          <FormField label={copy.price + " *"} className="field">
            <FormInput
              disabled={busy}
              inputMode="numeric"
              name="retail_price_vnd"
              value={price}
              onChange={(event) => setPrice(sanitizeIntegerInput(event.target.value))}
            />
          </FormField>
        </div>
      </section>
      {identityLocked && capabilities && (
        <Alert>
          <p>{copy.productLocked}</p>
          <ProductLockReasons reasons={capabilities.edit_identity.reasons} />
        </Alert>
      )}
      <BilingualContentFields
        busy={busy}
        completionLabels={{ complete: copy.complete, incomplete: copy.incomplete }}
        defaultLocale={locale}
        descriptionLabel={copy.shortDescription}
        languageLabels={{ vi: t.common.vietnamese, en: t.common.english }}
        renderAfterDescription={(language) => (
          <div className="field full store-product-rich-description">
            <span>{copy.descriptionLabel}</span>
            <LazyRichTextEditor
              key={language}
              ariaLabel={copy.descriptionLabel}
              disabled={busy}
              imageAlt=""
              variant="product"
              value={longDescriptions[language]}
              onChange={(document) =>
                setLongDescriptions((current) => ({
                  ...current,
                  [language]: document,
                }))
              }
            />
          </div>
        )}
        nameLabel={copy.productName}
        onChange={setContent}
        requireNames={selling}
        title={copy.translationSection}
        value={content}
      />
      <section className="catalog-editor-section">
        <h2>{copy.saleType}</h2>
        <FormField label={copy.saleType} className="field">
          <FormSelect
            disabled={busy || csaLocked}
            value={csa ? "yes" : "no"}
            onChange={(selection) => {
              const enabled = (selection ?? "") === "yes";
              setCsa(enabled);
              if (!enabled) {
                setGroupId("");
                setQuotaCost("");
              }
            }}
            data={[
              { value: "no", label: copy.retailOnly },
              { value: "yes", label: copy.csaSaleOption },
            ]}
          />
        </FormField>
        {csa && (
          <div className="form-grid">
            <FormField label={copy.quotaGroup + " *"} className="field">
              <FormSelect
                disabled={busy || csaLocked || groupLoading}
                data-focus-field="csa_quota_group_id"
                name="csa_quota_group_id"
                value={groupId}
                onChange={(selection) => setGroupId(selection ?? "")}
                data={[
                  { value: "", label: copy.quotaGroup },
                  ...groups.map((group) => ({
                    value: group.id,
                    label:
                      localizedCatalogTranslation(group.translations, locale)?.name || group.name,
                  })),
                ]}
              />
            </FormField>
            <FormField label={copy.quotaCost + " *"} className="field">
              <FormInput
                disabled={busy || csaLocked}
                inputMode="decimal"
                name="csa_quota_cost"
                value={quotaCost}
                onChange={(event) => setQuotaCost(event.target.value.replace(/,/g, "."))}
              />
            </FormField>
            {groupError && (
              <Alert color="red" role="alert">
                <Stack gap="sm" align="flex-start">
                  {groupError}
                  <Button
                    variant="default"
                    onClick={() => setGroupRetry((value) => value + 1)}
                    type="button"
                  >
                    {t.common.retry}
                  </Button>
                </Stack>
              </Alert>
            )}
            {moreGroups && (
              <Button
                variant="default"
                disabled={groupLoading}
                onClick={() => setGroupPage((value) => value + 1)}
                type="button"
              >
                {t.common.next}
              </Button>
            )}
          </div>
        )}
        {csaLocked && capabilities && (
          <Alert>
            <p>{copy.productCsaLocked}</p>
            <ProductLockReasons reasons={capabilities.edit_csa.reasons} />
          </Alert>
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
        <ProductLifecycleStatus status={status} />
      </section>
      <div className="catalog-editor-actions">
        <Button variant="default" disabled={busy} onClick={cancel} type="button">
          {copy.cancel}
        </Button>
        <Button disabled={busy || recovery !== null} type="submit">
          {busy ? copy.saving : copy.save}
        </Button>
      </div>
    </form>
  );
}
