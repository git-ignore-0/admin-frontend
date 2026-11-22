"use client";

import { Button, TextInput, Alert } from "@mantine/core";
import { FormInput, FormSelect, FormField } from "@/components/nfv-controls";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { acceptPhoneInput, normalizeVietnamPhone } from "@/lib/csa-customer-input";
import { getSupportedShippingAreas } from "@/lib/shipping-areas";
import type { CSACustomer, SupportedShippingProvince } from "@/lib/types";

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

export function CSACustomerForm() {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const submitRef = useRef(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState<CustomerFields>(EMPTY_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [shippingAreas, setShippingAreas] = useState<SupportedShippingProvince[]>([]);
  const [shippingAreasLoading, setShippingAreasLoading] = useState(true);
  const [addressError, setAddressError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setShippingAreasLoading(true);
    setAddressError("");
    getSupportedShippingAreas(locale, controller.signal)
      .then(setShippingAreas)
      .catch((caught) => {
        if (!controller.signal.aborted) setAddressError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!controller.signal.aborted) setShippingAreasLoading(false);
      });
    return () => controller.abort();
  }, [locale, t]);

  function updateField<K extends keyof CustomerFields>(field: K, value: CustomerFields[K]) {
    setFields((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validateFields(): FieldErrors {
    const next: FieldErrors = {};
    if (!fields.name.trim()) next.name = t.csaCustomers.nameRequired;
    if (!fields.phone.trim()) next.phone = t.csaCustomers.phoneRequired;
    else if (!normalizeVietnamPhone(fields.phone)) next.phone = t.csaCustomers.invalidPhone;
    const province = shippingAreas.find((item) => item.code === fields.province);
    if (!province) next.province = t.csaCustomers.provinceRequired;
    if (!fields.ward || !province?.wards.some((item) => item.code === fields.ward)) {
      next.ward = t.csaCustomers.wardRequired;
    }
    if (!fields.address.trim()) next.address = t.csaCustomers.addressRequired;
    return next;
  }

  function errorMessage(caught: unknown) {
    const code = caught instanceof Error ? caught.message : "";
    return code === "invalid_csa_customer_phone"
      ? t.csaCustomers.invalidPhone
      : code === "csa_customer_shipping_area_unsupported"
        ? t.csaCustomers.shippingAreaUnsupported
        : code === "invalid_csa_customer_address"
          ? t.csaCustomers.invalidAddress
          : requestErrorMessage(caught, t);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitRef.current) return;
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
      };
      const saved = await api<CSACustomer>("admin/csa-customers", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast(t.csaCustomers.created);
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

  const provinces = shippingAreas;
  const wards = shippingAreas.find((item) => item.code === fields.province)?.wards ?? [];

  return (
    <form aria-busy={saving} className="customer-onboarding" noValidate onSubmit={submit}>
      {error && (
        <Alert color="red" className="customer-form-error" role="alert">
          {error}
        </Alert>
      )}
      <section className="panel customer-form-step">
        <div className="customer-details-fields">
          <div className="form-grid customer-contact-fields">
            <label className="field">
              <span>{t.csaCustomers.name} *</span>
              <FormInput
                aria-describedby={fieldErrors.name ? "customer-name-error" : undefined}
                aria-invalid={Boolean(fieldErrors.name)}
                autoComplete="name"

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
              <TextInput
                error={Boolean(fieldErrors.phone)}
                attributes={{
                  input: {
                    "aria-describedby": fieldErrors.phone ? CUSTOMER_PHONE_ERROR_ID : undefined,
                  },
                }}
                aria-describedby={fieldErrors.phone ? CUSTOMER_PHONE_ERROR_ID : undefined}
                aria-invalid={Boolean(fieldErrors.phone)}
                autoComplete="tel"

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
            <FormField label={t.csaCustomers.province + " *"} className="field">
              <FormSelect
                aria-describedby={fieldErrors.province ? "customer-province-error" : undefined}
                aria-invalid={Boolean(fieldErrors.province)}
                autoComplete="address-level1"
                disabled={shippingAreasLoading}
                value={fields.province}
                onChange={(selectedValue) => {
                  updateField("province", selectedValue ?? "");
                  updateField("ward", "");
                }}
                data={[
                  {
                    value: "",
                    label: shippingAreasLoading
                      ? t.csaCustomers.loadingProvinces
                      : t.csaCustomers.chooseProvince,
                  },
                  ...(provinces.map((item) => ({ value: item.code, label: item.name })) ?? []),
                ]}
              />
              {fieldErrors.province && (
                <small className="field-error" id="customer-province-error">
                  {fieldErrors.province}
                </small>
              )}
            </FormField>
            <FormField label={t.csaCustomers.ward + " *"} className="field">
              <FormSelect
                aria-describedby={fieldErrors.ward ? "customer-ward-error" : undefined}
                aria-invalid={Boolean(fieldErrors.ward)}
                autoComplete="address-level2"
                disabled={!fields.province || Boolean(addressError)}
                value={fields.ward}
                onChange={(selectedValue) => updateField("ward", selectedValue ?? "")}
                data={[
                  { value: "", label: t.csaCustomers.chooseWard },
                  ...(wards.map((item) => ({ value: item.code, label: item.name })) ?? []),
                ]}
              />
              {fieldErrors.ward && (
                <small className="field-error" id="customer-ward-error">
                  {fieldErrors.ward}
                </small>
              )}
            </FormField>
            <label className="field form-grid-full">
              <span>{t.csaCustomers.deliveryAddress} *</span>
              <FormInput
                aria-describedby={fieldErrors.address ? "customer-address-error" : undefined}
                aria-invalid={Boolean(fieldErrors.address)}
                autoComplete="address-line1"

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
      </section>
      <div className="customer-sticky-actions">
        <Button
          type="submit"

          disabled={saving || shippingAreasLoading || Boolean(addressError)}
        >
          {saving ? t.csaCustomers.saving : t.csaCustomers.create}
        </Button>
      </div>
    </form>
  );
}
