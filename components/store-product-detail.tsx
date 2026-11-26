"use client";
import { DataState } from "@/components/nfv-controls";
import { Group, Button } from "@mantine/core";

import { ProductLifecycleStatus, ProductLockReasons } from "@/components/product-lifecycle-status";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { LazyRichTextEditor } from "@/components/lazy-rich-text-editor";
import { descriptionDocument } from "@/lib/store-product-description";
import { useToast } from "@/components/toast-provider";
import { deleteStoreProduct, getStoreProduct, transitionStoreProduct } from "@/lib/commerce-api";
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
  const [dialog, setDialog] = useState<"delete" | "transition" | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
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
  const target = item?.status === "active" ? "discontinued" : "active";
  const transitionLabel =
    item?.status === "active"
      ? copy.discontinued
      : item?.status === "discontinued"
        ? copy.resumeSelling
        : copy.startSelling;

  async function confirm() {
    if (!item || !dialog || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setDialogError("");
    try {
      if (dialog === "delete") {
        await deleteStoreProduct(item.id);
        toast(copy.deleted);
        router.replace("/store-catalog/products");
      } else {
        setItem(await transitionStoreProduct(item.id, item.status, target));
        toast(copy.success);
        router.refresh();
      }
      setDialog(null);
    } catch (caught) {
      if ((caught as { status?: number }).status === 409) {
        try {
          setItem(await getStoreProduct(item.id));
          setDialog(null);
          toast(copy.statusConflict);
        } catch {
          setDialogError(
            dialog === "delete" ? copy.productDeleteBlocked : requestErrorMessage(caught, t),
          );
        }
      } else {
        setDialogError(
          requestErrorMessage(caught, t, {
            translations: copy.translationSection,
            category_id: copy.category,
            primary_image_id: copy.image,
            retail_price_vnd: copy.price,
            csa_quota_group_id: copy.quotaGroup,
            csa_quota_cost: copy.quotaCost,
          }),
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (error)
    return (
      <DataState
        kind="error"
        title={error}
        action={{ label: t.common.retry, onClick: () => setRetry((value) => value + 1) }}
      />
    );
  if (!item) return <DataState kind="loading" title={copy.loading} />;
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
          <Group gap="xs" mb="sm">
            {item.status && <ProductLifecycleStatus status={item.status} />}
          </Group>
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
            <LazyRichTextEditor
              readOnly
              variant="product"
              imageAlt=""
              ariaLabel={copy.descriptionLabel}
              value={descriptionDocument(value.description, value.description_document)}
              onChange={() => undefined}
            />
          </section>
        ))}
        <div className="catalog-editor-actions">
          {item.capabilities && item.status ? (
            <>
              <Button component={Link} href={`/store-catalog/products/${item.id}/edit`}>
                {copy.edit}
              </Button>
              <Button variant="default" onClick={() => setDialog("transition")}>
                {transitionLabel}
              </Button>
              {item.capabilities.delete.allowed && (
                <Button color="red" onClick={() => setDialog("delete")}>
                  {copy.delete}
                </Button>
              )}
            </>
          ) : (
            <p>{copy.lifecycleUnavailable}</p>
          )}
        </div>
        {item.capabilities && !item.capabilities.delete.allowed && (
          <>
            <p>{copy.productDeleteBlocked}</p>
            <ProductLockReasons reasons={item.capabilities.delete.reasons} />
          </>
        )}
      </div>
      {dialog && (
        <ConfirmationDialog
          title={dialog === "delete" ? copy.delete : transitionLabel}
          busy={busy}
          busyLabel={copy.saving}
          cancelLabel={copy.cancel}
          confirmLabel={dialog === "delete" ? copy.delete : transitionLabel}
          danger={dialog === "delete" || target === "discontinued"}
          error={dialogError}
          onCancel={() => {
            setDialog(null);
            setDialogError("");
          }}
          onConfirm={confirm}
        >
          <p>
            {dialog === "delete"
              ? copy.confirmDelete
              : target === "discontinued"
                ? copy.discontinueHint
                : copy.startSellingHint}
          </p>
        </ConfirmationDialog>
      )}
    </>
  );
}
