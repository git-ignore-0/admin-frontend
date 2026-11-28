"use client";

import {
  ActionIcon,
  Alert,
  Button,
  Flex,
  Group,
  Image,
  Menu,
  Paper,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { IconDots } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { LazyRichTextEditor } from "@/components/lazy-rich-text-editor";
import { PageHeading } from "@/components/page-heading";
import {
  ProductLifecycleStatus,
  ProductLockDisclosure,
} from "@/components/product-lifecycle-status";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { deleteStoreProduct, getStoreProduct, transitionStoreProduct } from "@/lib/commerce-api";
import {
  isProtectedDataError,
  isUncertainMutationError,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import { invalidateFarmDetailsAfterProductTransition } from "@/lib/farm-detail-snapshot";
import { mediaUrlForWidth } from "@/lib/media";
import { localizedCatalogTranslation } from "@/lib/membership-translations";
import { formatDecimalInput } from "@/lib/numeric-input";
import { descriptionDocument, descriptionText } from "@/lib/store-product-description";
import { storeProductHref } from "@/lib/store-product-navigation";
import type { StoreProductDetail as ProductDetail } from "@/lib/types";

export function StoreProductDetail({ productId }: { productId: string }) {
  return <ProductDetailContent key={productId} productId={productId} />;
}

type Notice =
  "statusConflict" | "productTransitionInvalid" | "productDeleteBlocked" | "productResultUncertain";

function ProductContent({ item, name }: { item: ProductDetail; name: string }) {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const contentHeadingId = useId();
  const [selected, setSelected] = useState<"vi" | "en" | null>(null);
  const translations = (["vi", "en"] as const).map((language) => {
    const translation = item.translations.find((entry) => entry.locale === language);
    const document = translation
      ? descriptionDocument(translation.description, translation.description_document)
      : null;
    return {
      language,
      name: translation?.name?.trim(),
      shortDescription: translation?.short_description,
      document: document && descriptionText(document).trim() ? document : null,
    };
  });
  const available = translations.filter(
    (entry) => entry.name || entry.shortDescription?.trim() || entry.document,
  );
  const active =
    selected ??
    available.find((entry) => entry.language === locale)?.language ??
    available[0]?.language ??
    locale;

  return (
    <Paper component="section" aria-labelledby={contentHeadingId} p="md" withBorder>
      <Stack gap="sm">
        <Title id={contentHeadingId} order={2} size="h2">
          {copy.productContent}
        </Title>
        <Tabs
          value={active}
          onChange={(value) => {
            if (value === "vi" || value === "en") setSelected(value);
          }}
          keepMounted={false}
        >
          <Tabs.List aria-label={t.common.language}>
            <Tabs.Tab value="vi">{t.common.vietnamese}</Tabs.Tab>
            <Tabs.Tab value="en">{t.common.english}</Tabs.Tab>
          </Tabs.List>
          {translations.map(({ language, name: translatedName, shortDescription, document }) => {
            const showName = translatedName && translatedName !== name;
            return (
              <Tabs.Panel
                key={language}
                value={language}
                pt="sm"
                style={{ overflowWrap: "anywhere" }}
              >
                <Stack gap="xs" lang={language}>
                  {showName && (
                    <Title order={3} size="md" fw={600}>
                      {translatedName}
                    </Title>
                  )}
                  {shortDescription?.trim() && (
                    <Text style={{ whiteSpace: "pre-wrap" }}>{shortDescription}</Text>
                  )}
                  {document && (
                    <LazyRichTextEditor
                      readOnly
                      variant="product"
                      imageAlt=""
                      ariaLabel={copy.descriptionLabel}
                      value={document}
                      onChange={() => undefined}
                    />
                  )}
                  {!showName && !shortDescription?.trim() && !document && (
                    <Text size="sm" c="dimmed" lang={locale}>
                      {copy.productContentMissing}
                    </Text>
                  )}
                </Stack>
              </Tabs.Panel>
            );
          })}
        </Tabs>
      </Stack>
    </Paper>
  );
}

function ProductDetailContent({ productId }: { productId: string }) {
  const { locale, t } = useAdminI18n();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const queryClient = useQueryClient();
  const copy = t.storeCatalog;
  const router = useRouter();
  const searchParams = useSearchParams();
  const listHref = storeProductHref(searchParams);
  const toast = useToast();
  const [loadedItem, setItem] = useState<ProductDetail | null>(null);
  const [loadError, setLoadError] = useState<{ cause: unknown } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<"delete" | "transition" | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const moreActionsTrigger = useRef<HTMLButtonElement>(null);
  const transitionTrigger = useRef<HTMLButtonElement>(null);
  const identityHeadingId = useId();
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

  const item = !loadError && isCurrent() ? loadedItem : null;
  const name =
    item?.translations.find((entry) => entry.locale === locale && entry.name.trim())?.name.trim() ??
    item?.translations.find((entry) => entry.name.trim())?.name.trim() ??
    item?.sku ??
    t.breadcrumb.productDetails;
  const breadcrumbItems = useMemo(
    () => [{ label: copy.products, href: listHref }, { label: name }],
    [copy.products, listHref, name],
  );
  const breadcrumb = (
    <AdminBreadcrumbForRoute
      pathname={storeProductHref(null, productId)}
      search={searchParams?.toString() ?? ""}
      items={breadcrumbItems}
    />
  );

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
    const active = () => mounted.current && isCurrent();
    setBusy(true);
    setDialogError("");
    try {
      if (dialog === "delete") {
        await deleteStoreProduct(item.id, item.version, active);
        if (!mounted.current || !isCurrent()) return;
        setItem(null);
        toast(copy.deleted);
        router.replace(listHref);
      } else {
        const updated = await transitionStoreProduct(
          item.id,
          item.status,
          target,
          item.version,
          active,
        );
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
      } else if (
        message === "csrf_rejected" ||
        (status === 400 && !isUncertainMutationError(caught))
      ) {
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
            : message === "version_conflict" ||
                (dialog === "transition" && message === "product_status_changed")
              ? "statusConflict"
              : dialog === "transition" && message === "product_transition_invalid"
                ? "productTransitionInvalid"
                : null);
        setNotice(conflict || "productResultUncertain");
        reload();
      }
    } finally {
      if (dialog === "transition" && isCurrent()) {
        invalidateFarmDetailsAfterProductTransition(queryClient);
      }
      inFlight.current = false;
      if (mounted.current && isCurrent()) setBusy(false);
    }
  }

  if (!item)
    return (
      <>
        {breadcrumb}
        <PageHeading title={t.breadcrumb.productDetails} visuallyHiddenTitle />
        {loadError ? (
          <RecoveryAlert
            message={
              (loadError.cause as ClientApiError | undefined)?.status === 404
                ? copy.productNotFound
                : requestErrorMessage(loadError.cause, t)
            }
            retryLabel={t.common.retry}
            onRetry={reload}
          />
        ) : (
          <Paper withBorder p="md">
            <VisuallyHidden role="status">{copy.loading}</VisuallyHidden>
            <Stack gap="sm" aria-hidden>
              <Skeleton h="lg" w="60%" maw="16rem" />
              <Skeleton h="md" w="40%" maw="10rem" />
            </Stack>
          </Paper>
        )}
      </>
    );

  const unitLabel =
    locale === "vi"
      ? item.unit_label_vi || item.unit_label_en
      : item.unit_label_en || item.unit_label_vi;
  const editIsPrimary = item.status === "active";
  return (
    <>
      {breadcrumb}
      <Stack gap="md">
        <Paper component="section" aria-labelledby={identityHeadingId} p="md" withBorder>
          <Stack gap="md">
            <Flex gap="md" wrap="wrap" align="flex-start">
              {item.primary_image && (
                <Image
                  component={NextImage}
                  alt={name}
                  src={mediaUrlForWidth(item.primary_image, 192)}
                  width={96}
                  height={96}
                  w={96}
                  h={96}
                  maw="100%"
                  flex="0 0 auto"
                  radius="md"
                  unoptimized
                />
              )}
              <Stack gap="xs" flex="1 1 9rem" miw={0} style={{ overflowWrap: "anywhere" }}>
                <Title id={identityHeadingId} order={1} size="h1">
                  {name}
                </Title>
                <Group gap="xs" align="baseline">
                  {name !== item.sku && (
                    <Text size="sm" c="dimmed">
                      SKU {item.sku}
                    </Text>
                  )}
                  <ProductLifecycleStatus status={item.status} />
                </Group>
                <Group gap="xs" align="baseline">
                  <Text size="lg" fw={600}>
                    {new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(
                      BigInt(item.retail_price_vnd),
                    )}{" "}
                    ₫
                  </Text>
                  <Text size="sm" c="dimmed">
                    / {formatDecimalInput(item.unit_size)} {unitLabel}
                  </Text>
                </Group>
              </Stack>
            </Flex>
            <RecordDetailFields>
              <RecordDetailField label={copy.category}>{item.category_slug}</RecordDetailField>
              <RecordDetailField label={copy.slug}>/{item.slug}</RecordDetailField>
              <RecordDetailField label={copy.saleType}>
                {item.csa_quota_group ? copy.csaSaleOption : copy.retailOnly}
              </RecordDetailField>
              {item.csa_quota_group && (
                <>
                  <RecordDetailField label={copy.quotaGroup}>
                    {localizedCatalogTranslation(item.csa_quota_group.translations, locale)?.name ||
                      item.csa_quota_group.name}
                  </RecordDetailField>
                  <RecordDetailField label={copy.quotaCost}>
                    {String(item.csa_quota_cost)}
                  </RecordDetailField>
                </>
              )}
            </RecordDetailFields>
            {notice && (
              <Alert
                color={
                  notice === "productResultUncertain" || notice === "productDeleteBlocked"
                    ? "warning"
                    : "info"
                }
                role="status"
              >
                {notice === "productDeleteBlocked" ? copy.productDeleteConflict : copy[notice]}
              </Alert>
            )}
            {item.capabilities ? (
              <>
                <Group component="footer" gap="xs">
                  <Button
                    component={AdminNavigationLink}
                    href={storeProductHref(searchParams, item.id, "edit")}
                    variant={editIsPrimary ? "filled" : "default"}
                    disabled={busy}
                    aria-disabled={busy || undefined}
                    tabIndex={busy ? -1 : undefined}
                    onClick={(event) => {
                      if (inFlight.current) event.preventDefault();
                    }}
                  >
                    {copy.edit}
                  </Button>
                  <Button
                    ref={transitionTrigger}
                    variant={editIsPrimary ? "default" : "filled"}
                    disabled={busy}
                    onClick={() => setDialog("transition")}
                  >
                    {transitionLabel}
                  </Button>
                  {item.capabilities.delete.allowed && (
                    <Menu position="bottom-end" shadow="sm">
                      <Menu.Target>
                        <ActionIcon
                          ref={moreActionsTrigger}
                          variant="default"
                          aria-label={t.common.moreActions}
                          disabled={busy}
                        >
                          <IconDots size={18} aria-hidden />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item color="danger" onClick={() => setDialog("delete")}>
                          {copy.delete}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
                {!item.capabilities.delete.allowed && (
                  <ProductLockDisclosure
                    summary={copy.productDeleteBlocked}
                    reasons={item.capabilities.delete.reasons}
                  />
                )}
              </>
            ) : (
              <Alert color="warning">{copy.lifecycleUnavailable}</Alert>
            )}
          </Stack>
        </Paper>
        <ProductContent item={item} name={name} />
      </Stack>
      {dialog && (
        <ConfirmationDialog
          title={dialog === "delete" ? copy.delete : transitionLabel}
          size={400}
          busy={busy}
          busyLabel={copy.saving}
          cancelLabel={copy.cancel}
          confirmLabel={dialog === "delete" ? copy.delete : transitionLabel}
          danger={dialog === "delete" || target === "discontinued"}
          error={dialogError}
          returnFocusRef={dialog === "delete" ? moreActionsTrigger : transitionTrigger}
          onCancel={() => {
            setDialog(null);
            setDialogError("");
          }}
          onConfirm={confirm}
        >
          <Text component="p">
            {dialog === "delete"
              ? copy.confirmDelete
              : target === "discontinued"
                ? copy.discontinueHint
                : copy.startSellingHint}
          </Text>
        </ConfirmationDialog>
      )}
    </>
  );
}
