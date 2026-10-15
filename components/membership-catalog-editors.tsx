"use client";

import { useRouter } from "next/navigation";
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
import { localizedCatalogTranslation } from "@/lib/membership-translations";
import {
  MAX_POSITIVE_BIG_INTEGER,
  MAX_UNIT_SIZE,
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
    <div className="catalog-editor-actions">
      <button className="button secondary" disabled={busy} onClick={onCancel} type="button">
        {t.membershipCatalog.cancel}
      </button>
      <button className="button" disabled={busy} type="submit">
        {busy ? t.membershipCatalog.saving : t.membershipCatalog.save}
      </button>
    </div>
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
    <div className="panel load-error-state">
      <p className="error-box" role="alert">
        {requestErrorMessage(error, t)}
      </p>
      <button className="button secondary" onClick={retry} type="button">
        {t.common.retry}
      </button>
    </div>
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
    unitSize: item.unit_size,
    unitVi: item.unit_label_vi,
    unitEn: item.unit_label_en,
    isActive: item.is_active,
  };
}

export function MembershipProductEditor({ productId }: { productId?: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const router = useRouter();
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
      router.replace(`/membership-catalog/products/${item.id}`);
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
  if (!loaded) return <div className="panel">{t.membershipCatalog.loadingProduct}</div>;

  return (
    <form className="catalog-editor" noValidate onSubmit={save}>
      {error && (
        <p className="error-box full" role="alert">
          {error}
        </p>
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
      <section className="catalog-editor-section">
        <h2>{t.membershipCatalog.unitsAndStatus}</h2>
        <p className="catalog-section-help">{t.membershipCatalog.unitHelp}</p>
        <div className="form-grid">
          <label className="field">
            <span>{t.membershipCatalog.unitSize} *</span>
            <input
              aria-invalid={Boolean(unitSizeError)}
              className="input"
              disabled={busy}
              inputMode="decimal"
              onChange={(event) => {
                update("unitSize", sanitizeDecimalInput(event.target.value));
                setUnitSizeError("");
              }}
              required
              type="text"
              value={form.unitSize}
            />
            {unitSizeError && (
              <small className="field-error" role="alert">
                {unitSizeError}
              </small>
            )}
          </label>
          <label className="field">
            <span>{t.membershipCatalog.unitVi} *</span>
            <input
              className="input"
              disabled={busy}
              maxLength={40}
              onChange={(event) => update("unitVi", event.target.value)}
              required
              value={form.unitVi}
            />
          </label>
          <label className="field">
            <span>{t.membershipCatalog.unitEn} *</span>
            <input
              className="input"
              disabled={busy}
              maxLength={40}
              onChange={(event) => update("unitEn", event.target.value)}
              required
              value={form.unitEn}
            />
          </label>
          <label className="checkbox field">
            <input
              checked={form.isActive}
              disabled={busy}
              onChange={(event) => update("isActive", event.target.checked)}
              type="checkbox"
            />
            <span>{t.membershipCatalog.active}</span>
          </label>
        </div>
      </section>
      <EditorActions
        busy={busy}
        onCancel={() =>
          router.push(
            productId
              ? `/membership-catalog/products/${productId}`
              : "/membership-catalog/products",
          )
        }
      />
    </form>
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
      router.replace(`/membership-catalog/packages/${item.id}`);
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
  if (!loaded) return <div className="panel">{t.membershipCatalog.loadingPackage}</div>;

  const selected = new Set(form.lines.map((line) => line.quotaGroupId).filter(Boolean));
  const visibleProducts = products.filter(
    (item) => visibleProductIds.has(item.id) || selected.has(item.id),
  );
  return (
    <form
      className="catalog-editor package-editor"
      noValidate
      onKeyDown={preventSingleLineEnterSubmit}
      onSubmit={save}
    >
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
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
      <section className="catalog-editor-section">
        <h2>{t.membershipCatalog.packageInformation}</h2>
        <div className="form-grid">
          <label className="field">
            <span>{t.membershipCatalog.policy} *</span>
            <select
              className="input"
              disabled={busy}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  policy: event.target.value as PackageForm["policy"],
                }))
              }
              value={form.policy}
            >
              <option value="expire">{t.membershipCatalog.expire}</option>
              <option value="rollover">{t.membershipCatalog.rollover}</option>
            </select>
          </label>
          <label className="checkbox field">
            <input
              checked={form.isActive}
              disabled={busy}
              onChange={(event) =>
                setForm((value) => ({ ...value, isActive: event.target.checked }))
              }
              type="checkbox"
            />
            <span>{t.membershipCatalog.active}</span>
          </label>
        </div>
      </section>
      <section className="catalog-editor-section price-options-section">
        <div className="panel-head">
          <div>
            <h2>{t.membershipCatalog.priceOptions}</h2>
            <p className="catalog-section-help">{t.membershipCatalog.priceOptionsHelp}</p>
          </div>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              setForm((current) => ({
                ...current,
                priceOptions: [
                  ...current.priceOptions,
                  {
                    durationMonths: "",
                    monthlyPriceVnd: "",
                    isActive: true,
                  },
                ],
              }))
            }
            type="button"
          >
            {t.membershipCatalog.addPriceOption}
          </button>
        </div>
        {([true, false] as const).map((active) => {
          const options = form.priceOptions
            .map((option, index) => ({ option, index }))
            .filter(({ option }) => option.isActive === active);
          if (!options.length) return null;
          return (
            <div className="price-option-group" key={String(active)}>
              <h3>
                {active ? t.membershipCatalog.activeOptions : t.membershipCatalog.inactiveOptions}
              </h3>
              <div className="price-option-list">
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
                      className="price-option-card"
                      disabled={busy}
                      key={option.id ?? index}
                    >
                      <legend>
                        {t.membershipCatalog.priceOptionNumber.replace(
                          "{number}",
                          String(index + 1),
                        )}
                      </legend>
                      <div className="price-option-grid">
                        <label className="field price-option-duration-field">
                          <span>{t.membershipCatalog.duration} *</span>
                          <input
                            aria-describedby={durationError ? durationErrorId : undefined}
                            aria-invalid={Boolean(durationError)}
                            className="input price-option-duration-input"
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
                          <input
                            aria-describedby={monthlyPriceError ? monthlyPriceErrorId : undefined}
                            aria-invalid={Boolean(monthlyPriceError)}
                            className="input price-option-monthly-price-input"
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
                        <label className="checkbox price-option-active-field">
                          <input
                            checked={option.isActive}
                            onChange={(event) =>
                              updatePriceOption(index, { isActive: event.target.checked })
                            }
                            type="checkbox"
                          />
                          <span>{t.membershipCatalog.active}</span>
                        </label>
                        <button
                          aria-label={removePriceOptionLabel}
                          className="button secondary icon-only-action price-option-remove-action"
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
                        <p className="catalog-section-help">
                          {t.membershipCatalog.paymentPlans.savePriceFirst}
                        </p>
                      ) : null}
                    </fieldset>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
      <section className="catalog-editor-section package-products-section">
        <h2>{t.membershipCatalog.packageProducts}</h2>
        {productsLoading ? (
          <p className="muted-copy" aria-live="polite">
            {t.membershipCatalog.loadingProducts}
          </p>
        ) : productsError ? (
          <div className="error-box retry-error" role="alert">
            <span>{productsError}</span>
            <button
              className="button secondary"
              onClick={() => setProductsAttempt((value) => value + 1)}
              type="button"
            >
              {t.common.retry}
            </button>
          </div>
        ) : productMeta && productMeta.total > productMeta.page_size ? (
          <div className="package-product-pagination">
            <button
              className="button secondary"
              disabled={busy || productMeta.page <= 1}
              onClick={() => setProductPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              {t.common.previous}
            </button>
            <span>
              {t.common.pagination
                .replace("{page}", String(productMeta.page))
                .replace(
                  "{pages}",
                  String(Math.max(1, Math.ceil(productMeta.total / productMeta.page_size))),
                )}
            </span>
            <button
              className="button secondary"
              disabled={busy || productMeta.page * productMeta.page_size >= productMeta.total}
              onClick={() => setProductPage((value) => value + 1)}
              type="button"
            >
              {t.common.next}
            </button>
          </div>
        ) : null}
        <div className="package-lines">
          {form.lines.map((line, index) => (
            <div className="package-line" key={index}>
              <label className="field">
                <span>{t.membershipCatalog.product} *</span>
                <select
                  aria-label={`${t.membershipCatalog.product} ${index + 1}`}
                  className="input"
                  disabled={busy || productsLoading || Boolean(productsError)}
                  onChange={(event) => updateLine(index, { quotaGroupId: event.target.value })}
                  required
                  value={line.quotaGroupId}
                >
                  <option value="">{t.membershipCatalog.chooseProduct}</option>
                  {visibleProducts
                    .filter((item) => !selected.has(item.id) || item.id === line.quotaGroupId)
                    .map((item) => {
                      const translated = localizedCatalogTranslation(item.translations, locale);
                      return (
                        <option key={item.id} value={item.id}>
                          {translated?.name || item.name}
                        </option>
                      );
                    })}
                </select>
              </label>
              <label className="field">
                <span>{t.membershipCatalog.quotaUnits} *</span>
                <input
                  aria-label={`${t.membershipCatalog.quotaUnits} ${index + 1}`}
                  aria-invalid={Boolean(inputErrors.quotaUnits[index])}
                  className="input"
                  disabled={busy}
                  inputMode="numeric"
                  onChange={(event) => {
                    updateLine(index, { quotaUnits: sanitizeIntegerInput(event.target.value) });
                    setInputErrors((current) => ({
                      ...current,
                      quotaUnits: { ...current.quotaUnits, [index]: "" },
                    }));
                  }}
                  required
                  type="text"
                  value={line.quotaUnits}
                />
                {inputErrors.quotaUnits[index] && (
                  <small className="field-error" role="alert">
                    {inputErrors.quotaUnits[index]}
                  </small>
                )}
              </label>
              <button
                className="button secondary"
                disabled={busy || form.lines.length === 1}
                onClick={() =>
                  setForm((value) => ({
                    ...value,
                    lines: value.lines.filter((_, lineIndex) => lineIndex !== index),
                  }))
                }
                type="button"
              >
                {t.membershipCatalog.removeProduct}
              </button>
            </div>
          ))}
        </div>
        <button
          className="button secondary add-product-line"
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
        </button>
      </section>
      <EditorActions
        busy={busy}
        onCancel={() =>
          router.push(
            packageId
              ? `/membership-catalog/packages/${packageId}`
              : "/membership-catalog/packages",
          )
        }
      />
    </form>
  );
}
