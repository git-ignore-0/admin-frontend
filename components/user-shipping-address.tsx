"use client";

import {
  Alert,
  Button,
  Fieldset,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useId, useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { FormSelect } from "@/components/nfv-controls";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { requireUserShippingAddress } from "@/lib/admin-users";
import { useAdminUsersMutationAccess } from "@/lib/admin-users-query";
import { api } from "@/lib/client-api";
import { type ClientApiError, requestErrorMessage } from "@/lib/client-error";
import { getSupportedShippingAreas } from "@/lib/shipping-areas";
import type { UserShippingAddress } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

type AddressLocation = Pick<UserShippingAddress, "address" | "province_code" | "ward_code">;

type AddressProps = {
  userId: string;
  address: UserShippingAddress | null | undefined;
  historicalLocation: AddressLocation;
  canEdit: boolean;
  disabled: boolean;
  refresh: () => void;
  onProtectedTarget: () => void;
  onSavingChange: (saving: boolean) => void;
  onAddressSaved: (address: UserShippingAddress, expectedVersion: string | null) => void;
};

function addressDraft(address: AddressLocation) {
  return {
    province_code: address.province_code,
    ward_code: address.ward_code,
    address: address.address,
  };
}

export function UserShippingAddressSection(props: AddressProps) {
  const { locale, t } = useAdminI18n();
  const { address, historicalLocation, canEdit, disabled } = props;
  const location = address === undefined ? historicalLocation : address;
  const hasLocation =
    location &&
    [location.address, location.province_code, location.ward_code].some((value) => value.trim());
  const copy = t.users.shippingAddress;
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const [editing, setEditing] = useState(false);
  const { provinceName, wardName } = useAdministrativeUnitNames(
    location?.province_code || null,
    location?.ward_code || null,
    locale,
  );
  const areaName = [wardName ?? location?.ward_code, provinceName ?? location?.province_code]
    .filter(Boolean)
    .join(", ");

  useLayoutEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    if (disabled) heading.current?.focus();
    else trigger.current?.focus();
  }, [disabled, editing]);

  function closeEditor() {
    returnFocus.current = true;
    setEditing(false);
  }

  if (!canEdit && !hasLocation) return null;

  return (
    <Paper component="section" p="md" aria-labelledby={headingId}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Title id={headingId} ref={heading} tabIndex={-1} order={2} size="md" fw={600}>
            {copy.title}
          </Title>
          {canEdit && !editing && (
            <Button
              ref={trigger}
              size="sm"
              variant="default"
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              {hasLocation ? copy.edit : copy.add}
            </Button>
          )}
        </Group>
        {address?.is_supported === false && (
          <Alert color="warning">{t.csaCustomers.shippingAreaUnsupported}</Alert>
        )}
        {editing ? (
          <ShippingAddressEditor {...props} headingId={headingId} onClose={closeEditor} />
        ) : location && hasLocation ? (
          <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
            {location.address && <Text style={{ whiteSpace: "pre-wrap" }}>{location.address}</Text>}
            {areaName && (
              <Text c="dimmed" size="sm">
                {areaName}
              </Text>
            )}
          </Stack>
        ) : (
          <Text c="dimmed" size="sm">
            {copy.empty}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

function ShippingAddressEditor({
  userId,
  address,
  historicalLocation,
  disabled,
  refresh,
  onProtectedTarget,
  onSavingChange,
  onAddressSaved,
  headingId,
  onClose,
}: AddressProps & { headingId: string; onClose: () => void }) {
  const { locale, t } = useAdminI18n();
  const { captureMutationAccess } = useAdminUsersMutationAccess();
  const toast = useToast();
  const copy = t.users.shippingAddress;
  const areasCopy = t.csaCustomers;
  const [originalAddress, setOriginalAddress] = useState(address);
  const [draft, setDraft] = useState(() => addressDraft(address ?? historicalLocation));
  const [saving, setSaving] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const areas = useQuery({
    queryKey: ["supported-shipping-areas", locale],
    queryFn: ({ signal }) => getSupportedShippingAreas(locale, signal),
  });
  const province = areas.data?.find((item) => item.code === draft.province_code);
  const ward = province?.wards.find((item) => item.code === draft.ward_code);
  const blocked = disabled || saving;
  const areasUnavailable = areas.isFetching || areas.isPending || areas.isError;
  const expectedVersion = originalAddress?.updated_at ?? null;
  const addressChanged = expectedVersion !== (address?.updated_at ?? null);
  const needsLatestAddress = versionConflict || addressChanged;
  const hasChanges =
    !originalAddress ||
    draft.province_code !== originalAddress.province_code ||
    draft.ward_code !== originalAddress.ward_code ||
    draft.address.trim() !== originalAddress.address;
  const canSave =
    !blocked &&
    !areasUnavailable &&
    !needsLatestAddress &&
    hasChanges &&
    province &&
    ward &&
    draft.address.trim();

  useLayoutEffect(() => {
    form.current?.focus();
    return () => {
      if (request.current) {
        request.current.abort();
        onSavingChange(false);
      }
    };
  }, [onSavingChange]);

  function loadLatestAddress() {
    setDraft(addressDraft(address ?? historicalLocation));
    setOriginalAddress(address);
    setVersionConflict(false);
    setError("");
    form.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || request.current) return;
    const accessIsCurrent = captureMutationAccess();
    if (!accessIsCurrent) return;
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () => !controller.signal.aborted && accessIsCurrent();
    setSaving(true);
    onSavingChange(true);
    setError("");
    try {
      const saved = await api<UserShippingAddress>(
        `admin/users/${encodeURIComponent(userId)}/shipping-address`,
        {
          method: "PUT",
          signal: controller.signal,
          body: JSON.stringify({
            ...draft,
            address: draft.address.trim(),
            expected_updated_at: expectedVersion,
          }),
        },
        { shouldRedirectToLogin: isCurrent },
      );
      if (!isCurrent()) return;
      requireUserShippingAddress(saved);
      onAddressSaved(saved, expectedVersion);
      toast(copy.saved);
      onClose();
    } catch (caught) {
      if (!isCurrent()) return;
      const failure = caught instanceof Error ? (caught as ClientApiError) : undefined;
      if (failure?.message === "shipping_area_unsupported") {
        setError(areasCopy.shippingAreaUnsupported);
        void areas.refetch();
      } else if (failure?.message === "account_target_protected") {
        onProtectedTarget();
      } else if (failure?.message === "shipping_address_changed") {
        setVersionConflict(true);
        refresh();
      } else {
        setError(
          requestErrorMessage(caught, t, {
            province_code: areasCopy.province,
            ward_code: areasCopy.ward,
            address: copy.address,
          }),
        );
        if (failure?.status === 403 && failure.message !== "csrf_rejected") refresh();
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) {
        setSaving(false);
        onSavingChange(false);
      }
    }
  }

  return (
    <form
      ref={form}
      tabIndex={-1}
      aria-labelledby={headingId}
      aria-busy={saving}
      onSubmit={(event) => void submit(event)}
    >
      <Stack gap="sm">
        <Fieldset variant="unstyled" miw={0} disabled={blocked}>
          <Stack gap="sm">
            <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }} spacing="sm">
              <FormSelect
                label={areasCopy.province}
                placeholder={
                  areas.isPending ? areasCopy.loadingProvinces : areasCopy.chooseProvince
                }
                required
                comboboxProps={{ withinPortal: false }}
                disabled={blocked || areasUnavailable || !areas.data?.length}
                value={province?.code ?? null}
                data={areas.data?.map(({ code, name }) => ({ value: code, label: name })) ?? []}
                onChange={(value) =>
                  setDraft({ ...draft, province_code: value ?? "", ward_code: "" })
                }
              />
              <FormSelect
                label={areasCopy.ward}
                placeholder={areasCopy.chooseWard}
                required
                comboboxProps={{ withinPortal: false }}
                disabled={blocked || areasUnavailable || !province}
                value={ward?.code ?? null}
                data={province?.wards.map(({ code, name }) => ({ value: code, label: name })) ?? []}
                onChange={(value) => setDraft({ ...draft, ward_code: value ?? "" })}
              />
            </SimpleGrid>
            <Textarea
              label={copy.address}
              required
              autoComplete="shipping address-line1"
              autosize
              minRows={2}
              maxLength={500}
              value={draft.address}
              onChange={(event) => setDraft({ ...draft, address: event.currentTarget.value })}
            />
          </Stack>
        </Fieldset>
        {areas.isError && (
          <RecoveryAlert
            message={requestErrorMessage(areas.error, t)}
            retryLabel={t.common.retry}
            loading={areas.isFetching}
            onRetry={() => void areas.refetch()}
          />
        )}
        {!areasUnavailable && areas.data?.length === 0 && (
          <Text c="dimmed" size="sm">
            {copy.noAreas}
          </Text>
        )}
        {error && (
          <Alert color="danger" role="alert">
            {error}
          </Alert>
        )}
        {needsLatestAddress && (
          <Alert color="warning" role="alert">
            <Stack gap="xs" align="flex-start">
              <Text size="sm">{copy.versionConflict}</Text>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={loadLatestAddress}
                disabled={blocked || !addressChanged}
              >
                {copy.useLatest}
              </Button>
            </Stack>
          </Alert>
        )}
        <Group justify="flex-end">
          <Button type="button" variant="default" disabled={saving} onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" loading={saving} disabled={!canSave}>
            {copy.save}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
