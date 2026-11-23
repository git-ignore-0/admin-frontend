"use client";

import {
  Alert,
  Button,
  Fieldset,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { FormSelect } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
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
  note: string;
};
type FieldErrors = Partial<Record<keyof CustomerFields, string>>;

const EMPTY_FIELDS: CustomerFields = {
  name: "",
  phone: "",
  province: "",
  ward: "",
  address: "",
  note: "",
};

export function CSACustomerForm() {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const submitRef = useRef(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const focusPhoneOnConflict = useRef(false);
  const [fields, setFields] = useState<CustomerFields>(EMPTY_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [shippingAreas, setShippingAreas] = useState<SupportedShippingProvince[]>([]);
  const [shippingAreasLoading, setShippingAreasLoading] = useState(true);
  const [addressError, setAddressError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saving || !focusPhoneOnConflict.current) return;
    focusPhoneOnConflict.current = false;
    phoneRef.current?.focus();
  }, [saving, fieldErrors.phone]);

  useEffect(() => {
    const controller = new AbortController();
    setShippingAreasLoading(true);
    setAddressError("");
    getSupportedShippingAreas(locale, controller.signal)
      .then((areas) => {
        if (!controller.signal.aborted) setShippingAreas(areas);
      })
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
        note: fields.note.trim(),
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
        focusPhoneOnConflict.current = true;
        setError("");
        setFieldErrors((current) => ({ ...current, phone: t.csaCustomers.duplicatePhone }));
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      submitRef.current = false;
      setSaving(false);
    }
  }

  const wards = shippingAreas.find((item) => item.code === fields.province)?.wards ?? [];
  const copy = t.csaCustomers;

  return (
    <>
      <PageHeading title={copy.createTitle} visuallyHiddenTitle />
      <Paper
        component="form"
        withBorder
        p="md"
        w="100%"
        maw={760}
        aria-busy={saving}
        noValidate
        onSubmit={submit}
      >
        <Stack gap="lg">
          <Fieldset
            legend={t.users.contactDetails}
            variant="unstyled"
            styles={{ legend: { fontWeight: 600 } }}
            disabled={saving}
            miw={0}
          >
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label={copy.name}
                error={fieldErrors.name}
                required
                autoComplete="name"
                maxLength={150}
                value={fields.name}
                onChange={(event) => updateField("name", event.currentTarget.value)}
              />
              <TextInput
                ref={phoneRef}
                label={copy.phone}
                error={fieldErrors.phone}
                errorProps={{ role: "alert" }}
                required
                autoComplete="tel"
                inputMode="tel"
                maxLength={13}
                type="tel"
                value={fields.phone}
                onChange={(event) => {
                  const accepted = acceptPhoneInput(event.currentTarget.value);
                  if (accepted !== null) updateField("phone", accepted);
                }}
              />
            </SimpleGrid>
          </Fieldset>
          <Fieldset
            legend={copy.addressSection}
            variant="unstyled"
            styles={{ legend: { fontWeight: 600 } }}
            disabled={saving}
            miw={0}
          >
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <FormSelect
                  label={copy.province}
                  error={fieldErrors.province}
                  required
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
                      label: shippingAreasLoading ? copy.loadingProvinces : copy.chooseProvince,
                    },
                    ...shippingAreas.map((item) => ({ value: item.code, label: item.name })),
                  ]}
                />
                <FormSelect
                  label={copy.ward}
                  error={fieldErrors.ward}
                  required
                  autoComplete="address-level2"
                  disabled={shippingAreasLoading || !fields.province || Boolean(addressError)}
                  value={fields.ward}
                  onChange={(selectedValue) => updateField("ward", selectedValue ?? "")}
                  data={[
                    { value: "", label: copy.chooseWard },
                    ...wards.map((item) => ({ value: item.code, label: item.name })),
                  ]}
                />
              </SimpleGrid>
              <TextInput
                label={copy.deliveryAddress}
                error={fieldErrors.address}
                required
                autoComplete="address-line1"
                maxLength={500}
                placeholder={copy.addressPlaceholder}
                value={fields.address}
                onChange={(event) => updateField("address", event.currentTarget.value)}
              />
              <Textarea
                label={copy.note}
                maxLength={1000}
                value={fields.note}
                onChange={(event) => updateField("note", event.currentTarget.value)}
              />
              {addressError && (
                <Alert color="danger" role="alert">
                  {addressError}
                </Alert>
              )}
            </Stack>
          </Fieldset>
          {error && (
            <Alert color="danger" role="alert">
              {error}
            </Alert>
          )}
          <Group component="footer" justify="flex-end">
            <Button
              type="submit"
              loading={saving}
              disabled={shippingAreasLoading || Boolean(addressError)}
            >
              {saving ? copy.saving : copy.create}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </>
  );
}
