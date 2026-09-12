"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDateInput } from "@/components/admin-date-input";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useToast } from "@/components/toast-provider";
import {
  adminDateInputToIso,
  adminTodayIso,
  formatAdminDate,
  membershipLastReceiptDate,
} from "@/lib/admin-date";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import { localizedCatalogTranslation } from "@/lib/membership-translations";
import {
  addMonthsToDate,
  membershipWouldOverlap,
  suggestedMembershipStart,
} from "@/lib/membership-schedule";
import type { AdminMembership, CSACustomer, MembershipPackage, PaginationMeta } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

const ORDER_REFERENCE_ERROR_ID = "membership-order-reference-error";
const START_DATE_ERROR_ID = "membership-start-date-error";

export function MembershipAssignmentForm({ customerId }: { customerId?: string }) {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const orderReferenceRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef(false);
  const dictionaryRef = useRef(t);
  dictionaryRef.current = t;
  const [customer, setCustomer] = useState<CSACustomer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(Boolean(customerId));
  const [customerError, setCustomerError] = useState("");
  const [packages, setPackages] = useState<MembershipPackage[] | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<MembershipPackage | null>(null);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState("");
  const [priceOptionId, setPriceOptionId] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [orderReferenceError, setOrderReferenceError] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { provinceName, wardName } = useAdministrativeUnitNames(
    customer?.province_code ?? null,
    customer?.ward_code ?? null,
    locale,
  );

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    setCustomer(null);
    setCustomerLoading(true);
    setCustomerError("");
    api<CSACustomer>(`admin/csa-customers/${encodeURIComponent(customerId)}`, {
      signal: controller.signal,
    })
      .then(setCustomer)
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setCustomerError(requestErrorMessage(caught, dictionaryRef.current));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCustomerLoading(false);
      });
    return () => controller.abort();
  }, [customerId]);

  useEffect(() => {
    if (!customer) return;
    const controller = new AbortController();
    setPackages(null);
    setSelectedPackage(null);
    setPriceOptionId("");
    setPackagesLoading(true);
    setPackagesError("");
    apiEnvelope<MembershipPackage[], PaginationMeta>(
      "admin/membership-packages?active=true&page=1",
      {
        signal: controller.signal,
      },
    )
      .then((result) => setPackages(result.data.filter((item) => item.is_active)))
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setPackagesError(requestErrorMessage(caught, dictionaryRef.current));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPackagesLoading(false);
      });
    return () => controller.abort();
  }, [customer]);

  const options = useMemo(
    () => selectedPackage?.price_options.filter((option) => option.is_active) ?? [],
    [selectedPackage],
  );
  const selectedOption = options.find((option) => option.id === priceOptionId);
  const selectedPackageTranslation = selectedPackage
    ? localizedCatalogTranslation(selectedPackage.translations, locale)
    : null;
  const selectedPackageName = selectedPackageTranslation?.name || selectedPackage?.name || "";
  const existingMemberships = customer?.memberships ?? [];
  const today = adminTodayIso();
  const suggestedStart = suggestedMembershipStart(existingMemberships, today);
  const startDate = adminDateInputToIso(startDateInput) ?? "";
  const startDateInvalid = startDateInput.length === 10 && !startDate;
  const exclusiveEnd =
    selectedOption && startDate ? addMonthsToDate(startDate, selectedOption.duration_months) : null;
  const overlaps = Boolean(
    startDate &&
    exclusiveEnd &&
    membershipWouldOverlap(existingMemberships, startDate, exclusiveEnd),
  );
  const startDateBeforeMinimum = Boolean(startDate && startDate < suggestedStart);
  const selectedPackageIsValid = Boolean(selectedPackage?.is_active && options.length > 0);
  const formReady = Boolean(
    customerId &&
    customer &&
    packages &&
    !packagesLoading &&
    !packagesError &&
    selectedPackageIsValid &&
    selectedOption?.is_active &&
    orderReference.trim() &&
    startDate &&
    !startDateInvalid &&
    !startDateBeforeMinimum &&
    !overlaps,
  );

  function validate() {
    if (!orderReference.trim()) {
      setOrderReferenceError(t.memberships.orderReferenceRequired);
      window.setTimeout(() => orderReferenceRef.current?.focus(), 0);
      return false;
    }
    if (!formReady) {
      return false;
    }
    setOrderReferenceError("");
    setFormError("");
    return true;
  }
  async function assign() {
    if (!validate() || !customer || !selectedPackage || !selectedOption || submitRef.current)
      return;
    submitRef.current = true;
    setSaving(true);
    try {
      const body: Record<string, string> = {
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
      toast(t.memberships.assignmentCreated);
      router.replace(`/csa-customers/${customer.id}`);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      if (code === "duplicate_farmbrite_order_reference") {
        setFormError("");
        setOrderReferenceError(t.memberships.duplicateOrderReference);
        setConfirmOpen(false);
        window.setTimeout(() => orderReferenceRef.current?.focus(), 0);
        return;
      }
      setFormError(
        code === "membership_overlap"
          ? t.memberships.activeMembershipConflict
          : code === "csa_customer_incomplete"
            ? t.memberships.customerIncomplete
            : code === "price_option_unavailable"
              ? t.memberships.inactivePriceConflict
              : code === "package_unavailable"
                ? t.memberships.packageUnavailable
                : requestErrorMessage(caught, t),
      );
      setConfirmOpen(false);
    } finally {
      submitRef.current = false;
      setSaving(false);
    }
  }

  if (!customerId) {
    return (
      <section className="panel empty" role="status">
        <p>{t.memberships.customerRequired}</p>
        <Link className="button" href="/csa-customers">
          {t.memberships.backToCustomers}
        </Link>
      </section>
    );
  }

  if (customerLoading) {
    return (
      <section className="panel" aria-busy="true">
        <p>{t.csaCustomers.detailLoading}</p>
      </section>
    );
  }

  if (!customer) {
    return (
      <section className="panel empty" role="alert">
        <p>{customerError}</p>
        <Link className="button" href="/csa-customers">
          {t.memberships.backToCustomers}
        </Link>
      </section>
    );
  }

  return (
    <div className="form-grid one">
      <section className="panel assignment-customer-summary">
        <h2 ref={headingRef} tabIndex={-1}>
          {t.memberships.customer}
        </h2>
        <dl className="detail-list customer-account-list">
          <div>
            <dt>{t.csaCustomers.name}</dt>
            <dd>{customer.name || "—"}</dd>
          </div>
          <div>
            <dt>{t.csaCustomers.phone}</dt>
            <dd>{customer.phone || "—"}</dd>
          </div>
          <div>
            <dt>{t.csaCustomers.websiteAccount}</dt>
            <dd>
              <span className={`badge ${customer.user ? "customer-account-linked" : "warm"}`}>
                {customer.user ? t.memberships.linkedCustomer : t.memberships.managedCustomer}
              </span>
            </dd>
          </div>
          <div>
            <dt>{t.csaCustomers.province}</dt>
            <dd>{provinceName || "—"}</dd>
          </div>
          <div>
            <dt>{t.csaCustomers.ward}</dt>
            <dd>{wardName || "—"}</dd>
          </div>
          <div>
            <dt>{t.csaCustomers.deliveryAddress}</dt>
            <dd>{customer.address || "—"}</dd>
          </div>
        </dl>
      </section>
      <section className="panel assignment-fields" aria-busy={packagesLoading}>
        <h2>{t.memberships.assignmentDetails}</h2>
        {formError && (
          <div className="error-box" role="alert">
            <p>{formError}</p>
          </div>
        )}
        {packagesError && (
          <p className="error-box" role="alert">
            {packagesError}
          </p>
        )}
        {packagesLoading && <p>{t.memberships.loadingPackages}</p>}
        {packages?.length === 0 && <p className="empty compact">{t.memberships.noPackages}</p>}
        {packages && (
          <div className="assignment-package-results" role="radiogroup">
            {packages.map((item) => {
              const activeOptions = item.price_options.filter((option) => option.is_active);
              const selectable = item.is_active && activeOptions.length > 0;
              const translation = localizedCatalogTranslation(item.translations, locale);
              const packageName = translation?.name || item.name;
              const packageDescription = translation?.description || item.description;
              return (
                <label
                  className={`assignment-package ${selectedPackage?.id === item.id ? "selected" : ""} ${selectable ? "" : "disabled"}`}
                  key={item.id}
                >
                  <input
                    checked={selectedPackage?.id === item.id}
                    disabled={!selectable}
                    name="membership-package"
                    onChange={() => {
                      setSelectedPackage(item);
                      setPriceOptionId("");
                      setFormError("");
                    }}
                    type="radio"
                  />
                  <span>
                    <strong>{packageName}</strong>
                    {packageDescription && <small>{packageDescription}</small>}
                    {selectable ? (
                      activeOptions.map((option) => (
                        <small key={option.id}>
                          {t.membershipCatalog.priceOptionSummary
                            .replace("{months}", String(option.duration_months))
                            .replace(
                              "{price}",
                              formatMembershipMoney(option.monthly_price_vnd, locale),
                            )}{" "}
                          · {t.membershipCatalog.totalPreview}:{" "}
                          {formatMembershipMoney(option.total_price_vnd, locale)}
                        </small>
                      ))
                    ) : (
                      <small className="field-error">{t.memberships.packageNoActiveOptions}</small>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className="form-grid one assignment-order-fields">
          <label className="field">
            <span>{t.memberships.priceOption} *</span>
            <select
              className="input"
              disabled={!selectedPackageIsValid}
              value={priceOptionId}
              onChange={(e) => {
                setPriceOptionId(e.target.value);
                setFormError("");
              }}
            >
              <option value="">{t.memberships.choosePriceOption}</option>
              {options.map((option) => (
                <option value={option.id} key={option.id}>
                  {t.membershipCatalog.priceOptionSummary
                    .replace("{months}", String(option.duration_months))
                    .replace("{price}", formatMembershipMoney(option.monthly_price_vnd, locale))}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t.memberships.orderReference}</span>
            <input
              aria-describedby={orderReferenceError ? ORDER_REFERENCE_ERROR_ID : undefined}
              aria-invalid={Boolean(orderReferenceError)}
              aria-label={t.memberships.orderReference}
              className="input"
              maxLength={120}
              ref={orderReferenceRef}
              required
              value={orderReference}
              onBlur={() => {
                if (!orderReference.trim()) {
                  setOrderReferenceError(t.memberships.orderReferenceRequired);
                }
              }}
              onChange={(e) => {
                setOrderReference(e.target.value);
                setOrderReferenceError("");
              }}
            />
            {orderReferenceError ? (
              <small className="field-error" id={ORDER_REFERENCE_ERROR_ID} role="alert">
                {orderReferenceError}
              </small>
            ) : (
              <small>{t.memberships.orderReferenceHelp}</small>
            )}
          </label>
          <div className="field">
            <label htmlFor="membership-start-date">{t.memberships.startDate}</label>
            <AdminDateInput
              aria-describedby={
                startDateInvalid || startDateBeforeMinimum || overlaps
                  ? START_DATE_ERROR_ID
                  : undefined
              }
              aria-invalid={startDateInvalid || startDateBeforeMinimum || overlaps}
              className="input"
              disabled={!selectedOption}
              id="membership-start-date"
              onValueChange={(value) => {
                setStartDateInput(value);
                setFormError("");
              }}
              pickerLabel={t.memberships.openStartDatePicker}
              pickerMin={suggestedStart}
              value={startDateInput}
            />
            <small>
              {t.memberships.suggestedStartDate.replace("{date}", formatAdminDate(suggestedStart))}
            </small>
            {(startDateInvalid || startDateBeforeMinimum || overlaps) && (
              <small className="field-error" id={START_DATE_ERROR_ID} role="alert">
                {startDateInvalid
                  ? t.memberships.invalidStartDate
                  : startDateBeforeMinimum
                    ? t.memberships.startDateMinimum.replace(
                        "{date}",
                        formatAdminDate(suggestedStart),
                      )
                    : t.csaCustomers.overlapConflict}
              </small>
            )}
          </div>
          {selectedOption && exclusiveEnd && (
            <div className={`schedule-preview ${overlaps ? "invalid" : ""}`} role="status">
              <span>{t.csaCustomers.schedulePreview}</span>
              <strong>
                {formatAdminDate(startDate)} →{" "}
                {formatAdminDate(membershipLastReceiptDate(exclusiveEnd))}
              </strong>
              <small>
                {overlaps ? t.csaCustomers.overlapConflict : t.csaCustomers.manualSchedule}
              </small>
            </div>
          )}
        </div>
      </section>
      <section className="panel assignment-membership-history">
        <h2>{t.csaCustomers.existingPackages}</h2>
        {existingMemberships.length > 0 ? (
          <div className="assignment-existing-packages">
            {existingMemberships.map((membership) => (
              <span key={membership.id}>
                {membership.package_name} · {formatAdminDate(membership.start_date)} –{" "}
                {formatAdminDate(membershipLastReceiptDate(membership.end_date))}
              </span>
            ))}
          </div>
        ) : (
          <p className="empty compact">{t.csaCustomers.noHistory}</p>
        )}
      </section>
      <div className="form-actions">
        <button
          className="button"
          disabled={!formReady || saving}
          onClick={() => validate() && setConfirmOpen(true)}
          type="button"
        >
          {t.memberships.confirmAssignment}
        </button>
      </div>
      {confirmOpen && selectedPackage && selectedOption && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={t.memberships.assigning}
          cancelLabel={t.memberships.cancel}
          confirmLabel={t.memberships.confirmAssignment}
          error={formError}
          fallbackFocusRef={headingRef}
          onCancel={() => !saving && setConfirmOpen(false)}
          onConfirm={assign}
          title={t.memberships.assignmentDialogTitle}
        >
          <dl className="detail-list">
            <div>
              <dt>{t.memberships.customer}</dt>
              <dd>{customer.name}</dd>
            </div>
            <div>
              <dt>{t.memberships.package}</dt>
              <dd>{selectedPackageName}</dd>
            </div>
            <div>
              <dt>{t.memberships.priceOption}</dt>
              <dd>{formatMembershipMoney(selectedOption.total_price_vnd, locale)}</dd>
            </div>
            <div>
              <dt>{t.memberships.startDate}</dt>
              <dd>{formatAdminDate(startDate)}</dd>
            </div>
          </dl>
        </ConfirmationDialog>
      )}
    </div>
  );
}
