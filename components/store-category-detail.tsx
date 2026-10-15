"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { useToast } from "@/components/toast-provider";
import { deleteStoreCategory, getStoreCategory, saveStoreCategory } from "@/lib/commerce-api";
import { requestErrorMessage } from "@/lib/client-error";
import { categoryName } from "@/lib/store-categories";
import type { StoreCategory } from "@/lib/types";

export function StoreCategoryDetail({ categoryId }: { categoryId: string }) {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState<StoreCategory | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    getStoreCategory(categoryId)
      .then((result) => {
        if (!cancelled) {
          setItem(result);
          setError("");
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(requestErrorMessage(caught, t));
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, retry, t]);

  async function remove() {
    setBusy(true);
    setDialogError("");
    try {
      await deleteStoreCategory(categoryId);
      toast(copy.deleted);
      router.replace("/store-catalog/categories");
    } catch (caught) {
      const failure = caught as { status?: number };
      setDialogError(
        failure.status === 409 ? copy.protectedDelete : requestErrorMessage(caught, t),
      );
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!item) return;
    setBusy(true);
    try {
      const updated = await saveStoreCategory(
        {
          slug: item.slug,
          parent_id: item.parent_id,
          sort_order: item.sort_order,
          is_active: false,
          translations: item.translations,
        },
        item.id,
      );
      setItem(updated);
      setDialog(false);
      toast(copy.success);
    } catch (caught) {
      setDialogError(requestErrorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <div className="panel">
        <p role="alert" className="error-box">
          {error}
        </p>
        <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>
          {t.common.retry}
        </button>
      </div>
    );
  if (!item) return <p role="status">{copy.loading}</p>;
  return (
    <>
      <DetailPageHeading
        backHref="/store-catalog/categories"
        backLabel={copy.categories}
        title={categoryName(item, locale)}
        description={`/${item.slug}`}
      />
      <div className="panel">
        <p>
          <span className={`badge ${item.is_active ? "" : "warm"}`}>
            {item.is_active ? copy.active : copy.inactive}
          </span>
        </p>
        <p>
          {copy.level.replace("{level}", String(item.depth))} · {copy.order}: {item.sort_order}
        </p>
        <p>
          {item.product_count} {copy.products}
        </p>
        {item.translations.map((translation) => (
          <section key={translation.locale}>
            <h2>
              {translation.locale.toUpperCase()}: {translation.name}
            </h2>
            <p>{translation.description}</p>
          </section>
        ))}
        <div className="catalog-editor-actions">
          <Link className="button" href={`/store-catalog/categories/${item.id}/edit`}>
            {copy.edit}
          </Link>
          <button className="button danger" onClick={() => setDialog(true)} type="button">
            {copy.delete}
          </button>
        </div>
      </div>
      {dialog && (
        <ConfirmationDialog
          title={copy.delete}
          busy={busy}
          busyLabel={copy.saving}
          cancelLabel={copy.cancel}
          confirmLabel={copy.delete}
          danger
          error={dialogError}
          onCancel={() => {
            setDialog(false);
            setDialogError("");
          }}
          onConfirm={remove}
          alternateLabel={item.is_active ? copy.deactivate : undefined}
          onAlternate={deactivate}
        >
          <p>{copy.confirmDelete}</p>
        </ConfirmationDialog>
      )}
    </>
  );
}
