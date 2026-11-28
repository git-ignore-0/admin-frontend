"use client";

import {
  Box,
  Button,
  Combobox,
  Divider,
  Group,
  Loader,
  Radio,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  useCombobox,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AddressFields, type useAddressFields } from "@/components/address-fields";
import { Pagination } from "@/components/pagination";
import { PhoneInput } from "@/components/phone-input";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import type { StoreOrderGuest, StoreOrderKind } from "@/lib/admin-store-order-api";
import { userAccountPhone } from "@/lib/admin-users";
import { useAdminUserDetail, useAdminUsersList } from "@/lib/admin-users-query";
import { requestErrorMessage } from "@/lib/client-error";
import { formatVietnamPhone, normalizeVietnamPhone, type EditablePhone } from "@/lib/phone-number";
import type { OrderBuyerType } from "@/lib/store-order-draft";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import type { UserShippingAddress } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

const buyerCopy = {
  vi: {
    buyerType: "Loại người nhận",
    user: "User hệ thống",
    guest: "Khách vãng lai",
    searchUsers: "Tìm User",
    selectedUser: "User đã chọn",
    changeUser: "Đổi User",
    ineligible: "Tài khoản này không đủ điều kiện đặt hàng.",
    addressMissing: "Tài khoản chưa có địa chỉ và tên người nhận hợp lệ.",
  },
  en: {
    buyerType: "Recipient type",
    user: "System user",
    guest: "Guest",
    searchUsers: "Search users",
    selectedUser: "Selected user",
    changeUser: "Change user",
    ineligible: "This account is ineligible to place orders.",
    addressMissing: "This account needs a valid recipient name and shipping address.",
  },
} as const;

type BuyerFieldErrors = Partial<Record<keyof StoreOrderGuest | "user", string>>;
type GuestDetailsChange = Partial<Omit<StoreOrderGuest, "phone_number">>;

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
  guestAddress,
  onGuestChange,
  guestPhoneEntry,
  onGuestPhoneChange,
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
  guestAddress: ReturnType<typeof useAddressFields>;
  onGuestChange: (change: GuestDetailsChange) => void;
  guestPhoneEntry: EditablePhone["entry"];
  onGuestPhoneChange: (phone: EditablePhone) => void;
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
          guest={guest}
          addressState={guestAddress}
          onChange={onGuestChange}
          phone={{ value: guest.phone_number, entry: guestPhoneEntry }}
          onPhoneChange={onGuestPhoneChange}
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
            error={errors.user ?? (issue || undefined)}
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
  const copy = buyerCopy[locale];
  const selectionLabelId = useId();
  const selectionErrorId = useId();
  const changeButton = useRef<HTMLButtonElement>(null);
  const focusAfterChange = useRef<"selection" | "search" | null>(null);
  const [input, setInput] = useState("");
  const [search] = useDebouncedValue(input.trim(), 220);
  const [page, setPage] = useState(1);
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const ready =
    !userId && !disabled && combobox.dropdownOpened && Boolean(search) && search === input.trim();
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
  useLayoutEffect(() => {
    if (userId && focusAfterChange.current === "selection") {
      focusAfterChange.current = null;
      changeButton.current?.focus();
    } else if (!userId && focusAfterChange.current === "search") {
      focusAfterChange.current = null;
      combobox.targetRef.current?.focus();
    }
  }, [combobox, userId]);

  if (userId) {
    return (
      <Group
        role="group"
        aria-labelledby={selectionLabelId}
        gap="xs"
        align="center"
        justify="space-between"
      >
        <Stack gap={4} miw={0}>
          <Text id={selectionLabelId} c="dimmed" size="sm">
            {copy.selectedUser}
          </Text>
          <Box role="status">
            {name && (
              <Text fw={600} style={{ overflowWrap: "anywhere" }}>
                {name}
              </Text>
            )}
          </Box>
          {error && (
            <Text id={selectionErrorId} size="sm" c="danger" role="alert">
              {error}
            </Text>
          )}
        </Stack>
        <Button
          ref={changeButton}
          type="button"
          variant="default"
          size="compact-sm"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? selectionErrorId : undefined}
          onClick={() => {
            focusAfterChange.current = "search";
            onChange(null);
          }}
        >
          {copy.changeUser}
        </Button>
      </Group>
    );
  }

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
          focusAfterChange.current = "selection";
          onChange(id);
          setInput("");
          setPage(1);
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target withExpandedAttribute>
          <TextInput
            role="combobox"
            aria-autocomplete="list"
            required
            label={copy.searchUsers}
            placeholder={t.users.searchPlaceholder}
            disabled={disabled}
            error={error}
            value={input}
            onFocus={() => !disabled && combobox.openDropdown()}
            onClick={() => !disabled && combobox.openDropdown()}
            onChange={(event) => {
              setInput(event.currentTarget.value);
              setPage(1);
              combobox.resetSelectedOption();
              combobox.openDropdown();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
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
                      <Combobox.Option key={user.id} value={user.id}>
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
  const { locale, t } = useAdminI18n();
  const headingId = useId();
  const copy = storeOrdersCopy(locale);
  const { provinceName, wardName } = useAdministrativeUnitNames(
    address.province_code,
    address.ward_code,
    locale,
  );
  return (
    <>
      <Divider />
      <Stack component="section" aria-labelledby={headingId} gap="xs">
        <Title id={headingId} order={3} size="sm" fw={600}>
          {t.csaCustomers.deliveryAddress}
        </Title>
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
      </Stack>
    </>
  );
}

function GuestFields({
  guest,
  addressState,
  onChange,
  phone,
  onPhoneChange,
  disabled,
  errors,
}: {
  guest: StoreOrderGuest;
  addressState: ReturnType<typeof useAddressFields>;
  onChange: (change: GuestDetailsChange) => void;
  phone: EditablePhone;
  onPhoneChange: (phone: EditablePhone) => void;
  disabled: boolean;
  errors: BuyerFieldErrors;
}) {
  const { locale } = useAdminI18n();
  const copy = storeOrdersCopy(locale);

  return (
    <Stack gap="sm">
      <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }} spacing="sm">
        <TextInput
          required
          label={copy.recipientName}
          name="recipient_name"
          autoComplete="shipping name"
          maxLength={200}
          disabled={disabled}
          error={errors.recipient_name}
          value={guest.recipient_name}
          onChange={(event) => onChange({ recipient_name: event.currentTarget.value })}
        />
        <PhoneInput
          state={phone}
          onChange={onPhoneChange}
          name="phone_number"
          autoComplete="shipping tel-national"
          required
          disabled={disabled}
          error={errors.phone_number}
        />
      </SimpleGrid>
      <AddressFields
        value={guest}
        state={addressState}
        disabled={disabled}
        errors={errors}
        onChange={onChange}
      />
    </Stack>
  );
}
