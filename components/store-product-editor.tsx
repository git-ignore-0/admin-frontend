"use client";
import {
  Alert,
  Button,
  Divider,
  Grid,
  Group,
  Input,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  TextInput,
  Title,
  useMantineTheme,
} from "@mantine/core";

import { useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminImagePicker } from "@/components/admin-image-picker";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import {
  BilingualContentFields,
  emptyBilingualContent,
} from "@/components/bilingual-content-fields";
import { DataState } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import {
  ProductLifecycleStatus,
  ProductLockDisclosure,
} from "@/components/product-lifecycle-status";
import { LazyRichTextEditor } from "@/components/lazy-rich-text-editor";
import { normalizeTiptapLinks } from "@/lib/rich-text-links";
import {
  descriptionChanged,
  descriptionDocument,
  descriptionPayload,
  descriptionText,
} from "@/lib/store-product-description";
import { useToast } from "@/components/toast-provider";
import { useAdminMutationIntent } from "@/lib/admin-mutation-intent";
import {
  deleteStoreProductImage,
  getStoreProduct,
  getStoreProductCreation,
  listStoreCategories,
  saveStoreProduct,
  uploadStoreProductImage,
  type ProductInput,
} from "@/lib/commerce-api";
import {
  invalidApiResponse,
  isProtectedDataError,
  isUncertainMutationError,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import type { CreationReceipt } from "@/lib/creation-receipt";
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
import { storeProductHref } from "@/lib/store-product-navigation";
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

type CapabilityRefreshReason =
  { kind: "rejected"; problem: ClientApiError } | { kind: "uncertain" };

function ProductEditorForm({ productId }: { productId?: string }) {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const router = useRouter();
  const search = useSearchParams();
  const listHref = storeProductHref(search);
  const parentHref = storeProductHref(search, productId);
  const routePath = storeProductHref(null, productId, productId ? "edit" : "new");
  const theme = useMantineTheme();
  const toast = useToast();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const { intent: creation, controls: creationControls } = useAdminMutationIntent<
    Partial<ProductInput> & { sku: string; idempotency_key: string },
    CreationReceipt
  >("product-create", "new");
  const createIntent = productId ? null : creation;
  const uncertainCreate = createIntent?.phase === "unknown" ? createIntent.payload : null;
  const accessRevoked = useRef(false);
  const recoveryRequest = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const pendingImage = useRef<{ id: string; mayBeReferenced: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const translationRef = useRef(t);
  translationRef.current = t;
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [groups, setGroups] = useState<
    Array<Pick<MembershipProduct, "id" | "name" | "translations">>
  >([]);
  const [assignedGroup, setAssignedGroup] = useState<StoreProduct["csa_quota_group"]>(null);
  const [groupPage, setGroupPage] = useState(1);
  const [moreGroups, setMoreGroups] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadRetry, setLoadRetry] = useState(0);
  const [groupRetry, setGroupRetry] = useState(0);
  const fetchedGroupPage = useRef(0);
  const [version, setVersion] = useState<number>();
  const [sku, setSku] = useState("");
  const [savedIdentity, setSavedIdentity] = useState<Pick<StoreProduct, "sku" | "translations">>();
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
    reason: CapabilityRefreshReason;
    error?: unknown;
    latestVersion?: number;
  } | null>(null);

  function canAct() {
    return mountedRef.current && !accessRevoked.current && isCurrent();
  }

  const cleanUpOnExit = useCallback(() => {
    const upload = pendingImage.current;
    if (!upload || upload.mayBeReferenced || !isCurrent() || accessRevoked.current) return;
    pendingImage.current = null;
    void deleteStoreProductImage(upload.id, { keepalive: true }).catch(() => undefined);
  }, [isCurrent]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recoveryRequest.current?.abort();
      if (!saveInFlightRef.current) cleanUpOnExit();
    };
  }, [cleanUpOnExit]);

  useEffect(() => {
    if (!selectedImage || typeof URL.createObjectURL !== "function") {
      setPreviewUrl("");
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(selectedImage);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedImage]);

  const needsQuotaGroups = loaded && csa && !csaLocked && !accessError;
  useEffect(() => {
    if (!needsQuotaGroups || fetchedGroupPage.current === groupPage) return;
    const controller = new AbortController();
    setGroupLoading(true);
    listActiveQuotaGroups(groupPage, controller.signal)
      .then(({ data, meta }) => {
        if (controller.signal.aborted || !isCurrent()) return;
        fetchedGroupPage.current = groupPage;
        setGroups((current) => {
          const next = new Map(current.map((value) => [value.id, value]));
          data.forEach((value) => next.set(value.id, value));
          return [...next.values()];
        });
        setMoreGroups(Boolean(meta && meta.page * meta.page_size < meta.total));
        setGroupError("");
      })
      .catch((caught) => {
        if (!controller.signal.aborted && isCurrent()) {
          if (isProtectedDataError(caught)) {
            setGroups([]);
            setMoreGroups(false);
            fetchedGroupPage.current = 0;
          }
          setGroupError(requestErrorMessage(caught, translationRef.current));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && isCurrent()) setGroupLoading(false);
      });
    return () => controller.abort();
  }, [needsQuotaGroups, groupPage, groupRetry, isCurrent]);

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
    setAssignedGroup(item.csa_quota_group);
  }, []);

  const hydrate = useCallback(
    (item: StoreProductDetail) => {
      setSavedIdentity({ sku: item.sku, translations: item.translations });
      setVersion(item.version);
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

  async function refreshCapabilities(reason: CapabilityRefreshReason) {
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
      setSavedIdentity({ sku: latest.sku, translations: latest.translations });
      setOriginalCategoryId(latest.category_id);
      if (!latest.capabilities.edit_identity.allowed) hydrateIdentity(latest);
      if (!latest.capabilities.edit_csa.allowed) hydrateCsa(latest);
      const upload = pendingImage.current;
      if (upload && upload.id.toLowerCase() === latest.primary_image_id?.toLowerCase()) {
        pendingImage.current = null;
        setImage(latest.primary_image);
      }
      if (reason.kind === "rejected" && reason.problem.message === "version_conflict") {
        setRecovery({ reason, latestVersion: latest.version });
      } else setRecovery(null);
      if (reason.kind === "uncertain") fail(copy.productSaveUncertain);
      else if (reason.problem.message === "validation_error") showSaveError(reason.problem);
      else fail(copy.statusConflict);
    } catch (caught) {
      if (!canAct() || controller.signal.aborted || hideProtectedData(caught)) return;
      setRecovery({ reason, error: caught });
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
      await refreshCapabilities(recovery.reason);
    } finally {
      if (canAct()) {
        savingRef.current = false;
        setBusy(false);
      }
    }
  }

  function finishCreation(id: string) {
    if (!canAct()) return;
    creationControls.clear();
    toast(copy.success);
    router.replace(storeProductHref(search, id));
  }

  async function recoverCreation(replay: boolean) {
    if (!uncertainCreate || savingRef.current || !canAct()) return;
    const attempt = creationControls.begin();
    if (!attempt) return;
    const controller = new AbortController();
    if (!replay) recoveryRequest.current = controller;
    savingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const receipt = replay
        ? await saveStoreProduct(attempt.payload, undefined, canAct)
        : await getStoreProductCreation(attempt.payload.idempotency_key, controller.signal);
      pendingImage.current = null;
      if (!isCurrent() || !creationControls.settle(attempt, { phase: "confirmed", receipt }))
        return;
      if (canAct() && !receipt.removed) finishCreation(receipt.id);
    } catch (caught) {
      if (!isCurrent()) return;
      const denied = isProtectedDataError(caught);
      if (
        !creationControls.settle(
          attempt,
          denied ? { phase: "retired" } : { ...attempt, phase: "unknown" },
        ) ||
        !canAct()
      )
        return;
      if (denied) hideProtectedData(caught);
      else if (!controller.signal.aborted) {
        const missing = (caught as ClientApiError | null)?.message === "create_receipt_not_found";
        fail(missing ? copy.productCreateStillUnknown : requestErrorMessage(caught, t));
      }
    } finally {
      if (recoveryRequest.current === controller) recoveryRequest.current = null;
      if (canAct()) {
        savingRef.current = false;
        setBusy(false);
      }
    }
  }

  async function discardPendingImage() {
    const upload = pendingImage.current;
    if (upload && !upload.mayBeReferenced) await deleteStoreProductImage(upload.id);
    pendingImage.current = null;
  }

  async function removeImage() {
    if (!canAct()) return;
    setSelectedImage(null);
    try {
      if (pendingImage.current) await discardPendingImage();
      if (canAct()) setImage(null);
    } catch (caught) {
      if (canAct() && !hideProtectedData(caught)) fail(requestErrorMessage(caught, t));
    }
  }

  async function cancel() {
    if (savingRef.current || !canAct()) return;
    savingRef.current = true;
    try {
      if (pendingImage.current) {
        setBusy(true);
        await discardPendingImage();
      }
      if (canAct()) router.replace(parentHref);
    } catch (caught) {
      if (canAct() && !hideProtectedData(caught)) fail(requestErrorMessage(caught, t));
    } finally {
      if (canAct()) {
        savingRef.current = false;
        setBusy(false);
      }
    }
  }

  function isSelectableCategory(item: StoreCategory) {
    return (
      !item.has_children &&
      (item.is_active || (Boolean(productId) && !selling && item.id === originalCategoryId))
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || recovery || (!productId && creationControls.read()) || !canAct())
      return;
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
    const submittedSku = sku.trim().toUpperCase();
    let createAttempt: ReturnType<typeof creationControls.begin> = null;
    try {
      let savedImage = image;
      if (selectedImage) {
        if (pendingImage.current) await discardPendingImage();
        if (!canAct()) return;
        savedImage = await uploadStoreProductImage(selectedImage, canAct);
        if (!canAct()) {
          if (isCurrent())
            void deleteStoreProductImage(savedImage.id, { keepalive: true }).catch(() => undefined);
          return;
        }
        setImage(savedImage);
        setSelectedImage(null);
        pendingImage.current = { id: savedImage.id, mayBeReferenced: false };
      }
      const payload = {
        ...(!identityLocked && {
          sku: submittedSku,
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
      };
      if (!productId) {
        createAttempt = creationControls.begin({
          ...payload,
          sku: submittedSku,
          idempotency_key: crypto.randomUUID(),
        });
        if (!createAttempt) return;
      }
      saveInFlightRef.current = true;
      const item = await saveStoreProduct(
        createAttempt?.payload ?? { ...payload, version },
        productId,
        canAct,
      );
      saveInFlightRef.current = false;
      pendingImage.current = null;
      if (createAttempt) {
        if (
          isCurrent() &&
          creationControls.settle(createAttempt, {
            phase: "confirmed",
            receipt: { id: item.id, removed: item.removed },
          }) &&
          !item.removed
        ) {
          finishCreation(item.id);
        }
        return;
      }
      if (!canAct()) return;
      toast(copy.success);
      router.replace(storeProductHref(search, item.id));
    } catch (caught) {
      const problem = caught instanceof Error ? (caught as ClientApiError) : null;
      const protectedData = isProtectedDataError(caught) || problem?.status === 404;
      const locked =
        problem?.status === 409 &&
        ["product_unit_in_use", "product_csa_hold_in_use"].includes(problem.message);
      const validation = problem?.status === 400 && problem.message === "validation_error";
      const uncertain =
        saveInFlightRef.current && !protectedData && isUncertainMutationError(caught);
      // The write can still attach the upload after a lost response or an early recovery GET.
      if (uncertain && pendingImage.current) pendingImage.current.mayBeReferenced = true;
      saveInFlightRef.current = false;
      if (createAttempt && isCurrent()) {
        creationControls.settle(
          createAttempt,
          protectedData
            ? { phase: "retired" }
            : uncertain
              ? { ...createAttempt, phase: "unknown" }
              : null,
        );
      }
      if (!canAct()) {
        if (!protectedData) cleanUpOnExit();
        return;
      }
      if (hideProtectedData(caught)) return;
      if (uncertain) {
        if (productId) await refreshCapabilities({ kind: "uncertain" });
        else fail("");
        return;
      }

      // A form opened before publication may now be subject to selling validation.
      const sellingValidation =
        !selling &&
        validation &&
        ["category_id", "retail_price_vnd", "translations", "primary_image_id"].includes(
          problem.field ?? "",
        );
      if (
        productId &&
        problem &&
        (locked || sellingValidation || problem.message === "version_conflict")
      ) {
        await refreshCapabilities({ kind: "rejected", problem });
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

  const sessionError = isCurrent() ? accessError : t.common.sessionChanged;
  const recordName =
    loaded && !sessionError && !loadError && savedIdentity
      ? savedIdentity.translations
          .find((entry) => entry.locale === locale && entry.name.trim())
          ?.name.trim() ||
        savedIdentity.translations.find((entry) => entry.name.trim())?.name.trim() ||
        savedIdentity.sku
      : "";
  const pageTitle = productId ? copy.edit : copy.addProduct;
  const recordLabel = recordName || t.breadcrumb.productDetails;
  const breadcrumbItems = useMemo(
    () => [
      { label: copy.products, href: listHref },
      ...(productId ? [{ label: recordLabel, href: parentHref }] : []),
      { label: pageTitle },
    ],
    [copy.products, listHref, productId, recordLabel, parentHref, pageTitle],
  );
  const breadcrumb = (
    <AdminBreadcrumbForRoute
      pathname={routePath}
      search={search?.toString() ?? ""}
      items={breadcrumbItems}
    />
  );
  const heading = recordName ? (
    <Title order={1} miw={0} style={{ overflowWrap: "anywhere" }}>
      {recordName}
    </Title>
  ) : (
    <PageHeading title={pageTitle} visuallyHiddenTitle />
  );

  if (sessionError || loadError || !loaded)
    return (
      <>
        {breadcrumb}
        {heading}
        {sessionError ? (
          <DataState
            kind="error"
            title={sessionError}
            action={{ label: t.common.reloadPage, onClick: () => window.location.reload() }}
          />
        ) : loadError ? (
          <DataState
            kind="error"
            title={loadError}
            action={{ label: t.common.retry, onClick: () => setLoadRetry((value) => value + 1) }}
          />
        ) : (
          <DataState kind="loading" title={copy.loading} />
        )}
      </>
    );

  const leafCategories = categories.filter(isSelectableCategory);
  const groupOptions = (
    assignedGroup && !groups.some((group) => group.id === assignedGroup.id)
      ? [assignedGroup, ...groups]
      : groups
  ).map((group) => ({
    value: group.id,
    label: localizedCatalogTranslation(group.translations, locale)?.name || group.name,
  }));
  return (
    <>
      {breadcrumb}
      <form noValidate onSubmit={submit} ref={formRef}>
        <Stack gap="md" mb="lg">
          <Group component="header" gap="sm">
            {heading}
            <ProductLifecycleStatus status={status} />
          </Group>
          {(recovery || createIntent || error) && (
            <Alert color="danger" ref={errorRef} role="alert" tabIndex={-1}>
              {recovery ? (
                <Stack gap="sm" align="flex-start">
                  {recovery.reason.kind === "uncertain" && <span>{copy.productSaveUncertain}</span>}
                  <span>
                    {recovery.latestVersion
                      ? copy.statusConflict
                      : copy.productCapabilitiesUnverified}
                  </span>
                  {recovery.error !== undefined && (
                    <span>{requestErrorMessage(recovery.error, t)}</span>
                  )}
                  <Button
                    variant="default"
                    type="button"
                    disabled={busy}
                    onClick={
                      recovery.latestVersion
                        ? () => {
                            setVersion(recovery.latestVersion);
                            setRecovery(null);
                          }
                        : retryCapabilities
                    }
                  >
                    {recovery.latestVersion ? copy.productUseLatestVersion : t.common.retry}
                  </Button>
                </Stack>
              ) : uncertainCreate ? (
                <Stack gap="sm" align="flex-start">
                  <span>{copy.productCreateUncertain.replace("{sku}", uncertainCreate.sku)}</span>
                  <Group gap="xs">
                    <Button
                      type="button"
                      variant="default"
                      disabled={busy}
                      onClick={() => void recoverCreation(false)}
                    >
                      {copy.productCheckCreate}
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      disabled={busy}
                      onClick={() => void recoverCreation(true)}
                    >
                      {copy.productRetryCreate}
                    </Button>
                  </Group>
                  {error && <span>{error}</span>}
                </Stack>
              ) : createIntent?.phase === "confirmed" ? (
                <Group>
                  <span>
                    {createIntent.receipt.removed ? copy.productCreateRemoved : copy.success}
                  </span>
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => {
                      if (createIntent.receipt.removed) {
                        creationControls.clear();
                        void cancel();
                      } else finishCreation(createIntent.receipt.id);
                    }}
                  >
                    {createIntent.receipt.removed ? copy.cancel : copy.productOpenCreated}
                  </Button>
                </Group>
              ) : createIntent?.phase === "retired" ? (
                t.common.forbidden
              ) : createIntent?.phase === "pending" ? (
                copy.saving
              ) : (
                error
              )}
            </Alert>
          )}
          <Grid type="container" breakpoints={theme.breakpoints} gutter="md" align="flex-start">
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Stack gap="md" miw={0}>
                <BilingualContentFields
                  busy={busy}
                  completionLabels={{ complete: copy.complete, incomplete: copy.incomplete }}
                  defaultLocale={locale}
                  descriptionLabel={copy.shortDescription}
                  languageLabels={{ vi: t.common.vietnamese, en: t.common.english }}
                  renderAfterDescription={(language) => (
                    <Stack gap="xs" miw={0}>
                      <Input.Label labelElement="div" size="sm">
                        {copy.descriptionLabel}
                      </Input.Label>
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
                    </Stack>
                  )}
                  nameLabel={copy.productName}
                  onChange={setContent}
                  requireNames={selling}
                  title={copy.productContent}
                  value={content}
                />
                <Paper component="section" p="md">
                  <Stack gap="md">
                    <Title order={2}>{copy.salesInformation}</Title>
                    <SimpleGrid type="container" cols={{ base: 1, "32rem": 2 }} spacing="md">
                      <TextInput
                        label={copy.price}
                        required
                        disabled={busy}
                        inputMode="numeric"
                        name="retail_price_vnd"
                        value={price}
                        onChange={(event) => setPrice(sanitizeIntegerInput(event.target.value))}
                      />
                      {csaLocked ? (
                        <TextInput
                          label={copy.saleType}
                          value={csa ? copy.csaSaleOption : copy.retailOnly}
                          disabled={busy}
                          readOnly
                        />
                      ) : (
                        <Select
                          label={copy.saleType}
                          role="combobox"
                          disabled={busy}
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
                      )}
                    </SimpleGrid>
                    {csa && (
                      <>
                        <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }} spacing="md">
                          {csaLocked ? (
                            <TextInput
                              label={copy.quotaGroup}
                              value={
                                groupOptions.find((group) => group.value === groupId)?.label ?? ""
                              }
                              disabled={busy}
                              readOnly
                            />
                          ) : (
                            <Select
                              label={copy.quotaGroup}
                              required
                              role="combobox"
                              disabled={busy || groupLoading}
                              data-focus-field="csa_quota_group_id"
                              name="csa_quota_group_id"
                              value={groupId}
                              onChange={(selection) => setGroupId(selection ?? "")}
                              data={[{ value: "", label: copy.quotaGroup }, ...groupOptions]}
                            />
                          )}
                          <TextInput
                            label={copy.quotaCost}
                            required
                            disabled={busy}
                            readOnly={csaLocked}
                            inputMode="decimal"
                            name="csa_quota_cost"
                            value={quotaCost}
                            onChange={(event) =>
                              setQuotaCost(event.target.value.replace(/,/g, "."))
                            }
                          />
                        </SimpleGrid>
                        {groupError && (
                          <Alert color="danger" role="alert">
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
                            w="fit-content"
                          >
                            {t.common.next}
                          </Button>
                        )}
                      </>
                    )}
                    {csaLocked && capabilities && (
                      <ProductLockDisclosure
                        summary={copy.productCsaLocked}
                        reasons={capabilities.edit_csa.reasons}
                      />
                    )}
                  </Stack>
                </Paper>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 5 }}>
              <Paper p="md">
                <Stack gap="md">
                  <Stack component="section" gap="md">
                    <Title order={2}>{copy.basicInformation}</Title>
                    <Select
                      label={copy.productCategory}
                      description={copy.categoryHelp}
                      inputWrapperOrder={["label", "input", "description", "error"]}
                      required
                      role="combobox"
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
                    <TextInput
                      label={copy.sku}
                      description={identityLocked ? undefined : copy.skuHelp}
                      inputWrapperOrder={["label", "input", "description", "error"]}
                      required
                      disabled={busy}
                      readOnly={identityLocked}
                      maxLength={80}
                      name="sku"
                      placeholder={copy.skuPlaceholder}
                      value={sku}
                      onChange={(event) => setSku(event.target.value)}
                    />
                    <TextInput
                      label={copy.unitSize}
                      description={identityLocked ? undefined : copy.unitSizeHelp}
                      inputWrapperOrder={["label", "input", "description", "error"]}
                      required
                      disabled={busy}
                      readOnly={identityLocked}
                      inputMode="decimal"
                      name="unit_size"
                      placeholder={copy.unitSizePlaceholder}
                      value={unitSize}
                      onChange={(event) => setUnitSize(sanitizeDecimalInput(event.target.value))}
                    />
                    <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }} spacing="md">
                      <TextInput
                        label={copy.unitVi}
                        required
                        disabled={busy}
                        readOnly={identityLocked}
                        maxLength={40}
                        name="unit_label_vi"
                        placeholder={copy.unitViPlaceholder}
                        value={unitVi}
                        onChange={(event) => setUnitVi(event.target.value)}
                      />
                      <TextInput
                        label={copy.unitEn}
                        required
                        disabled={busy}
                        readOnly={identityLocked}
                        maxLength={40}
                        name="unit_label_en"
                        placeholder={copy.unitEnPlaceholder}
                        value={unitEn}
                        onChange={(event) => setUnitEn(event.target.value)}
                      />
                    </SimpleGrid>
                    {identityLocked && capabilities && (
                      <ProductLockDisclosure
                        summary={copy.productLocked}
                        reasons={capabilities.edit_identity.reasons}
                      />
                    )}
                  </Stack>
                  <Divider />
                  <Stack component="section" gap="sm">
                    <Title order={2}>{copy.image}</Title>
                    <AdminImagePicker
                      items={
                        selectedImage && previewUrl
                          ? [{ id: "selected-image", src: previewUrl, alt: copy.imagePreviewAlt }]
                          : image
                            ? [
                                {
                                  id: image.id,
                                  src: mediaUrlForWidth(image, 160),
                                  alt: copy.imagePreviewAlt,
                                },
                              ]
                            : []
                      }
                      maxItems={1}
                      busy={busy}
                      fileName={selectedImage?.name}
                      help={copy.imageHelp}
                      labels={{
                        choose: copy.chooseImage,
                        replace: copy.replaceImage,
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
                  </Stack>
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>

          <Group component="footer" justify="flex-end" gap="xs">
            <Button variant="default" disabled={busy} onClick={cancel} type="button">
              {copy.cancel}
            </Button>
            <Button
              loading={busy}
              disabled={busy || recovery !== null || Boolean(createIntent)}
              type="submit"
            >
              {busy ? copy.saving : copy.save}
            </Button>
          </Group>
        </Stack>
      </form>
    </>
  );
}
