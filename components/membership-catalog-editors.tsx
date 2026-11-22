"use client";

import { IconTrash } from "@tabler/icons-react";
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Grid,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

import { DataState, FormInput, Section } from "@/components/nfv-controls";
import { RecoveryAlert } from "@/components/recovery-alert";
import styles from "./membership-catalog-editors.module.css";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import {
  MembershipPaymentPlanManager,
  paymentPlanDisplayName,
} from "@/components/membership-payment-plan-manager";
import {
  BilingualContentFields,
  emptyBilingualContent,
  type BilingualContentValue,
} from "@/components/bilingual-content-fields";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import {
  fromLegacyPackageItems,
  legacyPackageItemView,
  listActiveQuotaGroups,
  toLegacyPackageItems,
} from "@/lib/membership-catalog-adapter";
import { catalogHref, readCatalogListContext } from "@/lib/membership-catalog-navigation";
import { localizedCatalogTranslation } from "@/lib/membership-translations";
import {
  MAX_POSITIVE_BIG_INTEGER,
  MAX_UNIT_SIZE,
  formatDecimalInput,
  numericInputErrorMessage,
  parsePositiveDecimal,
  parsePositiveBigInteger,
  parsePositiveInteger,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";
import type { MembershipPackage, MembershipProduct, PaginationMeta } from "@/lib/types";

type ProductOption = Pick<MembershipProduct, "id" | "name" | "is_active" | "translations">;

function mergeProductOptions(current: ProductOption[], incoming: ProductOption[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return [...byId.values()];
}

function EditorActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  const { t } = useAdminI18n();
  return (
    <Group justify="flex-end" gap="xs">
      <Button variant="default" disabled={busy} onClick={onCancel} type="button">
        {t.membershipCatalog.cancel}
      </Button>
      <Button disabled={busy} type="submit">
        {busy ? t.membershipCatalog.saving : t.membershipCatalog.save}
      </Button>
    </Group>
  );
}

function preventSingleLineEnterSubmit(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (["button", "checkbox", "radio", "submit"].includes(target.type)) return;
  event.preventDefault();
}

function LoadFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useAdminI18n();
  return (
    <Paper withBorder p="md">
      <RecoveryAlert
        message={requestErrorMessage(error, t)}
        onRetry={retry}
        retryLabel={t.common.retry}
      />
    </Paper>
  );
}

type ProductForm = {
  content: BilingualContentValue;
  unitSize: string;
  unitVi: string;
  unitEn: string;
  isActive: boolean;
};

const emptyProduct: ProductForm = {
  content: emptyBilingualContent(),
  unitSize: "",
  unitVi: "",
  unitEn: "",
  isActive: true,
};

function productForm(item: MembershipProduct): ProductForm {
  const content = emptyBilingualContent();
  item.translations.forEach((translation) => {
    content[translation.locale] = {
      name: translation.name,
      description: translation.short_description,
    };
  });
  return {
    content,
    unitSize: formatDecimalInput(item.unit_size),
    unitVi: item.unit_label_vi,
    unitEn: item.unit_label_en,
    isActive: item.is_active,
  };
}

export function MembershipProductEditor({ productId }: { productId?: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const router = useRouter();
  const listContext = readCatalogListContext(useSearchParams());
  const savingRef = useRef(false);
  const [form, setForm] = useState<ProductForm>({ ...emptyProduct });
  const [loaded, setLoaded] = useState(!productId);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [unitSizeError, setUnitSizeError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoaded(false);
    setLoadError(null);
    api<MembershipProduct>(`admin/membership-products/${productId}`)
      .then((item) => {
        setForm(productForm(item));
        setLoaded(true);
      })
      .catch(setLoadError);
  }, [loadAttempt, productId]);

  function update(field: keyof ProductForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const parsedUnitSize = parsePositiveDecimal(form.unitSize);
    if (parsedUnitSize.error) {
      setUnitSizeError(
        numericInputErrorMessage(parsedUnitSize.error, t.common.numericInput, MAX_UNIT_SIZE),
      );
      return;
    }
    if (!form.content.vi.name.trim() || !form.content.en.name.trim()) {
      setError(t.membershipCatalog.namesRequired);
      return;
    }
    setUnitSizeError("");
    setError("");
    savingRef.current = true;
    setBusy(true);
    let navigating = false;
    try {
      const item = await api<MembershipProduct>(
        productId ? `admin/membership-products/${productId}` : "admin/membership-products",
        {
          method: productId ? "PATCH" : "POST",
          body: JSON.stringify({
            translations: (["vi", "en"] as const).map((translationLocale) => ({
              locale: translationLocale,
              name: form.content[translationLocale].name.trim(),
              short_description: form.content[translationLocale].description.trim(),
            })),
            unit_size: parsedUnitSize.value,
            unit_label_vi: form.unitVi.trim(),
            unit_label_en: form.unitEn.trim(),
            is_active: form.isActive,
          }),
        },
      );
      toast(productId ? t.membershipCatalog.updated : t.membershipCatalog.created);
      navigating = true;
      router.replace(catalogHref("products", listContext, item.id));
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "csa_quota_group_in_use"
          ? t.membershipCatalog.quotaGroupInUse
          : requestErrorMessage(caught, t),
      );
    } finally {
      if (!navigating) {
        savingRef.current = false;
        setBusy(false);
      }
    }
  }

  if (loadError && !loaded) {
    return <LoadFailure error={loadError} retry={() => setLoadAttempt((value) => value + 1)} />;
  }
  if (!loaded) return <DataState kind="loading" title={t.membershipCatalog.loadingProduct} />;

  return (
    <Stack gap="md" pb="md" renderRoot={(props) => <form {...props} noValidate onSubmit={save} />}>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <BilingualContentFields
        busy={busy}
        completionLabels={{
          complete: t.membershipCatalog.complete,
          incomplete: t.membershipCatalog.incomplete,
        }}
        defaultLocale={locale}
        descriptionLabel={t.membershipCatalog.shortDescription}
        languageLabels={{ vi: t.common.vietnamese, en: t.common.english }}
        nameLabel={t.membershipCatalog.productName}
        onChange={(content) => setForm((current) => ({ ...current, content }))}
        title={t.membershipCatalog.displayContent}
        value={form.content}
      />
      <Section
        title={t.membershipCatalog.unitsAndStatus}
        description={t.membershipCatalog.unitHelp}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            disabled={busy}
            error={unitSizeError && <span role="alert">{unitSizeError}</span>}
            inputMode="decimal"
            label={t.membershipCatalog.unitSize}
            onChange={(event) => {
              update("unitSize", sanitizeDecimalInput(event.currentTarget.value));
              setUnitSizeError("");
            }}
            required
            value={form.unitSize}
          />
          <TextInput
            disabled={busy}
            label={t.membershipCatalog.unitVi}
            maxLength={40}
            onChange={(event) => update("unitVi", event.currentTarget.value)}
            required
            value={form.unitVi}
          />
          <TextInput
            disabled={busy}
            label={t.membershipCatalog.unitEn}
            maxLength={40}
            onChange={(event) => update("unitEn", event.currentTarget.value)}
            required
            value={form.unitEn}
          />
        </SimpleGrid>
        <Checkbox
          checked={form.isActive}
          disabled={busy}
          label={t.membershipCatalog.active}
          onChange={(event) => update("isActive", event.currentTarget.checked)}
        />
      </Section>
      <EditorActions
        busy={busy}
        onCancel={() => router.push(catalogHref("products", listContext, productId))}
      />
    </Stack>
  );
}

type PackageLine = { quotaGroupId: string; quotaUnits: string };
type PriceOptionLine = {
  id?: string;
  durationMonths: string;
  monthlyPriceVnd: string;
  isActive: boolean;
};
type PackageForm = {
  content: BilingualContentValue;
  priceOptions: PriceOptionLine[];
  policy: "expire" | "rollover";
  isActive: boolean;
  lines: PackageLine[];
};

const emptyPackage: PackageForm = {
  content: emptyBilingualContent(),
  priceOptions: [{ durationMonths: "6", monthlyPriceVnd: "", isActive: true }],
  policy: "expire",
  isActive: true,
  lines: [{ quotaGroupId: "", quotaUnits: "1" }],
};

function packageForm(item: MembershipPackage): PackageForm {
  const content = emptyBilingualContent();
  item.translations.forEach((translation) => {
    content[translation.locale] = {
      name: translation.name,
      description: translation.description,
    };
  });
  return {
    content,
    priceOptions: item.price_options.map((option) => ({
      id: option.id,
      durationMonths: String(option.duration_months),
      monthlyPriceVnd: option.monthly_price_vnd,
      isActive: option.is_active,
    })),
    policy: item.quota_policy,
    isActive: item.is_active,
    lines: fromLegacyPackageItems(item.items).map((line) => ({
      quotaGroupId: line.quotaGroupId,
      quotaUnits: String(line.quotaUnits),
    })),
  };
}

type PackageInputErrors = {
  priceOptions: Record<number, { duration?: string; monthlyPrice?: string }>;
  quotaUnits: Record<number, string>;
};

export function MembershipPackageEditor({ packageId }: { packageId?: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const router = useRouter();
  const listContext = readCatalogListContext(useSearchParams());
  const savingRef = useRef(false);
  const [form, setForm] = useState<PackageForm>(structuredClone(emptyPackage));
  const [loadedPackage, setLoadedPackage] = useState<MembershipPackage | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [visibleProductIds, setVisibleProductIds] = useState<Set<string>>(new Set());
  const [productMeta, setProductMeta] = useState<PaginationMeta | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [productsAttempt, setProductsAttempt] = useState(0);
  const [loaded, setLoaded] = useState(!packageId);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focusedPrice, setFocusedPrice] = useState<number | null>(null);
  const [inputErrors, setInputErrors] = useState<PackageInputErrors>({
    priceOptions: {},
    quotaUnits: {},
  });

  useEffect(() => {
    if (!packageId) return;
    setLoaded(false);
    setLoadError(null);
    api<MembershipPackage>(`admin/membership-packages/${packageId}`)
      .then((item) => {
        setForm(packageForm(item));
        setLoadedPackage(item);
        setProducts((current) =>
          mergeProductOptions(
            current,
            item.items.map((raw) => {
              const line = legacyPackageItemView(raw);
              return {
                id: line.quotaGroupId,
                name: line.name,
                is_active: line.isActive,
                translations: line.translations,
              };
            }),
          ),
        );
        setLoaded(true);
      })
      .catch(setLoadError);
  }, [loadAttempt, packageId]);

  async function reloadPaymentPlans() {
    if (!packageId) return;
    const item = await api<MembershipPackage>(`admin/membership-packages/${packageId}`);
    setLoadedPackage(item);
  }

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    setProductsError("");
    listActiveQuotaGroups(productPage)
      .then((payload) => {
        if (cancelled) return;
        setProducts((current) => mergeProductOptions(current, payload.data));
        setVisibleProductIds(new Set(payload.data.map((item) => item.id)));
        setProductMeta(payload.meta ?? null);
      })
      .catch((caught) => {
        if (!cancelled) setProductsError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productPage, productsAttempt, t]);

  function updateLine(index: number, patch: Partial<PackageLine>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  function updatePriceOption(index: number, patch: Partial<PriceOptionLine>) {
    setForm((current) => ({
      ...current,
      priceOptions: current.priceOptions.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option,
      ),
    }));
    setInputErrors((current) => ({
      ...current,
      priceOptions: { ...current.priceOptions, [index]: {} },
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!form.content.vi.name.trim() || !form.content.en.name.trim()) {
      setError(t.membershipCatalog.namesRequired);
      return;
    }
    const parsedOptions: Array<{
      id?: string;
      duration_months: number;
      monthly_price_vnd: string;
      is_active: boolean;
      sort_order: number;
    }> = [];
    const optionErrors: PackageInputErrors["priceOptions"] = {};
    form.priceOptions.forEach((option, index) => {
      const duration = parsePositiveInteger(option.durationMonths);
      const monthly = parsePositiveBigInteger(option.monthlyPriceVnd);
      const totalOverflows =
        !duration.error && !monthly.error
          ? monthly.value * BigInt(duration.value) > MAX_POSITIVE_BIG_INTEGER
          : false;
      optionErrors[index] = {
        duration: duration.error
          ? numericInputErrorMessage(duration.error, t.common.numericInput)
          : undefined,
        monthlyPrice: monthly.error
          ? monthly.error === "integer_range"
            ? t.membershipCatalog.totalOverflow
            : numericInputErrorMessage(monthly.error, t.common.numericInput)
          : totalOverflows
            ? t.membershipCatalog.totalOverflow
            : undefined,
      };
      if (!duration.error && !monthly.error && !totalOverflows) {
        parsedOptions[index] = {
          ...(option.id ? { id: option.id } : {}),
          duration_months: duration.value,
          monthly_price_vnd: monthly.value.toString(),
          is_active: option.isActive,
          sort_order: index,
        };
      }
    });
    const quotaUnits: number[] = [];
    const quotaErrors: Record<number, string> = {};
    form.lines.forEach((line, index) => {
      const parsed = parsePositiveInteger(line.quotaUnits);
      if (parsed.error)
        quotaErrors[index] = numericInputErrorMessage(parsed.error, t.common.numericInput);
      else quotaUnits[index] = parsed.value;
    });
    const nextErrors: PackageInputErrors = {
      priceOptions: optionErrors,
      quotaUnits: quotaErrors,
    };
    setInputErrors(nextErrors);
    if (
      Object.values(optionErrors).some((item) => Object.values(item).some(Boolean)) ||
      Object.keys(quotaErrors).length
    )
      return;
    const activeOptions = parsedOptions.filter((option) => option.is_active);
    if (!activeOptions.length) {
      setError(t.membershipCatalog.activePriceRequired);
      return;
    }
    if (
      new Set(activeOptions.map((option) => option.duration_months)).size !== activeOptions.length
    ) {
      setError(t.membershipCatalog.uniqueActiveDuration);
      return;
    }
    const productIds = form.lines.map((line) => line.quotaGroupId);
    if (productIds.some((id) => !id) || new Set(productIds).size !== productIds.length) {
      setError(t.membershipCatalog.uniqueProducts);
      return;
    }
    if (productIds.some((id) => products.find((item) => item.id === id)?.is_active === false)) {
      setError(t.membershipCatalog.inactive);
      return;
    }
    setError("");
    savingRef.current = true;
    setBusy(true);
    let navigating = false;
    try {
      const item = await api<MembershipPackage>(
        packageId ? `admin/membership-packages/${packageId}` : "admin/membership-packages",
        {
          method: packageId ? "PATCH" : "POST",
          body: JSON.stringify({
            translations: (["vi", "en"] as const).map((translationLocale) => ({
              locale: translationLocale,
              name: form.content[translationLocale].name.trim(),
              description: form.content[translationLocale].description.trim(),
            })),
            price_options: parsedOptions,
            quota_policy: form.policy,
            is_active: form.isActive,
            items: toLegacyPackageItems(
              form.lines.map((line, index) => ({
                quotaGroupId: line.quotaGroupId,
                quotaUnits: quotaUnits[index],
              })),
            ),
          }),
        },
      );
      toast(packageId ? t.membershipCatalog.updated : t.membershipCatalog.created);
      navigating = true;
      router.replace(catalogHref("packages", listContext, item.id));
    } catch (caught) {
      const apiError = caught as Error & { field?: string; status?: number };
      setError(
        apiError.status === 400 && apiError.field === "price_options"
          ? t.membershipCatalog.priceOptionConflict
          : requestErrorMessage(caught, t),
      );
    } finally {
      if (!navigating) {
        savingRef.current = false;
        setBusy(false);
      }
    }
  }

  if (loadError && !loaded) {
    return <LoadFailure error={loadError} retry={() => setLoadAttempt((value) => value + 1)} />;
  }
  if (!loaded) return <DataState kind="loading" title={t.membershipCatalog.loadingPackage} />;

  const selected = new Set(form.lines.map((line) => line.quotaGroupId).filter(Boolean));
  const visibleProducts = products.filter(
    (item) => visibleProductIds.has(item.id) || selected.has(item.id),
  );
  return (
    <Stack
      gap="md"
      pb="md"
      renderRoot={(props) => (
        <form {...props} noValidate onKeyDown={preventSingleLineEnterSubmit} onSubmit={save} />
      )}
    >
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <BilingualContentFields
        busy={busy}
        completionLabels={{
          complete: t.membershipCatalog.complete,
          incomplete: t.membershipCatalog.incomplete,
        }}
        defaultLocale={locale}
        descriptionLabel={t.membershipCatalog.description}
        languageLabels={{ vi: t.common.vietnamese, en: t.common.english }}
        nameLabel={t.membershipCatalog.packageName}
        onChange={(content) => setForm((current) => ({ ...current, content }))}
        title={t.membershipCatalog.displayContent}
        value={form.content}
      />
      <Section title={t.membershipCatalog.packageInformation}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Select
            allowDeselect={false}
            data={[
              { value: "expire", label: t.membershipCatalog.expire },
              { value: "rollover", label: t.membershipCatalog.rollover },
            ]}
            disabled={busy}
            label={t.membershipCatalog.policy}
            onChange={(policy) => {
              if (policy === "expire" || policy === "rollover") {
                setForm((current) => ({ ...current, policy }));
              }
            }}
            required
            value={form.policy}
          />
        </SimpleGrid>
        <Checkbox
          checked={form.isActive}
          disabled={busy}
          label={t.membershipCatalog.active}
          onChange={(event) => {
            const isActive = event.currentTarget.checked;
            setForm((current) => ({ ...current, isActive }));
          }}
        />
      </Section>
      <Section
        title={t.membershipCatalog.priceOptions}
        description={t.membershipCatalog.priceOptionsHelp}
        actions={
          <Button
            variant="default"
            disabled={busy}
            onClick={() =>
              setForm((current) => ({
                ...current,
                priceOptions: [
                  ...current.priceOptions,
                  { durationMonths: "", monthlyPriceVnd: "", isActive: true },
                ],
              }))
            }
            type="button"
          >
            {t.membershipCatalog.addPriceOption}
          </Button>
        }
      >
        {([true, false] as const).map((active) => {
          const options = form.priceOptions
            .map((option, index) => ({ option, index }))
            .filter(({ option }) => option.isActive === active);
          if (!options.length) return null;
          return (
            <Stack gap="sm" key={String(active)}>
              <Title order={3} size="sm">
                {active ? t.membershipCatalog.activeOptions : t.membershipCatalog.inactiveOptions}
              </Title>
              <Stack gap="sm">
                {options.map(({ option, index }) => {
                  const duration = /^\d+$/.test(option.durationMonths)
                    ? BigInt(option.durationMonths)
                    : 0n;
                  const monthly = /^\d+$/.test(option.monthlyPriceVnd)
                    ? BigInt(option.monthlyPriceVnd)
                    : 0n;
                  const total = duration * monthly;
                  const persistedOption = loadedPackage?.price_options.find(
                    (item) => item.id === option.id,
                  );
                  const priceContextSaved =
                    persistedOption &&
                    option.durationMonths === String(persistedOption.duration_months) &&
                    option.monthlyPriceVnd === persistedOption.monthly_price_vnd &&
                    option.isActive === persistedOption.is_active;
                  const durationError = inputErrors.priceOptions[index]?.duration;
                  const monthlyPriceError = inputErrors.priceOptions[index]?.monthlyPrice;
                  const durationErrorId = `price-option-${option.id ?? index}-duration-error`;
                  const monthlyPriceErrorId = `price-option-${option.id ?? index}-monthly-price-error`;
                  const removePriceOptionLabel = t.membershipCatalog.removePriceOption.replace(
                    "{number}",
                    String(index + 1),
                  );
                  return (
                    <fieldset
                      className={`price-option-card ${styles.priceCard}`}
                      disabled={busy}
                      key={option.id ?? index}
                    >
                      <legend>
                        {t.membershipCatalog.priceOptionNumber.replace(
                          "{number}",
                          String(index + 1),
                        )}
                      </legend>
                      <div className={`price-option-grid ${styles.priceGrid}`}>
                        <label className="field price-option-duration-field">
                          <span>{t.membershipCatalog.duration} *</span>
                          <FormInput
                            aria-describedby={durationError ? durationErrorId : undefined}
                            aria-invalid={Boolean(durationError)}
                            className="price-option-duration-input"
                            inputMode="numeric"
                            onChange={(event) =>
                              updatePriceOption(index, {
                                durationMonths: sanitizeIntegerInput(event.target.value),
                              })
                            }
                            type="text"
                            value={option.durationMonths}
                          />
                          {durationError && (
                            <small className="field-error" id={durationErrorId} role="alert">
                              {durationError}
                            </small>
                          )}
                        </label>
                        <label className="field price-option-monthly-price-field">
                          <span>{t.membershipCatalog.monthlyPrice} *</span>
                          <FormInput
                            aria-describedby={monthlyPriceError ? monthlyPriceErrorId : undefined}
                            aria-invalid={Boolean(monthlyPriceError)}
                            className="price-option-monthly-price-input"
                            inputMode="numeric"
                            maxLength={19}
                            onBlur={() => setFocusedPrice(null)}
                            onChange={(event) =>
                              updatePriceOption(index, {
                                monthlyPriceVnd: sanitizeIntegerInput(event.target.value),
                              })
                            }
                            onFocus={() => setFocusedPrice(index)}
                            type="text"
                            value={
                              focusedPrice === index || !option.monthlyPriceVnd
                                ? option.monthlyPriceVnd
                                : formatMembershipMoney(option.monthlyPriceVnd, locale)
                            }
                          />
                          {monthlyPriceError && (
                            <small className="field-error" id={monthlyPriceErrorId} role="alert">
                              {monthlyPriceError}
                            </small>
                          )}
                        </label>
                        <div className="field price-total-preview">
                          <span>{t.membershipCatalog.totalPreview}</span>
                          <output>
                            {total > 0n && total <= MAX_POSITIVE_BIG_INTEGER
                              ? formatMembershipMoney(total.toString(), locale)
                              : "—"}
                          </output>
                        </div>
                        <div className="price-option-active-field">
                          <Checkbox
                            checked={option.isActive}
                            onChange={(event) =>
                              updatePriceOption(index, { isActive: event.target.checked })
                            }
                            label={
                              <>
                                <span>{t.membershipCatalog.active}</span>
                              </>
                            }
                          />
                        </div>
                        <ActionIcon
                          aria-label={removePriceOptionLabel}
                          className="icon-only-action price-option-remove-action"
                          variant="default"
                          disabled={busy || form.priceOptions.length === 1}
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              priceOptions: current.priceOptions.filter(
                                (_, optionIndex) => optionIndex !== index,
                              ),
                            }))
                          }
                          title={removePriceOptionLabel}
                          type="button"
                        >
                          <IconTrash aria-hidden="true" size={18} stroke={1.8} />
                        </ActionIcon>
                      </div>
                      {option.durationMonths === "1" ? (
                        persistedOption?.duration_months === 1 &&
                        persistedOption.payment_plans?.length ? (
                          <div className="price-option-plan-warning" role="status">
                            <p className="field-error">
                              {t.membershipCatalog.paymentPlans.oneMonthLegacyReadOnly}
                            </p>
                            <ul>
                              {persistedOption.payment_plans.map((plan) => (
                                <li key={plan.id}>
                                  {paymentPlanDisplayName(plan, t.membershipCatalog.paymentPlans)} ·{" "}
                                  {plan.is_active
                                    ? t.membershipCatalog.paymentPlans.active
                                    : t.membershipCatalog.paymentPlans.inactive}
                                  {plan.in_use
                                    ? ` · ${t.membershipCatalog.paymentPlans.inUse}`
                                    : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null
                      ) : option.id && persistedOption && priceContextSaved ? (
                        <MembershipPaymentPlanManager
                          key={`${option.id}:${persistedOption.duration_months}:${persistedOption.total_price_vnd}`}
                          option={persistedOption}
                          onReload={reloadPaymentPlans}
                        />
                      ) : duration > 1n ? (
                        <Text c="dimmed" mt="xs" size="sm">
                          {t.membershipCatalog.paymentPlans.savePriceFirst}
                        </Text>
                      ) : null}
                    </fieldset>
                  );
                })}
              </Stack>
            </Stack>
          );
        })}
      </Section>
      <Section title={t.membershipCatalog.packageProducts}>
        {productsLoading ? (
          <DataState compact kind="loading" title={t.membershipCatalog.loadingProducts} />
        ) : productsError ? (
          <RecoveryAlert
            message={productsError}
            onRetry={() => setProductsAttempt((value) => value + 1)}
            retryLabel={t.common.retry}
          />
        ) : productMeta ? (
          <Pagination
            page={productMeta.page}
            total={productMeta.total}
            pageSize={productMeta.page_size}
            onPage={setProductPage}
            disabled={busy}
            previousLabel={t.common.previous}
            nextLabel={t.common.next}
            summary={t.common.pagination}
          />
        ) : null}
        <Stack gap="sm">
          {form.lines.map((line, index) => (
            <Paper key={index} p="sm" withBorder>
              <Grid align="flex-start" gutter="xs">
                <Grid.Col span={{ base: 12, sm: "auto" }}>
                  <Select
                    allowDeselect={false}
                    aria-label={`${t.membershipCatalog.product} ${index + 1}`}
                    data={[
                      { value: "", label: t.membershipCatalog.chooseProduct },
                      ...visibleProducts
                        .filter((item) => !selected.has(item.id) || item.id === line.quotaGroupId)
                        .map((item) => {
                          const translated = localizedCatalogTranslation(item.translations, locale);
                          return { value: item.id, label: translated?.name || item.name };
                        }),
                    ]}
                    disabled={busy || productsLoading || Boolean(productsError)}
                    label={t.membershipCatalog.product}
                    onChange={(selectedValue) =>
                      updateLine(index, { quotaGroupId: selectedValue ?? "" })
                    }
                    required
                    role="combobox"
                    value={line.quotaGroupId}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <TextInput
                    aria-label={`${t.membershipCatalog.quotaUnits} ${index + 1}`}
                    disabled={busy}
                    error={
                      inputErrors.quotaUnits[index] && (
                        <span role="alert">{inputErrors.quotaUnits[index]}</span>
                      )
                    }
                    inputMode="numeric"
                    label={t.membershipCatalog.quotaUnits}
                    onChange={(event) => {
                      updateLine(index, {
                        quotaUnits: sanitizeIntegerInput(event.currentTarget.value),
                      });
                      setInputErrors((current) => ({
                        ...current,
                        quotaUnits: { ...current.quotaUnits, [index]: "" },
                      }));
                    }}
                    required
                    value={line.quotaUnits}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: "content" }}>
                  <Button
                    variant="default"
                    disabled={busy || form.lines.length === 1}
                    mt={{ base: 0, sm: 21 }}
                    onClick={() =>
                      setForm((value) => ({
                        ...value,
                        lines: value.lines.filter((_, lineIndex) => lineIndex !== index),
                      }))
                    }
                    type="button"
                  >
                    {t.membershipCatalog.removeProduct}
                  </Button>
                </Grid.Col>
              </Grid>
            </Paper>
          ))}
        </Stack>
        <Button
          variant="default"
          w="fit-content"
          disabled={busy || productsLoading || Boolean(productsError)}
          onClick={() =>
            setForm((value) => ({
              ...value,
              lines: [...value.lines, { quotaGroupId: "", quotaUnits: "1" }],
            }))
          }
          type="button"
        >
          {t.membershipCatalog.addProductLine}
        </Button>
      </Section>
      <EditorActions
        busy={busy}
        onCancel={() => router.push(catalogHref("packages", listContext, packageId))}
      />
    </Stack>
  );
}
