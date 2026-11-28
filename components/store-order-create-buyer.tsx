"use client";

import {
  Alert,
  Box,
  Combobox,
  Divider,
  Group,
  Loader,
  Radio,
  ScrollArea,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  useCombobox,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Pagination } from "@/components/pagination";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import type { StoreOrderGuest, StoreOrderKind } from "@/lib/admin-store-order-api";
import { userAccountPhone } from "@/lib/admin-users";
import { useAdminUserDetail, useAdminUsersList } from "@/lib/admin-users-query";
import { getAdministrativeProvinces, getAdministrativeWards } from "@/lib/administrative-units";
import { requestErrorMessage } from "@/lib/client-error";
import { formatVietnamPhone, normalizeVietnamPhone } from "@/lib/phone-number";
import { getSupportedShippingAreas } from "@/lib/shipping-areas";
import type { OrderBuyerType } from "@/lib/store-order-draft";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import type { UserShippingAddress } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

const buyerCopy = {
  vi: {
    buyerType: "Loại người nhận",
    user: "User hệ thống",
    guest: "Khách vãng lai",
    ineligible: "Tài khoản này không đủ điều kiện đặt hàng.",
    addressMissing: "Tài khoản chưa có địa chỉ và tên người nhận hợp lệ.",
  },
  en: {
    buyerType: "Recipient type",
    user: "System user",
    guest: "Guest",
    ineligible: "This account is ineligible to place orders.",
    addressMissing: "This account needs a valid recipient name and shipping address.",
  },
} as const;

type BuyerFieldErrors = Partial<Record<keyof StoreOrderGuest | "user", string>>;

export function useStoreOrderBuyer(userId: string | null) {
  const query = useAdminUserDetail(userId, 1);
  const user = query.data?.data;
  const address = user?.shipping_address ?? null;
  let issue: "ineligible" | "address_missing" | "phone_invalid" | null = null;
  if (user) {
    if (user.status !== "active") issue = "ineligible";
    else if (
      !address ||
      address.recipient_name === "—" ||
      ![address.recipient_name, address.province_code, address.ward_code, address.address].every(
        (value) => value.trim(),
      )
    )
      issue = "address_missing";
    else if (!normalizeVietnamPhone(address.phone_number)) issue = "phone_invalid";
  }

  return {
    address,
    userName: user?.name,
    eligible: Boolean(user && !issue && !query.error && !query.accessDenied),
    loading: Boolean(userId && !user && query.isFetching),
    refreshing: query.isFetching,
    issue,
    error: query.error,
    accessDenied: query.accessDenied,
    waitingForConnection: query.waitingForConnection,
    refetch: query.refetch,
  };
}

export function StoreOrderBuyerFields({
  kind,
  buyerType,
  onBuyerTypeChange,
  userId,
  onUserChange,
  guest,
  onGuestChange,
  lookup,
  disabled = false,
  errors = {},
}: {
  kind: StoreOrderKind;
  buyerType: OrderBuyerType;
  onBuyerTypeChange: (type: OrderBuyerType) => void;
  userId: string | null;
  onUserChange: (userId: string | null) => void;
  guest: StoreOrderGuest;
  onGuestChange: (guest: StoreOrderGuest) => void;
  lookup: ReturnType<typeof useStoreOrderBuyer>;
  disabled?: boolean;
  errors?: BuyerFieldErrors;
}) {
  const { locale, t } = useAdminI18n();
  const copy = buyerCopy[locale];
  const detailError = lookup.accessDenied
    ? t.common.forbidden
    : lookup.error
      ? requestErrorMessage(lookup.error, t)
      : lookup.waitingForConnection
        ? t.users.offline
        : "";
  const issue =
    lookup.issue === "ineligible"
      ? copy.ineligible
      : lookup.issue === "address_missing"
        ? copy.addressMissing
        : lookup.issue === "phone_invalid"
          ? t.csaCustomers.invalidPhone
          : kind === "new" && lookup.address?.is_supported === false
            ? t.csaCustomers.shippingAreaUnsupported
            : "";

  return (
    <Stack gap="sm">
      <Radio.Group
        label={copy.buyerType}
        value={buyerType}
        onChange={(value) => {
          if (value === "user" || value === "guest") onBuyerTypeChange(value);
        }}
      >
        <Group gap="md" mt="xs">
          <Radio value="user" label={copy.user} disabled={disabled} />
          <Radio value="guest" label={copy.guest} disabled={disabled} />
        </Group>
      </Radio.Group>
      {buyerType === "guest" ? (
        <GuestFields
          kind={kind}
          guest={guest}
          onChange={onGuestChange}
          disabled={disabled}
          errors={errors}
        />
      ) : (
        <>
          <UserPicker
            userId={userId}
            name={lookup.userName}
            onChange={onUserChange}
            disabled={disabled}
            error={errors.user}
          />
          {userId && detailError && (
            <RecoveryAlert
              message={detailError}
              retryLabel={t.common.retry}
              loading={lookup.refreshing}
              onRetry={() => void lookup.refetch()}
            />
          )}
          {userId && lookup.loading && !detailError && (
            <Stack gap="xs" role="status">
              <VisuallyHidden>{t.csaCustomers.loadingAccount}</VisuallyHidden>
              <Skeleton h={24} aria-hidden />
              <Skeleton h={24} w="75%" aria-hidden />
            </Stack>
          )}
          {userId && lookup.address && <BuyerAddress address={lookup.address} />}
          {userId && issue && (
            <Alert color="warning" role="alert">
              {issue}
            </Alert>
          )}
        </>
      )}
    </Stack>
  );
}

function UserPicker({
  userId,
  name,
  onChange,
  disabled,
  error,
}: {
  userId: string | null;
  name: string | undefined;
  onChange: (userId: string | null) => void;
  disabled: boolean;
  error: string | undefined;
}) {
  const { locale, t } = useAdminI18n();
  const [input, setInput] = useState("");
  const [search] = useDebouncedValue(input.trim(), 220);
  const [page, setPage] = useState(1);
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const ready = !disabled && combobox.dropdownOpened && Boolean(search) && search === input.trim();
  const query = useAdminUsersList(
    { search: ready ? search : "", status: "", page: ready ? page : 1 },
    ready,
  );
  const data = ready && query.data;
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.page_size)) : page;
  const errorMessage = query.accessDenied
    ? t.common.forbidden
    : query.error
      ? requestErrorMessage(query.error, t)
      : query.waitingForConnection
        ? t.users.offline
        : "";
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [lastPage, page]);

  return (
    <Box
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) combobox.closeDropdown();
      }}
    >
      <Combobox
        store={combobox}
        withinPortal={false}
        onOptionSubmit={(id) => {
          if (!ready || errorMessage || !data || page > lastPage) return;
          if (!data.data.some((user) => user.id === id)) return;
          onChange(id);
          setInput("");
          setPage(1);
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target withExpandedAttribute>
          <TextInput
            role="combobox"
            required
            label={buyerCopy[locale].user}
            placeholder={t.users.searchPlaceholder}
            disabled={disabled}
            error={error}
            value={combobox.dropdownOpened ? input : (name ?? "")}
            onFocus={() => !disabled && combobox.openDropdown()}
            onClick={() => !disabled && combobox.openDropdown()}
            onChange={(event) => {
              setInput(event.currentTarget.value);
              setPage(1);
              combobox.resetSelectedOption();
              combobox.openDropdown();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && combobox.dropdownOpened) event.preventDefault();
            }}
            rightSection={ready && query.isFetching ? <Loader size="xs" /> : <Combobox.Chevron />}
            rightSectionPointerEvents="none"
          />
        </Combobox.Target>
        {!disabled && (
          <Combobox.Dropdown>
            <Combobox.Options
              aria-label={t.users.searchLabel}
              aria-busy={ready && query.isFetching}
            >
              <ScrollArea.Autosize mah={232} type="auto" offsetScrollbars>
                {data &&
                  !errorMessage &&
                  page <= lastPage &&
                  data.data.map((user) => {
                    const contact = [user.email, userAccountPhone(user)]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <Combobox.Option
                        key={user.id}
                        value={user.id}
                        active={user.id === userId}
                        aria-selected={user.id === userId}
                      >
                        <Text fw={600}>{user.name}</Text>
                        {contact && (
                          <Text c="dimmed" size="sm">
                            {contact}
                          </Text>
                        )}
                      </Combobox.Option>
                    );
                  })}
                {!input.trim() && <Combobox.Empty>{t.users.searchLabel}</Combobox.Empty>}
                {input.trim() && (!ready || (query.isFetching && !data)) && (
                  <Combobox.Empty role="status">{t.users.searching}</Combobox.Empty>
                )}
                {data && !errorMessage && !query.isFetching && !data.data.length && (
                  <Combobox.Empty>{t.users.noMatches}</Combobox.Empty>
                )}
              </ScrollArea.Autosize>
            </Combobox.Options>
            {ready && errorMessage && (
              <RecoveryAlert
                message={errorMessage}
                retryLabel={t.common.retry}
                loading={query.isFetching}
                onRetry={() => void query.refetch()}
              />
            )}
            {data && !errorMessage && page <= lastPage && lastPage > 1 && (
              <>
                <Divider />
                <Box p="xs">
                  <Pagination
                    page={page}
                    total={data.meta.total}
                    pageSize={data.meta.page_size}
                    onPage={(next) => {
                      combobox.focusTarget();
                      combobox.resetSelectedOption();
                      setPage(next);
                    }}
                    disabled={query.isFetching}
                    previousLabel={t.common.previous}
                    nextLabel={t.common.next}
                    summary={t.common.pagination}
                    resultCountLabel={t.common.resultCount}
                    resultCountSingularLabel={t.common.resultCountSingular}
                  />
                </Box>
              </>
            )}
          </Combobox.Dropdown>
        )}
      </Combobox>
    </Box>
  );
}

function BuyerAddress({ address }: { address: UserShippingAddress }) {
  const { locale } = useAdminI18n();
  const copy = storeOrdersCopy(locale);
  const { provinceName, wardName } = useAdministrativeUnitNames(
    address.province_code,
    address.ward_code,
    locale,
  );
  return (
    <RecordDetailFields>
      <RecordDetailField label={copy.recipientName}>{address.recipient_name}</RecordDetailField>
      <RecordDetailField label={copy.phone}>
        {formatVietnamPhone(address.phone_number)}
      </RecordDetailField>
      <RecordDetailField label={copy.province}>
        {provinceName ?? address.province_code}
      </RecordDetailField>
      <RecordDetailField label={copy.ward}>{wardName ?? address.ward_code}</RecordDetailField>
      <RecordDetailField label={copy.address}>{address.address}</RecordDetailField>
    </RecordDetailFields>
  );
}

function GuestFields({
  kind,
  guest,
  onChange,
  disabled,
  errors,
}: {
  kind: StoreOrderKind;
  guest: StoreOrderGuest;
  onChange: (guest: StoreOrderGuest) => void;
  disabled: boolean;
  errors: BuyerFieldErrors;
}) {
  const { locale, t } = useAdminI18n();
  const copy = storeOrdersCopy(locale);
  const supported = useQuery({
    queryKey: ["supported-shipping-areas", locale],
    queryFn: ({ signal }) => getSupportedShippingAreas(locale, signal),
    enabled: kind === "new",
  });
  const provinces = useQuery({
    queryKey: ["administrative-units", locale, "provinces"],
    queryFn: ({ signal }) => getAdministrativeProvinces(locale, signal),
    enabled: kind === "historical",
    staleTime: 5 * 60 * 1000,
  });
  const wards = useQuery({
    queryKey: ["administrative-units", locale, guest.province_code, "wards"],
    queryFn: ({ signal }) => getAdministrativeWards(guest.province_code, locale, signal),
    enabled: kind === "historical" && Boolean(guest.province_code),
    staleTime: 5 * 60 * 1000,
  });
  const provinceQuery = kind === "new" ? supported : provinces;
  const wardQuery = kind === "new" ? supported : wards;
  const provinceOptions = provinceQuery.data ?? [];
  const wardOptions =
    kind === "new"
      ? (supported.data?.find(({ code }) => code === guest.province_code)?.wards ?? [])
      : (wards.data ?? []);
  const fault = [provinceQuery, ...(guest.province_code ? [wardQuery] : [])].find(
    (query) => query.error || query.isPaused,
  );

  useEffect(() => {
    if (
      kind !== "new" ||
      disabled ||
      !supported.isSuccess ||
      supported.isFetching ||
      !guest.province_code
    )
      return;
    const province = supported.data.find(({ code }) => code === guest.province_code);
    if (!province) onChange({ ...guest, province_code: "", ward_code: "" });
    else if (guest.ward_code && !province.wards.some(({ code }) => code === guest.ward_code)) {
      onChange({ ...guest, ward_code: "" });
    }
  }, [disabled, guest, kind, onChange, supported.data, supported.isFetching, supported.isSuccess]);

  return (
    <Stack gap="sm">
      <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }} spacing="sm">
        <TextInput
          required
          label={copy.recipientName}
          autoComplete="shipping name"
          maxLength={200}
          disabled={disabled}
          error={errors.recipient_name}
          value={guest.recipient_name}
          onChange={(event) => onChange({ ...guest, recipient_name: event.currentTarget.value })}
        />
        <TextInput
          required
          label={copy.phone}
          type="tel"
          autoComplete="shipping tel"
          maxLength={32}
          disabled={disabled}
          error={errors.phone_number}
          value={guest.phone_number}
          onChange={(event) => onChange({ ...guest, phone_number: event.currentTarget.value })}
        />
        <Select
          role="combobox"
          searchable
          required
          label={copy.province}
          placeholder={
            provinceQuery.isFetching
              ? t.csaCustomers.loadingProvinces
              : t.csaCustomers.chooseProvince
          }
          disabled={disabled || !provinceOptions.length || provinceQuery.isError}
          error={errors.province_code}
          value={guest.province_code || null}
          data={provinceOptions.map(({ code, name }) => ({ value: code, label: name }))}
          onChange={(value) => onChange({ ...guest, province_code: value ?? "", ward_code: "" })}
        />
        <Select
          role="combobox"
          searchable
          required
          label={copy.ward}
          placeholder={t.csaCustomers.chooseWard}
          disabled={disabled || !wardOptions.length || wardQuery.isError}
          error={errors.ward_code}
          value={guest.ward_code || null}
          data={wardOptions.map(({ code, name }) => ({ value: code, label: name }))}
          onChange={(value) => onChange({ ...guest, ward_code: value ?? "" })}
        />
      </SimpleGrid>
      <Textarea
        required
        label={t.users.shippingAddress.address}
        autoComplete="shipping address-line1"
        maxLength={500}
        autosize
        minRows={2}
        disabled={disabled}
        error={errors.address}
        value={guest.address}
        onChange={(event) => onChange({ ...guest, address: event.currentTarget.value })}
      />
      {fault && (
        <RecoveryAlert
          message={fault.error ? requestErrorMessage(fault.error, t) : t.users.offline}
          retryLabel={t.common.retry}
          loading={fault.isFetching}
          onRetry={() => void fault.refetch()}
        />
      )}
    </Stack>
  );
}
