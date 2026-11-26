"use client";
import { DataState } from "@/components/nfv-controls";
import { Alert, Group, Button, Stack } from "@mantine/core";

import { ProductLifecycleStatus, ProductLockReasons } from "@/components/product-lifecycle-status";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { LazyRichTextEditor } from "@/components/lazy-rich-text-editor";
import { descriptionDocument } from "@/lib/store-product-description";
import { useToast } from "@/components/toast-provider";
import { deleteStoreProduct, getStoreProduct, transitionStoreProduct } from "@/lib/commerce-api";
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import { localizedCatalogTranslation } from "@/lib/membership-translations";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { StoreProductDetail as ProductDetail } from "@/lib/types";

export function StoreProductDetail({ productId }: { productId: string }) {
  return <ProductDetailContent key={productId} productId={productId} />;
}

type Notice =
  "statusConflict" | "productTransitionInvalid" | "productDeleteBlocked" | "productResultUncertain";

function ProductDetailContent({ productId }: { productId: string }) {
  const { locale, t } = useAdminI18n();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const copy = t.storeCatalog;
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState<ProductDetail | null>(null);
  const [loadError, setLoadError] = useState<{ cause: unknown } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<"delete" | "transition" | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    getStoreProduct(productId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && isCurrent()) setItem(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted && isCurrent()) setLoadError({ cause });
      });
    return () => controller.abort();
  }, [productId, retry, isCurrent]);

  function reload() {
    setItem(null);
    setLoadError(null);
    setDialog(null);
    setRetry((value) => value + 1);
  }

  const target = item?.status === "active" ? "discontinued" : "active";
  const transitionLabel =
    item?.status === "active"
      ? copy.discontinued
      : item?.status === "discontinued"
        ? copy.resumeSelling
        : copy.startSelling;

  async function confirm() {
    if (
      !item ||
      !dialog ||
      inFlight.current ||
      !isCurrent() ||
      (dialog === "delete" && !item.capabilities?.delete.allowed)
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setDialogError("");
    try {
      if (dialog === "delete") {
        await deleteStoreProduct(item.id);
        if (!mounted.current || !isCurrent()) return;
        setItem(null);
        toast(copy.deleted);
        router.replace("/store-catalog/products");
      } else {
        const updated = await transitionStoreProduct(item.id, item.status, target);
        if (!mounted.current || !isCurrent()) return;
        setItem(updated);
        toast(copy.success);
        router.refresh();
      }
      setNotice(null);
      setDialog(null);
    } catch (caught) {
      if (!mounted.current || !isCurrent()) return;
      const { status, message } = caught instanceof Error ? (caught as ClientApiError) : {};
      if (isProtectedDataError(caught) || status === 404) {
        setItem(null);
        setDialog(null);
        setLoadError({ cause: caught });
      } else if (status === 400 && message !== "invalid_response") {
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
      } else {
        const conflict =
          status === 409 &&
          (dialog === "delete" && message === "product_in_use"
            ? "productDeleteBlocked"
            : dialog === "transition" && message === "product_status_changed"
              ? "statusConflict"
              : dialog === "transition" && message === "product_transition_invalid"
                ? "productTransitionInvalid"
                : null);
        setNotice(conflict || "productResultUncertain");
        reload();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current && isCurrent()) setBusy(false);
    }
  }

  if (loadError)
    return (
      <DataState
        kind="error"
        title={
          (loadError.cause as ClientApiError | undefined)?.status === 404
            ? copy.productNotFound
            : requestErrorMessage(loadError.cause, t)
        }
        action={{ label: t.common.retry, onClick: reload }}
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
            <ProductLifecycleStatus status={item.status} />
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
          <Stack gap="sm" mt="md">
            {notice && notice !== "productDeleteBlocked" && (
              <Alert role="status">{copy[notice]}</Alert>
            )}
            {item.capabilities ? (
              <>
                <Group gap="xs">
                  <Button
                    component={Link}
                    href={`/store-catalog/products/${item.id}/edit`}
                    disabled={busy}
                  >
                    {copy.edit}
                  </Button>
                  <Button variant="default" disabled={busy} onClick={() => setDialog("transition")}>
                    {transitionLabel}
                  </Button>
                </Group>
                {item.capabilities.delete.allowed ? (
                  <Group>
                    {notice === "productDeleteBlocked" && (
                      <Alert role="status">{copy.productDeleteBlocked}</Alert>
                    )}
                    <Button
                      variant="outline"
                      color="red"
                      disabled={busy}
                      onClick={() => setDialog("delete")}
                    >
                      {copy.delete}
                    </Button>
                  </Group>
                ) : (
                  <Alert>
                    {copy.productDeleteBlocked}
                    <ProductLockReasons reasons={item.capabilities.delete.reasons} />
                  </Alert>
                )}
              </>
            ) : (
              <Alert>{copy.lifecycleUnavailable}</Alert>
            )}
          </Stack>
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
