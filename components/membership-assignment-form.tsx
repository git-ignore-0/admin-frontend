"use client";

import {
  Alert,
  Box,
  Button,
  Group,
  Input,
  Paper,
  Radio,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminDateInput } from "@/components/admin-date-input";
import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { MembershipStatusBadge } from "@/components/membership-status-badge";
import { DataState, Status } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import {
  adminDateInputToIso,
  adminTodayIso,
  formatAdminDate,
  membershipLastReceiptDate,
} from "@/lib/admin-date";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import {
  csaCustomerDetailKey,
  csaCustomerListKey,
  csaCustomerPath,
} from "@/lib/csa-customers-query";
import { formatMembershipMoney } from "@/lib/membership-format";
import { localizedCatalogTranslation } from "@/lib/membership-translations";
import {
  addMonthsToDate,
  membershipWouldOverlap,
  suggestedMembershipStart,
} from "@/lib/membership-schedule";
import { formatVietnamPhone } from "@/lib/phone-number";
import type { AdminMembership, CSACustomer, MembershipPackage, PaginationMeta } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

const START_DATE_ID = "membership-start-date";
const START_DATE_HINT_ID = `${START_DATE_ID}-hint`;
const START_DATE_ERROR_ID = `${START_DATE_ID}-error`;

type Props = { customerId?: string; backHref?: string; listHref?: string };

export function MembershipAssignmentForm(props: Props) {
  const { t } = useAdminI18n();
  const search = useSearchParams();
  const listHref = props.listHref ?? csaCustomerPath;
  const breadcrumbs = useMemo(
    () => [
      { label: t.csaCustomers.title, href: listHref },
      { label: t.memberships.assignmentTitle },
    ],
    [listHref, t.csaCustomers.title, t.memberships.assignmentTitle],
  );
  return (
    <>
      <AdminBreadcrumbForRoute
        pathname="/memberships/assign"
        search={search?.toString()}
        items={breadcrumbs}
      />
      <MembershipAssignment key={props.customerId ?? ""} {...props} listHref={listHref} />
    </>
  );
}

function MembershipAssignment({ customerId, backHref, listHref }: Props & { listHref: string }) {
  const { locale, t } = useAdminI18n();
  const copy = t.memberships;
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const assignButtonRef = useRef<HTMLButtonElement>(null);
  const orderReferenceRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef(false);
  const [packageId, setPackageId] = useState("");
  const [priceOptionId, setPriceOptionId] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [orderReferenceError, setOrderReferenceError] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const customerKey = csaCustomerDetailKey(customerId ?? "");
  const customerQuery = useQuery({
    queryKey: customerKey,
    enabled: Boolean(customerId),
    queryFn: ({ signal }) =>
      api<CSACustomer>(`admin/csa-customers/${encodeURIComponent(customerId ?? "")}`, { signal }),
  });
  const customer = customerQuery.error ? undefined : customerQuery.data;
  const packageQuery = useQuery({
    queryKey: ["csa-assignment-packages"],
    enabled: Boolean(customer),
    queryFn: async ({ signal }) => {
      const result = await apiEnvelope<MembershipPackage[], PaginationMeta>(
        "admin/membership-packages?active=true&page=1",
        { signal },
      );
      return result.data.filter((item) => item.is_active);
    },
  });
  const packages = packageQuery.error ? undefined : packageQuery.data;
  const packagesLoading = packageQuery.isPending && !packageQuery.error;
  const { provinceName, wardName } = useAdministrativeUnitNames(
    customer?.province_code ?? null,
    customer?.ward_code ?? null,
    locale,
  );

  const selectedPackage = packages?.find((item) => item.id === packageId);
  const options = selectedPackage?.price_options.filter((option) => option.is_active) ?? [];
  const selectedOption = options.find((option) => option.id === priceOptionId);
  const showConfirmation = confirmOpen && selectedOption !== undefined;
  useEffect(() => {
    // Refreshed packages can invalidate a review while the draft stays editable.
    if (!customer || !selectedOption) setConfirmOpen(false);
  }, [customer, selectedOption]);
  const selectedPackageName =
    localizedCatalogTranslation(selectedPackage?.translations ?? [], locale)?.name ||
    selectedPackage?.name ||
    "";
  const existingMemberships = customer?.memberships ?? [];
  const suggestedStart = suggestedMembershipStart(existingMemberships, adminTodayIso());
  const startDate = adminDateInputToIso(startDateInput) ?? "";
  const startDateInvalid = startDateInput.length === 10 && !startDate;
  const exclusiveEnd =
    selectedOption && startDate ? addMonthsToDate(startDate, selectedOption.duration_months) : null;
  const printEndDate = membershipLastReceiptDate(exclusiveEnd);
  const overlaps = Boolean(
    startDate &&
    exclusiveEnd &&
    membershipWouldOverlap(existingMemberships, startDate, exclusiveEnd),
  );
  const startDateError = startDateInvalid
    ? copy.invalidStartDate
    : startDate && startDate < suggestedStart
      ? copy.startDateMinimum.replace("{date}", formatAdminDate(suggestedStart))
      : overlaps
        ? t.csaCustomers.overlapConflict
        : "";
  const formReady = Boolean(
    customer &&
    selectedPackage &&
    selectedOption &&
    orderReference.trim() &&
    startDate &&
    !startDateError &&
    !customerQuery.isFetching &&
    !packageQuery.isFetching,
  );
  const priceSummary = (months: number, monthly: string) =>
    t.membershipCatalog.priceOptionSummary
      .replace("{months}", String(months))
      .replace("{price}", formatMembershipMoney(monthly, locale));

  async function assign() {
    if (!formReady || !customer || !selectedPackage || !selectedOption || submitRef.current) return;
    submitRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        customer_id: customer.id,
        package_id: selectedPackage.id,
        price_option_id: selectedOption.id,
        start_date: startDate,
        farmbrite_order_reference: orderReference.trim(),
      };
      await api<AdminMembership>(`admin/memberships?locale=${locale}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      void client.invalidateQueries({ queryKey: customerKey, refetchType: "none" });
      void client.invalidateQueries({ queryKey: csaCustomerListKey, refetchType: "none" });
      toast(copy.assignmentCreated);
      router.replace(backHref ?? `${csaCustomerPath}/${encodeURIComponent(customer.id)}`);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      submitRef.current = false;
      setSaving(false);
      setConfirmOpen(false);
      if (code === "duplicate_farmbrite_order_reference") {
        setOrderReferenceError(copy.duplicateOrderReference);
        window.setTimeout(() => orderReferenceRef.current?.focus(), 0);
        return;
      }
      setFormError(
        code === "membership_overlap"
          ? copy.activeMembershipConflict
          : code === "csa_customer_incomplete"
            ? copy.customerIncomplete
            : code === "price_option_unavailable"
              ? copy.inactivePriceConflict
              : code === "package_unavailable"
                ? copy.packageUnavailable
                : requestErrorMessage(caught, t),
      );
    }
  }

  if (!customerId || !customer) {
    return (
      <Paper component="section" withBorder p="md">
        {!customerId ? (
          <Stack align="flex-start" gap="sm" role="status">
            <Text>{copy.customerRequired}</Text>
            <Button component={AdminNavigationLink} href={listHref} variant="default">
              {copy.backToCustomers}
            </Button>
          </Stack>
        ) : customerQuery.error ? (
          <Stack gap="sm" align="flex-start">
            <RecoveryAlert
              message={requestErrorMessage(customerQuery.error, t)}
              onRetry={() => void customerQuery.refetch()}
              retryLabel={t.common.retry}
              loading={customerQuery.isFetching}
            />
            <Button component={AdminNavigationLink} href={listHref} variant="default">
              {copy.backToCustomers}
            </Button>
          </Stack>
        ) : (
          <Stack gap="sm" aria-busy="true">
            <VisuallyHidden role="status">{t.csaCustomers.detailLoading}</VisuallyHidden>
            <Skeleton width="45%" height={18} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </Stack>
        )}
      </Paper>
    );
  }

  return (
    <>
      <Stack gap="md" inert={showConfirmation || undefined}>
        <Paper component="section" withBorder p="md">
          <Stack gap="sm">
            <Title order={2} size="md" ref={headingRef} tabIndex={-1}>
              {copy.customer}
            </Title>
            <RecordDetailFields>
              <RecordDetailField label={t.csaCustomers.name}>{customer.name}</RecordDetailField>
              <RecordDetailField label={t.csaCustomers.phone}>
                {formatVietnamPhone(customer.phone)}
              </RecordDetailField>
              <RecordDetailField label={t.csaCustomers.websiteAccount}>
                <Status
                  domain="account-link"
                  status={customer.user ? "linked" : "managed"}
                  label={customer.user ? copy.linkedCustomer : copy.managedCustomer}
                />
              </RecordDetailField>
              <RecordDetailField label={t.csaCustomers.province}>{provinceName}</RecordDetailField>
              <RecordDetailField label={t.csaCustomers.ward}>{wardName}</RecordDetailField>
              <RecordDetailField label={t.csaCustomers.deliveryAddress}>
                {customer.address}
              </RecordDetailField>
            </RecordDetailFields>
          </Stack>
        </Paper>

        <Paper component="section" withBorder p="md" aria-busy={packagesLoading}>
          <Stack gap="md">
            <Title order={2} size="md" id="assignment-package-heading">
              {copy.assignmentDetails}
            </Title>
            {formError && (
              <Alert color="danger" role="alert">
                {formError}
              </Alert>
            )}
            {packageQuery.error ? (
              <RecoveryAlert
                message={requestErrorMessage(packageQuery.error, t)}
                onRetry={() => void packageQuery.refetch()}
                retryLabel={t.common.retry}
                loading={packageQuery.isFetching}
              />
            ) : packagesLoading ? (
              <Stack gap="xs">
                <VisuallyHidden role="status">{copy.loadingPackages}</VisuallyHidden>
                <Skeleton height={68} />
                <Skeleton height={68} />
              </Stack>
            ) : packages?.length === 0 ? (
              <DataState kind="empty" title={copy.noPackages} compact />
            ) : (
              <Stack gap="xs" role="radiogroup" aria-labelledby="assignment-package-heading">
                {packages?.map((item) => {
                  const activeOptions = item.price_options.filter((option) => option.is_active);
                  const translation = localizedCatalogTranslation(item.translations, locale);
                  const description = translation?.description || item.description;
                  const checked = packageId === item.id;
                  return (
                    <Paper
                      key={item.id}
                      p="sm"
                      withBorder
                      style={checked ? { backgroundColor: "var(--surface-selected)" } : undefined}
                    >
                      <Radio
                        checked={checked}
                        disabled={!activeOptions.length}
                        name="membership-package"
                        onChange={() => {
                          setPackageId(item.id);
                          setPriceOptionId("");
                          setFormError("");
                        }}
                        label={
                          <Stack component="span" gap={4} style={{ overflowWrap: "anywhere" }}>
                            <Text component="span" fw={600}>
                              {translation?.name || item.name}
                            </Text>
                            {description && (
                              <Text component="span" size="sm" c="dimmed">
                                {description}
                              </Text>
                            )}
                            {activeOptions.length ? (
                              activeOptions.map((option) => (
                                <Text component="span" key={option.id} size="sm" c="dimmed">
                                  {priceSummary(option.duration_months, option.monthly_price_vnd)}
                                  {" · "}
                                  {t.membershipCatalog.totalPreview}{" "}
                                  {formatMembershipMoney(option.total_price_vnd, locale)}
                                </Text>
                              ))
                            ) : (
                              <Text component="span" size="sm" c="danger">
                                {copy.packageNoActiveOptions}
                              </Text>
                            )}
                          </Stack>
                        }
                      />
                    </Paper>
                  );
                })}
              </Stack>
            )}

            <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
              <Select
                disabled={!options.length}
                label={copy.priceOption}
                withAsterisk
                aria-required="true"
                placeholder={copy.choosePriceOption}
                value={priceOptionId || null}
                onChange={(value) => {
                  setPriceOptionId(value ?? "");
                  setFormError("");
                }}
                data={options.map((option) => ({
                  value: option.id,
                  label: priceSummary(option.duration_months, option.monthly_price_vnd),
                }))}
                allowDeselect={false}
              />
              <TextInput
                label={copy.orderReference}
                description={orderReferenceError ? undefined : copy.orderReferenceHelp}
                inputWrapperOrder={["label", "input", "description", "error"]}
                error={orderReferenceError && <span role="alert">{orderReferenceError}</span>}
                required
                maxLength={120}
                ref={orderReferenceRef}
                value={orderReference}
                onBlur={() => {
                  if (!orderReference.trim()) setOrderReferenceError(copy.orderReferenceRequired);
                }}
                onChange={(event) => {
                  setOrderReference(event.currentTarget.value);
                  setOrderReferenceError("");
                }}
              />
              <Box>
                <Input.Label htmlFor={START_DATE_ID} required>
                  {copy.startDate}
                </Input.Label>
                <AdminDateInput
                  aria-describedby={startDateError ? START_DATE_ERROR_ID : START_DATE_HINT_ID}
                  aria-invalid={Boolean(startDateError)}
                  disabled={!selectedOption}
                  id={START_DATE_ID}
                  required
                  onValueChange={(value) => {
                    setStartDateInput(value);
                    setFormError("");
                  }}
                  pickerLabel={copy.openStartDatePicker}
                  pickerMin={suggestedStart}
                  value={startDateInput}
                />
                {startDateError ? (
                  <Input.Error id={START_DATE_ERROR_ID} role="alert" mt={4}>
                    {startDateError}
                  </Input.Error>
                ) : (
                  <Input.Description id={START_DATE_HINT_ID} mt={4}>
                    {copy.suggestedStartDate.replace("{date}", formatAdminDate(suggestedStart))}
                  </Input.Description>
                )}
              </Box>
            </SimpleGrid>
            {selectedOption && exclusiveEnd && (
              <Alert
                color={overlaps ? "danger" : "info"}
                role="status"
                title={t.csaCustomers.schedulePreview}
              >
                <Text fw={600}>
                  {formatAdminDate(startDate)} → {formatAdminDate(printEndDate)}
                </Text>
                <Text size="sm">
                  {overlaps ? t.csaCustomers.overlapConflict : t.csaCustomers.manualSchedule}
                </Text>
              </Alert>
            )}
          </Stack>
        </Paper>

        <Paper component="section" withBorder p="md">
          <Stack gap="sm">
            <Title order={2} size="md">
              {t.csaCustomers.existingPackages}
            </Title>
            {existingMemberships.length ? (
              <Stack component="ul" gap="xs" p={0} m={0} style={{ listStyle: "none" }}>
                {existingMemberships.map((membership) => (
                  <Paper component="li" key={membership.id} withBorder p="sm">
                    <Group justify="space-between" align="flex-start">
                      <Stack gap={4} miw={0}>
                        <Text fw={600} style={{ overflowWrap: "anywhere" }}>
                          {membership.package_name}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {formatAdminDate(membership.start_date)} –{" "}
                          {formatAdminDate(membershipLastReceiptDate(membership.end_date))}
                        </Text>
                      </Stack>
                      <MembershipStatusBadge
                        status={membership.status}
                        label={t.csaCustomers.membershipStatuses[membership.status]}
                      />
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <DataState kind="empty" title={t.csaCustomers.noHistory} compact />
            )}
          </Stack>
        </Paper>
        <Group justify="flex-end">
          <Button
            ref={assignButtonRef}
            disabled={!formReady || saving}
            onClick={() => {
              if (formReady) {
                setFormError("");
                setConfirmOpen(true);
              }
            }}
            type="button"
          >
            {copy.confirmAssignment}
          </Button>
        </Group>
      </Stack>
      {showConfirmation && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={copy.assigning}
          cancelLabel={copy.cancel}
          confirmDisabled={!formReady}
          confirmLabel={copy.confirmAssignment}
          fallbackFocusRef={headingRef}
          returnFocusRef={assignButtonRef}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={assign}
          title={copy.assignmentDialogTitle}
        >
          <RecordDetailFields>
            <RecordDetailField label={copy.customer}>{customer.name}</RecordDetailField>
            <RecordDetailField label={copy.package}>{selectedPackageName}</RecordDetailField>
            <RecordDetailField label={copy.totalPrice}>
              {formatMembershipMoney(selectedOption.total_price_vnd, locale)}
            </RecordDetailField>
            <RecordDetailField label={copy.orderReference}>
              {orderReference.trim()}
            </RecordDetailField>
            <RecordDetailField label={copy.startDate}>
              {formatAdminDate(startDate)}
            </RecordDetailField>
            <RecordDetailField label={copy.lastReceiptDate}>
              {formatAdminDate(printEndDate)}
            </RecordDetailField>
          </RecordDetailFields>
        </ConfirmationDialog>
      )}
    </>
  );
}
