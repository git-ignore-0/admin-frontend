"use client";

import { FormEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { getAdministrativeProvinces, getAdministrativeWards } from "@/lib/administrative-units";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { acceptPhoneInput, normalizeVietnamPhone } from "@/lib/csa-customer-input";
import type {
  AdministrativeUnit,
  AdminUserListItem,
  CSACustomer,
  PaginationMeta,
} from "@/lib/types";

type CustomerMode = "managed" | "linked";
type CustomerFields = {
  name: string;
  phone: string;
  province: string;
  ward: string;
  address: string;
};
type FieldErrors = Partial<Record<keyof CustomerFields, string>>;

const EMPTY_FIELDS: CustomerFields = {
  name: "",
  phone: "",
  province: "",
  ward: "",
  address: "",
};

const CUSTOMER_PHONE_ERROR_ID = "customer-phone-error";

function fieldsFromUser(user: AdminUserListItem): CustomerFields {
  return {
    name: user.name || "",
    phone: user.phone || "",
    province: user.province_code || "",
    ward: user.ward_code || "",
    address: user.address || "",
  };
}

function userHasCompleteCustomerDetails(user: AdminUserListItem): boolean {
  return Boolean(
    user.name.trim() &&
    normalizeVietnamPhone(user.phone) &&
    user.province_code.trim() &&
    user.ward_code.trim() &&
    user.address.trim(),
  );
}

export function CSACustomerForm({ customerId }: { customerId?: string }) {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const submitRef = useRef(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const searchRequest = useRef(0);
  const [loaded, setLoaded] = useState(!customerId);
  const [mode, setMode] = useState<CustomerMode>("managed");
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<AdminUserListItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [fields, setFields] = useState<CustomerFields>(EMPTY_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [provinces, setProvinces] = useState<AdministrativeUnit[]>([]);
  const [wards, setWards] = useState<AdministrativeUnit[]>([]);
  const [provincesLoading, setProvincesLoading] = useState(true);
  const [wardsLoading, setWardsLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setProvincesLoading(true);
    setAddressError("");
    getAdministrativeProvinces(locale, controller.signal)
      .then(setProvinces)
      .catch((caught) => {
        if (!controller.signal.aborted) setAddressError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!controller.signal.aborted) setProvincesLoading(false);
      });
    return () => controller.abort();
  }, [locale, t]);

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    api<CSACustomer>(`admin/csa-customers/${customerId}`, { signal: controller.signal })
      .then((item) => {
        setFields({
          name: item.name,
          phone: item.phone || "",
          province: item.province_code || "",
          ward: item.ward_code || "",
          address: item.address || "",
        });
        setLoaded(true);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(requestErrorMessage(caught, t));
      });
    return () => controller.abort();
  }, [customerId, t]);

  useEffect(() => {
    if (!fields.province) {
      setWards([]);
      setWardsLoading(false);
      return;
    }
    const controller = new AbortController();
    setWardsLoading(true);
    setAddressError("");
    getAdministrativeWards(fields.province, locale, controller.signal)
      .then(setWards)
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setWards([]);
          setAddressError(requestErrorMessage(caught, t));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setWardsLoading(false);
      });
    return () => controller.abort();
  }, [fields.province, locale, t]);

  async function findUsers(event: SyntheticEvent) {
    event.preventDefault();
    const query = userQuery.trim();
    if (!query) return;
    const id = ++searchRequest.current;
    setSearching(true);
    setError("");
    try {
      const result = await apiEnvelope<AdminUserListItem[], PaginationMeta>(
        `admin/users?page=1&search=${encodeURIComponent(query)}`,
      );
      if (id === searchRequest.current) setUsers(result.data);
    } catch (caught) {
      if (id === searchRequest.current) setError(requestErrorMessage(caught, t));
    } finally {
      if (id === searchRequest.current) setSearching(false);
    }
  }

  function chooseMode(nextMode: CustomerMode) {
    setMode(nextMode);
    setSelectedUser(null);
    setFields(EMPTY_FIELDS);
    setFieldErrors({});
    setError("");
  }

  function chooseUser(user: AdminUserListItem) {
    if (user.has_csa_customer) return;
    setSelectedUser(user);
    setFields(fieldsFromUser(user));
    setFieldErrors({});
    setError("");
  }

  function updateField<K extends keyof CustomerFields>(field: K, value: CustomerFields[K]) {
    setFields((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validateFields(): FieldErrors {
    const next: FieldErrors = {};
    if (!fields.name.trim()) next.name = t.csaCustomers.nameRequired;
    if (!fields.phone.trim()) next.phone = t.csaCustomers.phoneRequired;
    else if (!normalizeVietnamPhone(fields.phone)) next.phone = t.csaCustomers.invalidPhone;
    if (!fields.province) next.province = t.csaCustomers.provinceRequired;
    if (!fields.ward) next.ward = t.csaCustomers.wardRequired;
    if (!fields.address.trim()) next.address = t.csaCustomers.addressRequired;
    return next;
  }

  function errorMessage(caught: unknown) {
    const code = caught instanceof Error ? caught.message : "";
    return code === "csa_customer_user_exists"
      ? t.csaCustomers.userExists
      : code === "invalid_csa_customer_phone"
        ? t.csaCustomers.invalidPhone
        : code === "invalid_csa_customer_address"
          ? t.csaCustomers.invalidAddress
          : requestErrorMessage(caught, t);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitRef.current) return;
    if (!customerId && mode === "linked" && !selectedUser) {
      setError(t.csaCustomers.selectUserRequired);
      return;
    }
    const invalid = validateFields();
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) {
      setError(t.csaCustomers.formIncomplete);
      return;
    }
    const normalizedPhone = normalizeVietnamPhone(fields.phone);
    if (!normalizedPhone) return;
    submitRef.current = true;
    setSaving(true);
    setError("");
    try {
      const body = {
        name: fields.name.trim(),
        phone: normalizedPhone,
        province_code: fields.province,
        ward_code: fields.ward,
        address: fields.address.trim(),
        ...(!customerId && selectedUser ? { user_id: selectedUser.id } : {}),
      };
      const saved = await api<CSACustomer>(
        customerId ? `admin/csa-customers/${customerId}` : "admin/csa-customers",
        { method: customerId ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      toast(customerId ? t.csaCustomers.updated : t.csaCustomers.created);
      router.replace(`/csa-customers/${saved.id}`);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      if (code === "csa_customer_phone_exists") {
        setError("");
        setFieldErrors((current) => ({ ...current, phone: t.csaCustomers.duplicatePhone }));
        window.setTimeout(() => phoneRef.current?.focus(), 0);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      submitRef.current = false;
      setSaving(false);
    }
  }

  if (!loaded) return <div className="panel">{error || t.csaCustomers.detailLoading}</div>;

  const showFields = Boolean(
    customerId ||
    mode === "managed" ||
    (selectedUser && !userHasCompleteCustomerDetails(selectedUser)) ||
    fieldErrors.phone,
  );
  const provinceName =
    provinces.find((item) => item.code === fields.province)?.name || fields.province || "—";
  const wardName = wards.find((item) => item.code === fields.ward)?.name || fields.ward || "—";

  return (
    <form aria-busy={saving} className="customer-onboarding" noValidate onSubmit={submit}>
      {error && (
        <p className="error-box customer-form-error" role="alert">
          {error}
        </p>
      )}
      <section className="panel customer-form-step">
        {!customerId && (
          <fieldset className="customer-mode">
            <legend>{t.csaCustomers.accountMode}</legend>
            <label>
              <input
                checked={mode === "managed"}
                name="mode"
                onChange={() => chooseMode("managed")}
                type="radio"
              />
              <span>{t.csaCustomers.managedMode}</span>
            </label>
            <label>
              <input
                checked={mode === "linked"}
                name="mode"
                onChange={() => chooseMode("linked")}
                type="radio"
              />
              <span>{t.csaCustomers.linkedMode}</span>
            </label>
          </fieldset>
        )}

        {!customerId && mode === "linked" && (
          <div className="customer-user-picker">
            <div className="inline-search">
              <label className="field">
                <span>{t.csaCustomers.findUser}</span>
                <input
                  autoComplete="email"
                  className="input"
                  placeholder={t.csaCustomers.userPlaceholder}
                  type="search"
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                />
              </label>
              <button
                className="button secondary"
                disabled={searching || !userQuery.trim()}
                onClick={(event) => void findUsers(event)}
                type="button"
              >
                {searching ? t.csaCustomers.searching : t.csaCustomers.search}
              </button>
            </div>
            {users?.length === 0 && <p className="empty compact">{t.csaCustomers.noUsers}</p>}
            {users && (
              <div
                aria-label={t.csaCustomers.selectedUser}
                className="assignment-user-results"
                role="radiogroup"
              >
                {users.map((user) => {
                  const unavailable = user.has_csa_customer;
                  const complete = userHasCompleteCustomerDetails(user);
                  return (
                    <label
                      className={`assignment-user ${selectedUser?.id === user.id ? "selected" : ""} ${unavailable ? "disabled" : ""}`}
                      key={user.id}
                    >
                      <input
                        checked={selectedUser?.id === user.id}
                        disabled={unavailable}
                        name="customer-user"
                        onChange={() => chooseUser(user)}
                        type="radio"
                      />
                      <span>
                        <strong>{user.name || user.email}</strong>
                        <small>
                          {user.email} · {user.phone || "—"}
                        </small>
                        <small className={unavailable ? "field-error" : "muted-copy"}>
                          {unavailable
                            ? t.csaCustomers.userExists
                            : complete
                              ? t.csaCustomers.userComplete
                              : t.csaCustomers.userIncomplete}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {selectedUser && !showFields && (
          <div className="customer-user-preview" aria-label={t.csaCustomers.userPreview}>
            <h2>{t.csaCustomers.userPreview}</h2>
            <p className="notice-box">{t.csaCustomers.userCompleteHelp}</p>
            <dl className="customer-account-list">
              <div>
                <dt>{t.csaCustomers.name}</dt>
                <dd>{fields.name}</dd>
              </div>
              <div>
                <dt>{t.csaCustomers.websiteAccount}</dt>
                <dd>{selectedUser.email}</dd>
              </div>
              <div>
                <dt>{t.csaCustomers.phone}</dt>
                <dd>{fields.phone}</dd>
              </div>
              <div>
                <dt>{t.csaCustomers.province}</dt>
                <dd>{provinceName}</dd>
              </div>
              <div>
                <dt>{t.csaCustomers.ward}</dt>
                <dd>{wardName}</dd>
              </div>
              <div>
                <dt>{t.csaCustomers.deliveryAddress}</dt>
                <dd>{fields.address}</dd>
              </div>
            </dl>
          </div>
        )}

        {showFields && (
          <div className="customer-details-fields">
            {selectedUser && <p className="notice-box">{t.csaCustomers.userIncompleteHelp}</p>}
            <div className="form-grid customer-contact-fields">
              <label className="field">
                <span>{t.csaCustomers.name} *</span>
                <input
                  aria-describedby={fieldErrors.name ? "customer-name-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.name)}
                  autoComplete="name"
                  className="input"
                  maxLength={150}
                  value={fields.name}
                  onChange={(event) => updateField("name", event.target.value)}
                />
                {fieldErrors.name && (
                  <small className="field-error" id="customer-name-error">
                    {fieldErrors.name}
                  </small>
                )}
              </label>
              <label className="field">
                <span>{t.csaCustomers.phone} *</span>
                <input
                  aria-describedby={fieldErrors.phone ? CUSTOMER_PHONE_ERROR_ID : undefined}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  autoComplete="tel"
                  className="input"
                  inputMode="tel"
                  maxLength={13}
                  ref={phoneRef}
                  type="tel"
                  value={fields.phone}
                  onChange={(event) => {
                    const accepted = acceptPhoneInput(event.target.value);
                    if (accepted !== null) updateField("phone", accepted);
                  }}
                />
                {fieldErrors.phone && (
                  <small className="field-error" id={CUSTOMER_PHONE_ERROR_ID} role="alert">
                    {fieldErrors.phone}
                  </small>
                )}
              </label>
            </div>
            <div className="form-grid customer-address-fields">
              <label className="field">
                <span>{t.csaCustomers.province} *</span>
                <select
                  aria-describedby={fieldErrors.province ? "customer-province-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.province)}
                  autoComplete="address-level1"
                  className="input"
                  disabled={provincesLoading}
                  value={fields.province}
                  onChange={(event) => {
                    updateField("province", event.target.value);
                    updateField("ward", "");
                  }}
                >
                  <option value="">
                    {provincesLoading
                      ? t.csaCustomers.loadingProvinces
                      : t.csaCustomers.chooseProvince}
                  </option>
                  {provinces.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.province && (
                  <small className="field-error" id="customer-province-error">
                    {fieldErrors.province}
                  </small>
                )}
              </label>
              <label className="field">
                <span>{t.csaCustomers.ward} *</span>
                <select
                  aria-describedby={fieldErrors.ward ? "customer-ward-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.ward)}
                  autoComplete="address-level2"
                  className="input"
                  disabled={!fields.province || wardsLoading || Boolean(addressError)}
                  value={fields.ward}
                  onChange={(event) => updateField("ward", event.target.value)}
                >
                  <option value="">
                    {wardsLoading ? t.csaCustomers.loadingWards : t.csaCustomers.chooseWard}
                  </option>
                  {wards.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.ward && (
                  <small className="field-error" id="customer-ward-error">
                    {fieldErrors.ward}
                  </small>
                )}
              </label>
              <label className="field form-grid-full">
                <span>{t.csaCustomers.deliveryAddress} *</span>
                <input
                  aria-describedby={fieldErrors.address ? "customer-address-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.address)}
                  autoComplete="address-line1"
                  className="input"
                  maxLength={500}
                  placeholder={t.csaCustomers.addressPlaceholder}
                  value={fields.address}
                  onChange={(event) => updateField("address", event.target.value)}
                />
                {fieldErrors.address && (
                  <small className="field-error" id="customer-address-error">
                    {fieldErrors.address}
                  </small>
                )}
              </label>
            </div>
            {addressError && (
              <p className="field-error" role="status">
                {addressError}
              </p>
            )}
          </div>
        )}
      </section>
      <div className="customer-sticky-actions">
        <button
          className="button"
          disabled={saving || provincesLoading || wardsLoading || Boolean(addressError)}
        >
          {saving
            ? t.csaCustomers.saving
            : customerId
              ? t.csaCustomers.save
              : t.csaCustomers.create}
        </button>
      </div>
    </form>
  );
}
