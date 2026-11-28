"use client";

import { Select, SimpleGrid, Stack, Text, Textarea } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { RecoveryAlert } from "@/components/recovery-alert";
import { supportedShippingAreasOptions } from "@/lib/shipping-areas";

export type AddressFieldsValue = { province_code: string; ward_code: string; address: string };

const maxAddressLength = 500;

export function useAddressFields(value: AddressFieldsValue, enabled = true) {
  const { locale } = useAdminI18n();
  const query = useQuery({ ...supportedShippingAreasOptions(locale), enabled });
  const province = query.data?.find(({ code }) => code === value.province_code);
  const ward = province?.wards.find(({ code }) => code === value.ward_code);
  const detail = value.address.trim();
  const valid =
    enabled &&
    query.isSuccess &&
    !query.isFetching &&
    !query.isPaused &&
    Boolean(province && ward && detail && detail.length <= maxAddressLength);
  return { query, province, ward, valid };
}

export function AddressFields({
  value,
  onChange,
  state,
  disabled,
  errors,
}: {
  value: AddressFieldsValue;
  onChange: (value: AddressFieldsValue) => void;
  state: ReturnType<typeof useAddressFields>;
  disabled?: boolean;
  errors?: Partial<Record<keyof AddressFieldsValue, string>>;
}) {
  const { t } = useAdminI18n();
  const copy = t.addressFields;
  const { province_code, ward_code, address } = value;
  const { query, province, ward } = state;
  const provinces = query.data ?? [];
  const wards = province?.wards ?? [];
  const unavailable = query.isError || query.isPaused;
  const unsupported = t.csaCustomers.shippingAreaUnsupported;
  const provinceError = query.data && province_code && !province ? unsupported : undefined;
  const wardError = province && ward_code && !ward ? unsupported : undefined;

  return (
    <Stack gap="sm" miw={0}>
      <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }} spacing="sm">
        <Select
          role="combobox"
          label={copy.province}
          placeholder={copy.chooseProvince}
          name="province_code"
          autoComplete="shipping address-level1"
          searchable={false}
          allowDeselect={false}
          required
          disabled={disabled || unavailable || !provinces.length}
          error={errors?.province_code ?? provinceError}
          value={province?.code ?? null}
          data={provinces.map(({ code, name }) => ({ value: code, label: name }))}
          onChange={(code) => {
            if (code && code !== province_code && provinces.some((item) => item.code === code))
              onChange({ province_code: code, ward_code: "", address });
          }}
        />
        <Select
          role="combobox"
          label={copy.ward}
          placeholder={copy.chooseWard}
          name="ward_code"
          autoComplete="shipping address-level2"
          searchable={false}
          allowDeselect={false}
          required
          disabled={disabled || unavailable || !wards.length}
          error={errors?.ward_code ?? wardError}
          value={ward?.code ?? null}
          data={wards.map(({ code, name }) => ({ value: code, label: name }))}
          onChange={(code) => {
            if (code && code !== ward_code && wards.some((item) => item.code === code))
              onChange({ province_code, ward_code: code, address });
          }}
        />
      </SimpleGrid>
      <Textarea
        label={copy.address}
        placeholder={copy.addressPlaceholder}
        name="address"
        autoComplete="shipping address-line1"
        required
        autosize
        minRows={2}
        maxLength={maxAddressLength}
        disabled={disabled}
        error={errors?.address}
        value={address}
        onChange={(event) =>
          onChange({ province_code, ward_code, address: event.currentTarget.value })
        }
      />
      {query.isEnabled && !disabled && unavailable && (
        <RecoveryAlert
          message={copy.loadError}
          retryLabel={t.common.retry}
          loading={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isEnabled && !disabled && !unavailable && (query.isPending || !provinces.length) && (
        <Text c="dimmed" size="sm" role="status">
          {query.isPending ? copy.loading : copy.noAreas}
        </Text>
      )}
    </Stack>
  );
}
