"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import {
  BilingualContentFields,
  emptyBilingualContent,
} from "@/components/bilingual-content-fields";
import { useToast } from "@/components/toast-provider";
import { getStoreCategory, listStoreCategories, saveStoreCategory } from "@/lib/commerce-api";
import { requestErrorMessage } from "@/lib/client-error";
import { categoryDescendantIds, categoryName, categoryTreeRows } from "@/lib/store-categories";
import type { StoreCategory } from "@/lib/types";

export function StoreCategoryEditor({ categoryId }: { categoryId?: string }) {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const toast = useToast();
  const router = useRouter();
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [all, setAll] = useState<StoreCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [parentId, setParentId] = useState("");
  const [order, setOrder] = useState("0");
  const [active, setActive] = useState(false);
  const [content, setContent] = useState(emptyBilingualContent());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError("");
    Promise.all([
      listStoreCategories(),
      categoryId ? getStoreCategory(categoryId) : Promise.resolve(null),
    ])
      .then(([categories, item]) => {
        if (cancelled) return;
        setAll(categories);
        if (item) {
          setParentId(item.parent_id ?? "");
          setOrder(String(item.sort_order));
          setActive(item.is_active);
          const next = emptyBilingualContent();
          for (const translation of item.translations)
            next[translation.locale] = {
              name: translation.name,
              description: translation.description,
            };
          setContent(next);
        }
        setLoaded(true);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(requestErrorMessage(caught, t));
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, retry, t]);

  function fail(message: string, field?: string) {
    setError(message);
    requestAnimationFrame(() => {
      const input = field ? formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`) : null;
      (input ?? errorRef.current)?.focus();
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const translations = (["vi", "en"] as const).flatMap((language) => {
      const value = content[language];
      return value.name.trim()
        ? [{ locale: language, name: value.name.trim(), description: value.description.trim() }]
        : [];
    });
    if (!categoryId && translations.length === 0) return fail(copy.nameRequiredForUrl);
    if (!/^\d+$/.test(order) || Number(order) > 2_147_483_647)
      return fail(copy.invalidForm, "sort_order");
    if (
      (["vi", "en"] as const).some(
        (language) => content[language].description.trim() && !content[language].name.trim(),
      )
    )
      return fail(copy.invalidForm);
    if (active && translations.length !== 2) return fail(copy.translationsRequired);
    savingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const item = await saveStoreCategory(
        {
          parent_id: parentId || null,
          sort_order: Number(order),
          is_active: active,
          translations,
        },
        categoryId,
      );
      toast(copy.success);
      router.replace(`/store-catalog/categories/${item.id}`);
    } catch (caught) {
      const field = (caught as { field?: string }).field;
      fail(
        requestErrorMessage(caught, t, {
          parent_id: copy.parent,
          sort_order: copy.order,
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
        <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>
          {t.common.retry}
        </button>
      </div>
    );
  if (!loaded) return <p role="status">{copy.loading}</p>;
  const excluded = categoryId ? categoryDescendantIds(all, categoryId) : new Set<string>();
  const parents = categoryTreeRows(all).filter(
    ({ category, depth }) =>
      (category.is_active || category.id === parentId) &&
      !category.product_count &&
      depth < 3 &&
      !excluded.has(category.id),
  );
  return (
    <form className="catalog-editor" noValidate onSubmit={submit} ref={formRef}>
      {error && (
        <p className="error-box" ref={errorRef} role="alert" tabIndex={-1}>
          {error}
        </p>
      )}
      <BilingualContentFields
        busy={busy}
        completionLabels={{ complete: copy.complete, incomplete: copy.incomplete }}
        defaultLocale={locale}
        descriptionLabel={copy.descriptionLabel}
        descriptionMaxLength={10000}
        languageLabels={{ vi: t.common.vietnamese, en: t.common.english }}
        nameLabel={copy.categoryName}
        onChange={setContent}
        requireNames={active}
        title={copy.translationSection}
        value={content}
      />
      <section className="catalog-editor-section">
        <h2>{copy.category}</h2>
        <div className="form-grid">
          <label className="field">
            <span>{copy.parent}</span>
            <select
              className="input"
              disabled={busy}
              name="parent_id"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">{copy.root}</option>
              {parents.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {"— ".repeat(depth - 1)}
                  {categoryName(category, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{copy.order}</span>
            <input
              className="input"
              disabled={busy}
              inputMode="numeric"
              name="sort_order"
              value={order}
              onChange={(event) => setOrder(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{copy.status}</span>
            <select
              className="input"
              disabled={busy}
              value={active ? "active" : "inactive"}
              onChange={(event) => setActive(event.target.value === "active")}
            >
              <option value="inactive">{copy.inactive}</option>
              <option value="active">{copy.active}</option>
            </select>
          </label>
        </div>
      </section>
      <div className="catalog-editor-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => router.back()}
          type="button"
        >
          {copy.cancel}
        </button>
        <button className="button" disabled={busy} type="submit">
          {busy ? copy.saving : copy.save}
        </button>
      </div>
    </form>
  );
}
