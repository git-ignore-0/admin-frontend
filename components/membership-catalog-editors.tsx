"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import {
  MAX_MEMBERSHIP_PRICE,
  MAX_UNIT_SIZE,
  numericInputErrorMessage,
  parsePositiveDecimal,
  parsePositiveInteger,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";
import type { MembershipPackage, MembershipProduct, PaginationMeta } from "@/lib/types";

type ProductOption = Pick<MembershipProduct, "id" | "name" | "is_active">;

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

function LoadFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useAdminI18n();
  return (
    <div className="panel load-error-state">
      <p className="error-box" role="alert">{requestErrorMessage(error, t)}</p>
      <button className="button secondary" onClick={retry} type="button">{t.common.retry}</button>
    </div>
  );
}

type ProductForm = {
  name: string;
  description: string;
  unitSize: string;
  unitVi: string;
  unitEn: string;
  isActive: boolean;
};

const emptyProduct: ProductForm = {
  name: "",
  description: "",
  unitSize: "",
  unitVi: "",
  unitEn: "",
  isActive: true,
};

function productForm(item: MembershipProduct): ProductForm {
  return {
    name: item.name,
    description: item.short_description,
    unitSize: item.unit_size,
    unitVi: item.unit_label_vi,
    unitEn: item.unit_label_en,
    isActive: item.is_active,
  };
}

export function MembershipProductEditor({ productId }: { productId?: string }) {
  const { t } = useAdminI18n();
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
            name: form.name.trim(),
            short_description: form.description.trim(),
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
      setError(requestErrorMessage(caught, t));
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
    <form className="panel catalog-editor form-grid" noValidate onSubmit={save}>
      {error && <p className="error-box full" role="alert">{error}</p>}
      <p className="catalog-help full">{t.membershipCatalog.unitHelp}</p>
      <label className="field">
        <span>{t.membershipCatalog.name} *</span>
        <input className="input" disabled={busy} maxLength={200} onChange={(event) => update("name", event.target.value)} required value={form.name} />
      </label>
      <label className="field full">
        <span>{t.membershipCatalog.shortDescription}</span>
        <textarea className="textarea" disabled={busy} maxLength={800} onChange={(event) => update("description", event.target.value)} value={form.description} />
      </label>
      <label className="field">
        <span>{t.membershipCatalog.unitSize} *</span>
        <input aria-invalid={Boolean(unitSizeError)} className="input" disabled={busy} inputMode="decimal" onChange={(event) => { update("unitSize", sanitizeDecimalInput(event.target.value)); setUnitSizeError(""); }} required type="text" value={form.unitSize} />
        {unitSizeError && <small className="field-error" role="alert">{unitSizeError}</small>}
      </label>
      <label className="field">
        <span>{t.membershipCatalog.unitVi} *</span>
        <input className="input" disabled={busy} maxLength={40} onChange={(event) => update("unitVi", event.target.value)} required value={form.unitVi} />
      </label>
      <label className="field">
        <span>{t.membershipCatalog.unitEn} *</span>
        <input className="input" disabled={busy} maxLength={40} onChange={(event) => update("unitEn", event.target.value)} required value={form.unitEn} />
      </label>
      <label className="checkbox field">
        <input checked={form.isActive} disabled={busy} onChange={(event) => update("isActive", event.target.checked)} type="checkbox" />
        <span>{t.membershipCatalog.active}</span>
      </label>
      <EditorActions busy={busy} onCancel={() => router.push(productId ? `/membership-catalog/products/${productId}` : "/membership-catalog/products")} />
    </form>
  );
}

type PackageLine = { productId: string; quotaUnits: string };
type PackageForm = {
  name: string;
  description: string;
  price: string;
  months: string;
  policy: "expire" | "rollover";
  isActive: boolean;
  lines: PackageLine[];
};

const emptyPackage: PackageForm = {
  name: "",
  description: "",
  price: "",
  months: "6",
  policy: "expire",
  isActive: true,
  lines: [{ productId: "", quotaUnits: "1" }],
};

function packageForm(item: MembershipPackage): PackageForm {
  return {
    name: item.name,
    description: item.description,
    price: item.upfront_price,
    months: String(item.duration_months),
    policy: item.quota_policy,
    isActive: item.is_active,
    lines: item.items.map((line) => ({ productId: line.product_id, quotaUnits: String(line.quota_units) })),
  };
}

type PackageInputErrors = { price?: string; months?: string; quotaUnits: Record<number, string> };

export function MembershipPackageEditor({ packageId }: { packageId?: string }) {
  const { t } = useAdminI18n();
  const toast = useToast();
  const router = useRouter();
  const savingRef = useRef(false);
  const [form, setForm] = useState<PackageForm>(structuredClone(emptyPackage));
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [visibleProductIds, setVisibleProductIds] = useState<Set<string>>(new Set());
  const [productMeta, setProductMeta] = useState<PaginationMeta | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [productSearchInput, setProductSearchInput] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [productsAttempt, setProductsAttempt] = useState(0);
  const [loaded, setLoaded] = useState(!packageId);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inputErrors, setInputErrors] = useState<PackageInputErrors>({ quotaUnits: {} });

  useEffect(() => {
    if (!packageId) return;
    setLoaded(false);
    setLoadError(null);
    api<MembershipPackage>(`admin/membership-packages/${packageId}`)
      .then((item) => {
        setForm(packageForm(item));
        setProducts((current) =>
          mergeProductOptions(
            current,
            item.items.map((line) => ({
              id: line.product_id,
              name: line.product_name,
              is_active: true,
            })),
          ),
        );
        setLoaded(true);
      })
      .catch(setLoadError);
  }, [loadAttempt, packageId]);

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    setProductsError("");
    const query = new URLSearchParams({
      page: String(productPage),
      active: "true",
    });
    if (productSearch) query.set("search", productSearch);
    apiEnvelope<MembershipProduct[], PaginationMeta>(
      `admin/membership-products?${query.toString()}`,
    )
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
  }, [productPage, productSearch, productsAttempt, t]);

  function updateLine(index: number, patch: Partial<PackageLine>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const parsedPrice = parsePositiveInteger(form.price, { max: MAX_MEMBERSHIP_PRICE });
    const parsedMonths = parsePositiveInteger(form.months, { max: 120 });
    const quotaUnits: number[] = [];
    const quotaErrors: Record<number, string> = {};
    form.lines.forEach((line, index) => {
      const parsed = parsePositiveInteger(line.quotaUnits);
      if (parsed.error) quotaErrors[index] = numericInputErrorMessage(parsed.error, t.common.numericInput);
      else quotaUnits[index] = parsed.value;
    });
    const nextErrors: PackageInputErrors = {
      price: parsedPrice.error ? numericInputErrorMessage(parsedPrice.error, t.common.numericInput, MAX_MEMBERSHIP_PRICE) : undefined,
      months: parsedMonths.error ? numericInputErrorMessage(parsedMonths.error, t.common.numericInput, 120) : undefined,
      quotaUnits: quotaErrors,
    };
    setInputErrors(nextErrors);
    if (nextErrors.price || nextErrors.months || Object.keys(quotaErrors).length) return;
    const productIds = form.lines.map((line) => line.productId);
    if (productIds.some((id) => !id) || new Set(productIds).size !== productIds.length) {
      setError(t.membershipCatalog.uniqueProducts);
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
            name: form.name.trim(),
            description: form.description.trim(),
            upfront_price: parsedPrice.value,
            duration_months: parsedMonths.value,
            quota_policy: form.policy,
            is_active: form.isActive,
            items: form.lines.map((line, index) => ({ product_id: line.productId, quota_units: quotaUnits[index] })),
          }),
        },
      );
      toast(packageId ? t.membershipCatalog.updated : t.membershipCatalog.created);
      navigating = true;
      router.replace(`/membership-catalog/packages/${item.id}`);
    } catch (caught) {
      setError(requestErrorMessage(caught, t));
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

  const selected = new Set(form.lines.map((line) => line.productId).filter(Boolean));
  const visibleProducts = products.filter(
    (item) => visibleProductIds.has(item.id) || selected.has(item.id),
  );
  return (
    <form className="panel catalog-editor package-editor" noValidate onSubmit={save}>
      {error && <p className="error-box" role="alert">{error}</p>}
      <div className="form-grid">
        <label className="field"><span>{t.membershipCatalog.name} *</span><input className="input" disabled={busy} maxLength={200} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} required value={form.name} /></label>
        <label className="field"><span>{t.membershipCatalog.upfrontPrice} *</span><input aria-invalid={Boolean(inputErrors.price)} className="input" disabled={busy} inputMode="numeric" onChange={(event) => { setForm((value) => ({ ...value, price: sanitizeIntegerInput(event.target.value) })); setInputErrors((current) => ({ ...current, price: undefined })); }} required type="text" value={form.price} />{inputErrors.price && <small className="field-error" role="alert">{inputErrors.price}</small>}</label>
        <label className="field full"><span>{t.membershipCatalog.description}</span><textarea className="textarea" disabled={busy} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} value={form.description} /></label>
        <label className="field"><span>{t.membershipCatalog.duration} *</span><input aria-invalid={Boolean(inputErrors.months)} className="input" disabled={busy} inputMode="numeric" onChange={(event) => { setForm((value) => ({ ...value, months: sanitizeIntegerInput(event.target.value) })); setInputErrors((current) => ({ ...current, months: undefined })); }} required type="text" value={form.months} />{inputErrors.months && <small className="field-error" role="alert">{inputErrors.months}</small>}</label>
        <label className="field"><span>{t.membershipCatalog.policy} *</span><select className="input" disabled={busy} onChange={(event) => setForm((value) => ({ ...value, policy: event.target.value as PackageForm["policy"] }))} value={form.policy}><option value="expire">{t.membershipCatalog.expire}</option><option value="rollover">{t.membershipCatalog.rollover}</option></select></label>
        <label className="checkbox field full"><input checked={form.isActive} disabled={busy} onChange={(event) => setForm((value) => ({ ...value, isActive: event.target.checked }))} type="checkbox" /><span>{t.membershipCatalog.active}</span></label>
      </div>
      <section className="package-product-lookup" aria-label={t.membershipCatalog.productLookup}>
        <div className="package-product-search">
          <label className="field">
            <span>{t.membershipCatalog.productSearch}</span>
            <input
              className="input"
              disabled={busy || productsLoading}
              onChange={(event) => setProductSearchInput(event.target.value)}
              type="search"
              value={productSearchInput}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || productsLoading}
            onClick={() => {
              setProductPage(1);
              setProductSearch(productSearchInput.trim());
            }}
            type="button"
          >
            {t.membershipCatalog.searchProducts}
          </button>
        </div>
        {productsLoading ? (
          <p className="muted-copy" aria-live="polite">{t.membershipCatalog.loadingProducts}</p>
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
        ) : productMeta ? (
          <div className="package-product-pagination">
            <button
              className="button secondary"
              disabled={busy || productMeta.page <= 1}
              onClick={() => setProductPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              {t.common.previous}
            </button>
            <span>{t.common.pagination.replace("{page}", String(productMeta.page)).replace("{pages}", String(Math.max(1, Math.ceil(productMeta.total / productMeta.page_size))))}</span>
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
      </section>
      <div className="package-lines">
        <h3>{t.membershipCatalog.packageProducts}</h3>
        {form.lines.map((line, index) => (
          <div className="package-line" key={index}>
            <label className="field"><span>{t.membershipCatalog.product} *</span><select aria-label={`${t.membershipCatalog.product} ${index + 1}`} className="input" disabled={busy || productsLoading || Boolean(productsError)} onChange={(event) => updateLine(index, { productId: event.target.value })} required value={line.productId}><option value="">{t.membershipCatalog.chooseProduct}</option>{visibleProducts.filter((item) => !selected.has(item.id) || item.id === line.productId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="field"><span>{t.membershipCatalog.quotaUnits} *</span><input aria-label={`${t.membershipCatalog.quotaUnits} ${index + 1}`} aria-invalid={Boolean(inputErrors.quotaUnits[index])} className="input" disabled={busy} inputMode="numeric" onChange={(event) => { updateLine(index, { quotaUnits: sanitizeIntegerInput(event.target.value) }); setInputErrors((current) => ({ ...current, quotaUnits: { ...current.quotaUnits, [index]: "" } })); }} required type="text" value={line.quotaUnits} />{inputErrors.quotaUnits[index] && <small className="field-error" role="alert">{inputErrors.quotaUnits[index]}</small>}</label>
            <button className="button secondary" disabled={busy || form.lines.length === 1} onClick={() => setForm((value) => ({ ...value, lines: value.lines.filter((_, lineIndex) => lineIndex !== index) }))} type="button">{t.membershipCatalog.removeProduct}</button>
          </div>
        ))}
      </div>
      <button className="button secondary" disabled={busy || productsLoading || Boolean(productsError)} onClick={() => setForm((value) => ({ ...value, lines: [...value.lines, { productId: "", quotaUnits: "1" }] }))} type="button">{t.membershipCatalog.addProductLine}</button>
      <EditorActions busy={busy} onCancel={() => router.push(packageId ? `/membership-catalog/packages/${packageId}` : "/membership-catalog/packages")} />
    </form>
  );
}
