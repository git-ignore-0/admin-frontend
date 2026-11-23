"use client";

import {
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { MembershipCatalogBreadcrumbs } from "@/components/membership-catalog-route-navigation";
import { Section, Status as UiStatus } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { formatAdminDateTime } from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { legacyPackageItemView } from "@/lib/membership-catalog-adapter";
import { catalogHref, readCatalogListContext } from "@/lib/membership-catalog-navigation";
import { formatMembershipMoney } from "@/lib/membership-format";
import {
  hasCompleteCatalogTranslations,
  localizedCatalogTranslation,
} from "@/lib/membership-translations";
import type { MembershipPackage, MembershipProduct } from "@/lib/types";

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useAdminI18n();
  return (
    <RecoveryAlert
      message={requestErrorMessage(error, t)}
      retryLabel={t.common.retry}
      onRetry={retry}
    />
  );
}

function CatalogDetailLoading({ label }: { label: string }) {
  return (
    <Paper component="section" p="md" aria-busy="true" withBorder>
      <VisuallyHidden role="status">{label}</VisuallyHidden>
      <Stack gap="sm" aria-hidden="true">
        <Skeleton height={20} width="40%" />
        <Skeleton height={42} />
        <Skeleton height={42} />
      </Stack>
    </Paper>
  );
}

function Status({ active }: { active: boolean }) {
  const { t } = useAdminI18n();
  return (
    <UiStatus
      domain="availability"
      status={active ? "active" : "inactive"}
      label={active ? t.membershipCatalog.active : t.membershipCatalog.inactive}
    />
  );
}

function formatUnitConversion(template: string, amount: string, label: string) {
  return template.replace("{amount}", amount).replace("{label}", label);
}

function BilingualReview({
  translations,
}: {
  translations: Array<{ locale: "vi" | "en"; name: string; description: string }>;
}) {
  const { t } = useAdminI18n();
  return (
    <Paper component="section" p="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={2} size="md">
            {t.membershipCatalog.bilingualContent}
          </Title>
          {!hasCompleteCatalogTranslations(translations) && (
            <Badge color="warning">{t.membershipCatalog.translationNeedsReview}</Badge>
          )}
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {(["vi", "en"] as const).map((locale) => {
            const translation = translations.find((item) => item.locale === locale);
            return (
              <Paper component="article" key={locale} withBorder p="sm">
                <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                  <Title order={3} size="sm">
                    {locale === "vi" ? t.common.vietnamese : t.common.english}
                  </Title>
                  <Text fw={600}>{translation?.name || t.membershipCatalog.incomplete}</Text>
                  <Text size="sm" c="dimmed">
                    {translation?.description || "—"}
                  </Text>
                </Stack>
              </Paper>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}

function DeleteDialog({
  busy,
  error,
  name,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useAdminI18n();
  return (
    <ConfirmationDialog
      busy={busy}
      busyLabel={t.membershipCatalog.deleting}
      cancelLabel={t.membershipCatalog.cancel}
      confirmLabel={t.membershipCatalog.confirmDelete}
      danger
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={t.membershipCatalog.deleteTitle}
    >
      <Text>{t.membershipCatalog.deleteBody.replace("{name}", name)}</Text>
    </ConfirmationDialog>
  );
}

export function MembershipProductDetail({ productId }: { productId: string }) {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const listContext = readCatalogListContext(useSearchParams());
  const backHref = catalogHref("products", listContext);
  const toast = useToast();
  const deletingRef = useRef(false);
  const [item, setItem] = useState<MembershipProduct | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(() => {
    setError(null);
    api<MembershipProduct>(`admin/membership-products/${productId}`)
      .then(setItem)
      .catch((caught) => setError(caught));
  }, [productId]);
  useEffect(load, [attempt, load]);

  async function remove() {
    if (!item || deletingRef.current) return;
    deletingRef.current = true;
    setDeleteBusy(true);
    setDeleteError("");
    let navigating = false;
    try {
      await api(
        `admin/membership-products/${item.id}`,
        { method: "DELETE" },
        { response: "no-content" },
      );
      toast(t.membershipCatalog.deleted);
      navigating = true;
      router.replace(backHref);
    } catch (caught) {
      setDeleteError(requestErrorMessage(caught, t));
    } finally {
      if (!navigating) {
        deletingRef.current = false;
        setDeleteBusy(false);
      }
    }
  }

  if (error && !item) return <LoadError error={error} retry={() => setAttempt((v) => v + 1)} />;
  if (!item) return <CatalogDetailLoading label={t.membershipCatalog.loadingProduct} />;
  const selected = localizedCatalogTranslation(item.translations, locale);

  return (
    <>
      <Stack gap="md" inert={deleteOpen || undefined}>
        <PageHeading
          backHref={backHref}
          backLabel={t.membershipCatalog.backToProducts}
          title={selected?.name || item.name}
          bottomSpacing={0}
          action={
            <>
              <Button
                color="danger"
                variant="subtle"
                onClick={() => setDeleteOpen(true)}
                type="button"
              >
                {t.membershipCatalog.delete}
              </Button>
              <Button
                component={AdminNavigationLink}
                href={catalogHref("products", listContext, item.id, "edit")}
              >
                {t.membershipCatalog.editProduct}
              </Button>
            </>
          }
        />
        <Paper component="section" p="md" withBorder>
          <Stack gap="sm">
            <Title order={2} size="md">
              {t.membershipCatalog.productDetails}
            </Title>
            <RecordDetailFields>
              <RecordDetailField label={t.membershipCatalog.unitConversion}>
                {formatUnitConversion(
                  t.membershipCatalog.unitConversionValue,
                  item.unit_size,
                  locale === "vi" ? item.unit_label_vi : item.unit_label_en,
                )}
              </RecordDetailField>
              <RecordDetailField label={t.membershipCatalog.unitVi}>
                {item.unit_label_vi}
              </RecordDetailField>
              <RecordDetailField label={t.membershipCatalog.unitEn}>
                {item.unit_label_en}
              </RecordDetailField>
              <RecordDetailField label={t.membershipCatalog.status}>
                <Status active={item.is_active} />
              </RecordDetailField>
              {item.created_at && (
                <RecordDetailField label={t.membershipCatalog.createdAt}>
                  {formatAdminDateTime(item.created_at)}
                </RecordDetailField>
              )}
              {item.updated_at && (
                <RecordDetailField label={t.membershipCatalog.updatedAt}>
                  {formatAdminDateTime(item.updated_at)}
                </RecordDetailField>
              )}
            </RecordDetailFields>
          </Stack>
        </Paper>
        <BilingualReview
          translations={item.translations.map((translation) => ({
            locale: translation.locale,
            name: translation.name,
            description: translation.short_description,
          }))}
        />
      </Stack>
      {deleteOpen && (
        <DeleteDialog
          busy={deleteBusy}
          error={deleteError}
          name={selected?.name || item.name}
          onCancel={() => {
            setDeleteOpen(false);
            setDeleteError("");
          }}
          onConfirm={remove}
        />
      )}
    </>
  );
}

export function MembershipPackageDetail({ packageId }: { packageId: string }) {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const listContext = readCatalogListContext(useSearchParams());
  const backHref = catalogHref("packages", listContext);
  const toast = useToast();
  const deletingRef = useRef(false);
  const [item, setItem] = useState<MembershipPackage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const reloadPackage = useCallback(async () => {
    const updated = await api<MembershipPackage>(`admin/membership-packages/${packageId}`);
    setItem(updated);
    setError(null);
  }, [packageId]);
  useEffect(() => {
    setError(null);
    void reloadPackage().catch((caught) => setError(caught));
  }, [attempt, reloadPackage]);

  async function remove() {
    if (!item || deletingRef.current) return;
    deletingRef.current = true;
    setDeleteBusy(true);
    setDeleteError("");
    let navigating = false;
    try {
      await api(
        `admin/membership-packages/${item.id}`,
        { method: "DELETE" },
        { response: "no-content" },
      );
      toast(t.membershipCatalog.deleted);
      navigating = true;
      router.replace(backHref);
    } catch (caught) {
      setDeleteError(requestErrorMessage(caught, t));
    } finally {
      if (!navigating) {
        deletingRef.current = false;
        setDeleteBusy(false);
      }
    }
  }

  const packageName = item
    ? localizedCatalogTranslation(item.translations, locale)?.name || item.name
    : undefined;
  const breadcrumbs = (
    <MembershipCatalogBreadcrumbs resource="packages" id={packageId} recordLabel={packageName} />
  );
  if (!item) {
    return (
      <>
        {breadcrumbs}
        {error ? (
          <LoadError error={error} retry={() => setAttempt((v) => v + 1)} />
        ) : (
          <CatalogDetailLoading label={t.membershipCatalog.loadingPackage} />
        )}
      </>
    );
  }
  const title = packageName || t.membershipCatalog.backToPackageDetail;

  return (
    <>
      {breadcrumbs}
      <Stack gap="md" inert={deleteOpen || undefined}>
        <PageHeading title={title} visuallyHiddenTitle />
        <Section
          title={t.membershipCatalog.packageDetails}
          actions={
            <>
              <Button
                color="danger"
                variant="subtle"
                onClick={() => setDeleteOpen(true)}
                type="button"
              >
                {t.membershipCatalog.delete}
              </Button>
              <Button
                component={AdminNavigationLink}
                href={catalogHref("packages", listContext, item.id, "edit")}
              >
                {t.membershipCatalog.editPackage}
              </Button>
            </>
          }
        >
          <RecordDetailFields>
            <RecordDetailField label={t.membershipCatalog.policy}>
              {item.quota_policy === "expire"
                ? t.membershipCatalog.expire
                : t.membershipCatalog.rollover}
            </RecordDetailField>
            <RecordDetailField label={t.membershipCatalog.status}>
              <Status active={item.is_active} />
            </RecordDetailField>
            {item.created_at && (
              <RecordDetailField label={t.membershipCatalog.createdAt}>
                {formatAdminDateTime(item.created_at)}
              </RecordDetailField>
            )}
            {item.updated_at && (
              <RecordDetailField label={t.membershipCatalog.updatedAt}>
                {formatAdminDateTime(item.updated_at)}
              </RecordDetailField>
            )}
          </RecordDetailFields>
        </Section>
        <Stack component="section" gap="sm" miw={0}>
          <Title order={2} size="md">
            {t.membershipCatalog.priceOptions}
          </Title>
          {([true, false] as const).map((active) => {
            const options = item.price_options.filter((option) => option.is_active === active);
            if (!options.length) return null;
            const label = active
              ? t.membershipCatalog.activeOptions
              : t.membershipCatalog.inactiveOptions;
            return (
              <Stack gap="xs" key={String(active)}>
                <Title order={3} size="sm">
                  {label}
                </Title>
                <Paper withBorder style={{ overflow: "hidden" }}>
                  <Table.ScrollContainer
                    type="native"
                    minWidth={460}
                    tabIndex={0}
                    role="region"
                    aria-label={label}
                  >
                    <Table aria-label={label} withRowBorders>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th scope="col">{t.membershipCatalog.duration}</Table.Th>
                          <Table.Th scope="col">{t.membershipCatalog.monthlyPrice}</Table.Th>
                          <Table.Th scope="col">{t.membershipCatalog.totalPreview}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {options.map((option) => (
                          <Table.Tr key={option.id}>
                            <Table.Td>{option.duration_months}</Table.Td>
                            <Table.Td>
                              {formatMembershipMoney(option.monthly_price_vnd, locale)}
                            </Table.Td>
                            <Table.Td>
                              {formatMembershipMoney(option.total_price_vnd, locale)}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </Paper>
              </Stack>
            );
          })}
        </Stack>
        <BilingualReview translations={item.translations} />
        <Stack component="section" gap="sm" miw={0}>
          <Title order={2} size="md">
            {t.membershipCatalog.packageProducts}
          </Title>
          <Paper withBorder style={{ overflow: "hidden" }}>
            <Table.ScrollContainer
              type="native"
              minWidth={460}
              tabIndex={0}
              role="region"
              aria-label={t.membershipCatalog.packageProducts}
            >
              <Table
                aria-label={t.membershipCatalog.packageProducts}
                withRowBorders
                styles={{ td: { overflowWrap: "anywhere" } }}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th scope="col">{t.membershipCatalog.product}</Table.Th>
                    <Table.Th scope="col">{t.membershipCatalog.quotaUnits}</Table.Th>
                    <Table.Th scope="col">{t.membershipCatalog.unitConversion}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {item.items.map((raw) => {
                    const line = legacyPackageItemView(raw);
                    const translated = localizedCatalogTranslation(line.translations, locale);
                    return (
                      <Table.Tr key={line.quotaGroupId}>
                        <Table.Td>
                          <Stack gap={4}>
                            <Text fw={600}>{translated?.name || line.name}</Text>
                            <Text size="sm" c="dimmed">
                              {translated?.short_description || line.shortDescription || "—"}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>{line.quotaUnits}</Table.Td>
                        <Table.Td>
                          {formatUnitConversion(
                            t.membershipCatalog.unitConversionValue,
                            line.unitSize,
                            locale === "vi" ? line.unitLabelVi : line.unitLabelEn,
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </Stack>
      </Stack>
      {deleteOpen && (
        <DeleteDialog
          busy={deleteBusy}
          error={deleteError}
          name={title}
          onCancel={() => {
            setDeleteOpen(false);
            setDeleteError("");
          }}
          onConfirm={remove}
        />
      )}
    </>
  );
}
