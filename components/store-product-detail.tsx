"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { useToast } from "@/components/toast-provider";
import { deleteStoreProduct, getStoreProduct, saveStoreProduct } from "@/lib/commerce-api";
import { requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import { localizedCatalogTranslation } from "@/lib/membership-translations";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { StoreProduct } from "@/lib/types";

export function StoreProductDetail({ productId }: { productId: string }) {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState<StoreProduct | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError("");
    getStoreProduct(productId)
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
  }, [productId, retry, t]);
  async function remove() {
    setBusy(true);
    try {
      await deleteStoreProduct(productId);
      toast(copy.deleted);
      router.replace("/store-catalog/products");
    } catch (caught) {
      setDialogError(
        (caught as { status?: number }).status === 409
          ? copy.protectedDelete
          : requestErrorMessage(caught, t),
      );
    } finally {
      setBusy(false);
    }
  }
  async function deactivate() {
    if (!item) return;
    setBusy(true);
    try {
      const updated = await saveStoreProduct(
        {
          sku: item.sku,
          slug: item.slug,
          category_id: item.category_id,
          unit_size: item.unit_size,
          unit_label_vi: item.unit_label_vi,
          unit_label_en: item.unit_label_en,
          retail_price_vnd: String(item.retail_price_vnd),
          csa_quota_group_id: item.csa_quota_group_id,
          csa_quota_cost: item.csa_quota_cost,
          primary_image_id: item.primary_image_id,
          is_active: false,
          is_published: false,
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
        <p className="error-box" role="alert">
          {error}
        </p>
        <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>
          {t.common.retry}
        </button>
      </div>
    );
  if (!item) return <p role="status">{copy.loading}</p>;
  const name =
    item.translations.find((value) => value.locale === locale)?.name ||
    item.translations[0]?.name ||
    item.sku;
  return (
    <>
      <DetailPageHeading
        backHref="/store-catalog/products"
        backLabel={copy.products}
        title={name}
        description={`${item.sku} · /${item.slug}`}
      />
      <div className="panel store-product-detail">
        <div>
          {item.primary_image && (
            <Image
              alt={name}
              src={mediaUrlForWidth(item.primary_image, 640)}
              width={320}
              height={220}
              unoptimized
            />
          )}
        </div>
        <div>
          <p>
            <span className={`badge ${item.is_published ? "" : "warm"}`}>
              {item.is_published ? copy.published : copy.draft}
            </span>{" "}
            {!item.is_active && <span className="badge warm">{copy.inactive}</span>}
          </p>
          <p>
            {copy.category}: {item.category_slug}
          </p>
          <p>
            {copy.unitSize}: {formatDecimalInput(item.unit_size)}{" "}
            {locale === "vi" ? item.unit_label_vi : item.unit_label_en}
          </p>
          <p>
            {copy.price}:{" "}
            {new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(
              BigInt(item.retail_price_vnd),
            )}{" "}
            ₫
          </p>
          <p>
            {copy.saleType}: {item.csa_quota_group ? copy.csaSaleOption : copy.retailOnly}
          </p>
          {item.csa_quota_group && (
            <>
              <p>
                {copy.quotaGroup}:{" "}
                {localizedCatalogTranslation(item.csa_quota_group.translations, locale)?.name ||
                  item.csa_quota_group.name}
              </p>
              <p>
                {copy.quotaCost}: {item.csa_quota_cost}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="panel">
        {item.translations.map((value) => (
          <section key={value.locale}>
            <h2>
              {value.locale.toUpperCase()}: {value.name}
            </h2>
            <p>{value.short_description}</p>
            <p>{value.description}</p>
          </section>
        ))}
        <div className="catalog-editor-actions">
          <Link className="button" href={`/store-catalog/products/${item.id}/edit`}>
            {copy.edit}
          </Link>
          <button className="button danger" onClick={() => setDialog(true)}>
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
