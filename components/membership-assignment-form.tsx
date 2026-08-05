"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import type {
  AdminMembership,
  AdminUserListItem,
  MembershipPackage,
  PaginationMeta,
} from "@/lib/types";

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

type AssignmentError = Error & { status?: number };

export function MembershipAssignmentForm() {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const submitRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const userRequestId = useRef(0);
  const packageRequestId = useRef(0);
  const [userQuery, setUserQuery] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [users, setUsers] = useState<AdminUserListItem[] | null>(null);
  const [userMeta, setUserMeta] = useState<PaginationMeta | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [packageQuery, setPackageQuery] = useState("");
  const [packageSearch, setPackageSearch] = useState("");
  const [packagePage, setPackagePage] = useState(1);
  const [packages, setPackages] = useState<MembershipPackage[] | null>(null);
  const [packageMeta, setPackageMeta] = useState<PaginationMeta | null>(null);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<MembershipPackage | null>(null);
  const [priceOptionId, setPriceOptionId] = useState("");
  const [farmbriteReference, setFarmbriteReference] = useState("");
  const [startDate, setStartDate] = useState(todayInVietnam);
  const [formError, setFormError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = ++packageRequestId.current;
    setPackagesLoading(true);
    setPackagesError("");
    const params = new URLSearchParams({ active: "true", page: String(packagePage) });
    if (packageSearch) params.set("search", packageSearch);
    apiEnvelope<MembershipPackage[], PaginationMeta>(`admin/membership-packages?${params}`, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (controller.signal.aborted || currentRequest !== packageRequestId.current) return;
        setPackages(payload.data.filter((item) => item.is_active));
        setPackageMeta(payload.meta ?? null);
      })
      .catch((caught) => {
        if (controller.signal.aborted || currentRequest !== packageRequestId.current) return;
        setPackagesError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!controller.signal.aborted && currentRequest === packageRequestId.current) {
          setPackagesLoading(false);
        }
      });
    return () => {
      controller.abort();
      if (currentRequest === packageRequestId.current) packageRequestId.current += 1;
    };
  }, [packagePage, packageSearch, t]);

  useEffect(() => {
    if (!userSearch) return;
    const controller = new AbortController();
    const currentRequest = ++userRequestId.current;
    setUsersLoading(true);
    setUsersError("");
    const params = new URLSearchParams({ page: String(userPage), search: userSearch });
    apiEnvelope<AdminUserListItem[], PaginationMeta>(`admin/users?${params}`, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (controller.signal.aborted || currentRequest !== userRequestId.current) return;
        setUsers(payload.data);
        setUserMeta(payload.meta ?? null);
      })
      .catch((caught) => {
        if (controller.signal.aborted || currentRequest !== userRequestId.current) return;
        setUsersError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!controller.signal.aborted && currentRequest === userRequestId.current) {
          setUsersLoading(false);
        }
      });
    return () => {
      controller.abort();
      if (currentRequest === userRequestId.current) userRequestId.current += 1;
    };
  }, [t, userPage, userSearch]);

  const activeOptions = useMemo(
    () => selectedPackage?.price_options.filter((option) => option.is_active) ?? [],
    [selectedPackage],
  );
  const selectedOption = activeOptions.find((option) => option.id === priceOptionId);

  function searchUsers(event: FormEvent) {
    event.preventDefault();
    if (!userQuery.trim()) return;
    setUserPage(1);
    setUserSearch(userQuery.trim());
  }

  function searchPackages(event: FormEvent) {
    event.preventDefault();
    setPackagePage(1);
    setPackageSearch(packageQuery.trim());
  }

  function validate() {
    if (
      !selectedUser ||
      !selectedPackage ||
      !priceOptionId ||
      !farmbriteReference.trim() ||
      !startDate
    ) {
      setFormError(t.memberships.assignmentRequired);
      return false;
    }
    if (startDate < todayInVietnam()) {
      setFormError(t.memberships.startDatePast);
      return false;
    }
    setFormError("");
    return true;
  }

  async function assign() {
    if (submitRef.current || !validate() || !selectedUser || !selectedPackage) return;
    submitRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const membership = await api<AdminMembership>(`admin/memberships?locale=${locale}`, {
        method: "POST",
        body: JSON.stringify({
          user_id: selectedUser.id,
          package_id: selectedPackage.id,
          price_option_id: priceOptionId,
          start_date: startDate,
          farmbrite_order_reference: farmbriteReference.trim(),
        }),
      });
      toast(t.memberships.assignmentCreated);
      router.replace(`/memberships/${membership.id}`);
    } catch (caught) {
      const error = caught as AssignmentError;
      const message =
        error.message === "duplicate_farmbrite_order_reference"
          ? t.memberships.duplicateFarmbriteReference
          : error.message === "active_membership_exists"
            ? t.memberships.activeMembershipConflict
            : error.message === "price_option_unavailable"
              ? t.memberships.inactivePriceConflict
              : error.message === "package_unavailable"
                ? t.memberships.packageUnavailable
                : requestErrorMessage(caught, t);
      setFormError(message);
      setConfirmOpen(false);
    } finally {
      submitRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="assignment-layout">
      <section className="panel assignment-user-search" aria-busy={usersLoading}>
        <h2 ref={headingRef} tabIndex={-1}>
          {t.memberships.chooseCustomer}
        </h2>
        <form
          aria-label={t.memberships.userSearchLabel}
          className="list-toolbar"
          onSubmit={searchUsers}
          role="search"
        >
          <label className="field">
            <span>{t.memberships.userSearchLabel}</span>
            <input
              className="input"
              disabled={saving}
              onChange={(event) => setUserQuery(event.target.value)}
              placeholder={t.memberships.userSearchPlaceholder}
              type="search"
              value={userQuery}
            />
          </label>
          <button className="button secondary" disabled={saving || !userQuery.trim()}>
            {usersLoading ? t.memberships.searching : t.memberships.search}
          </button>
        </form>
        {usersError && (
          <p className="error-box" role="alert">
            {usersError}
          </p>
        )}
        {selectedUser && (
          <div className="assignment-selection-summary" aria-live="polite">
            <small>{t.memberships.selectedCustomer}</small>
            <strong>{selectedUser.name}</strong>
            <span>
              {selectedUser.email} · {selectedUser.phone || "—"}
            </span>
          </div>
        )}
        {users && !users.length && <p className="empty compact">{t.memberships.noUsers}</p>}
        {users && users.length > 0 && (
          <div
            className="assignment-user-results"
            role="radiogroup"
            aria-label={t.memberships.chooseCustomer}
          >
            {users.map((user) => (
              <label
                className={`assignment-user ${selectedUser?.id === user.id ? "selected" : ""}`}
                key={user.id}
              >
                <input
                  checked={selectedUser?.id === user.id}
                  disabled={saving}
                  name="membership-user"
                  onChange={() => setSelectedUser(user)}
                  type="radio"
                />
                <span>
                  <strong>{user.name}</strong>
                  <small>
                    {user.email} · {user.phone || "—"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        )}
        {userMeta && (
          <Pagination
            disabled={usersLoading || saving}
            nextLabel={t.common.next}
            onPage={setUserPage}
            page={userMeta.page}
            pageSize={userMeta.page_size}
            previousLabel={t.common.previous}
            summary={t.common.pagination}
            total={userMeta.total}
          />
        )}
      </section>
      <section className="panel assignment-fields" aria-busy={packagesLoading}>
        <h2>{t.memberships.assignmentDetails}</h2>
        {formError && (
          <p className="error-box" role="alert">
            {formError}
          </p>
        )}
        {packagesError && (
          <p className="error-box" role="alert">
            {packagesError}
          </p>
        )}
        <form
          aria-label={t.memberships.packageSearchLabel}
          className="list-toolbar"
          onSubmit={searchPackages}
          role="search"
        >
          <label className="field">
            <span>{t.memberships.packageSearchLabel}</span>
            <input
              className="input"
              disabled={saving}
              onChange={(event) => setPackageQuery(event.target.value)}
              placeholder={t.memberships.packageSearchPlaceholder}
              type="search"
              value={packageQuery}
            />
          </label>
          <button className="button secondary" disabled={saving}>
            {packagesLoading ? t.memberships.searching : t.memberships.search}
          </button>
        </form>
        {selectedPackage && (
          <div className="assignment-selection-summary" aria-live="polite">
            <small>{t.memberships.selectedPackage}</small>
            <strong>{selectedPackage.name}</strong>
            <span>{selectedPackage.description || "—"}</span>
          </div>
        )}
        {packages && !packages.length && (
          <p className="empty compact">{t.memberships.noPackages}</p>
        )}
        {packages && packages.length > 0 && (
          <div
            className="assignment-package-results"
            role="radiogroup"
            aria-label={t.memberships.choosePackage}
          >
            {packages.map((item) => (
              <label
                className={`assignment-package ${selectedPackage?.id === item.id ? "selected" : ""}`}
                key={item.id}
              >
                <input
                  checked={selectedPackage?.id === item.id}
                  disabled={saving}
                  name="membership-package"
                  onChange={() => {
                    setSelectedPackage(item);
                    setPriceOptionId("");
                  }}
                  type="radio"
                />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.description || "—"}</small>
                </span>
              </label>
            ))}
          </div>
        )}
        {packageMeta && (
          <Pagination
            disabled={packagesLoading || saving}
            nextLabel={t.common.next}
            onPage={setPackagePage}
            page={packageMeta.page}
            pageSize={packageMeta.page_size}
            previousLabel={t.common.previous}
            summary={t.common.pagination}
            total={packageMeta.total}
          />
        )}
        <div className="form-grid one assignment-order-fields">
          <label className="field">
            <span>{t.memberships.priceOption} *</span>
            <select
              className="input"
              disabled={saving || !selectedPackage}
              onChange={(event) => setPriceOptionId(event.target.value)}
              value={priceOptionId}
            >
              <option value="">{t.memberships.choosePriceOption}</option>
              {activeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {t.membershipCatalog.priceOptionSummary
                    .replace("{months}", String(option.duration_months))
                    .replace("{price}", formatMembershipMoney(option.monthly_price_vnd, locale))}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t.memberships.farmbriteReference} *</span>
            <input
              className="input"
              disabled={saving}
              maxLength={120}
              onChange={(event) => setFarmbriteReference(event.target.value)}
              value={farmbriteReference}
            />
          </label>
          <label className="field">
            <span>{t.memberships.startDate} *</span>
            <input
              className="input"
              disabled={saving}
              min={todayInVietnam()}
              onChange={(event) => setStartDate(event.target.value)}
              type="date"
              value={startDate}
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            className="button"
            disabled={saving}
            onClick={() => validate() && setConfirmOpen(true)}
            type="button"
          >
            {t.memberships.reviewAssignment}
          </button>
        </div>
      </section>
      {confirmOpen && selectedUser && selectedPackage && selectedOption && (
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
          <dl className="detail-list assignment-confirmation">
            <div>
              <dt>{t.memberships.customer}</dt>
              <dd>{selectedUser.name}</dd>
            </div>
            <div>
              <dt>{t.memberships.package}</dt>
              <dd>{selectedPackage.name}</dd>
            </div>
            <div>
              <dt>{t.memberships.priceOption}</dt>
              <dd>
                {selectedOption.duration_months} ·{" "}
                {formatMembershipMoney(selectedOption.total_price_vnd, locale)}
              </dd>
            </div>
            <div>
              <dt>{t.memberships.farmbriteReference}</dt>
              <dd>{farmbriteReference.trim()}</dd>
            </div>
            <div>
              <dt>{t.memberships.startDate}</dt>
              <dd>{startDate}</dd>
            </div>
          </dl>
          <p className="notice-box">{t.memberships.assignNewAfterRevoke}</p>
        </ConfirmationDialog>
      )}
    </div>
  );
}
