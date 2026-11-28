"use client";

import {
  Alert,
  Box,
  Button,
  Fieldset,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { AddressFields, useAddressFields } from "@/components/address-fields";
import { CSACustomerAccountForm } from "@/components/csa-customer-account-form";
import { PageHeading } from "@/components/page-heading";
import { PhoneInput } from "@/components/phone-input";
import { useToast } from "@/components/toast-provider";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { api } from "@/lib/client-api";
import { invalidApiResponse } from "@/lib/client-error";
import {
  csaCustomerCreateError,
  isCSACustomerCreateConflict,
  lookupCSACustomerPhone,
  type CreateCSACustomer,
} from "@/lib/csa-customer-creation";
import { csaCustomerListKey } from "@/lib/csa-customers-query";
import { formatVietnamPhone, normalizeEditablePhone, type EditablePhone } from "@/lib/phone-number";
import type { CSACustomer, CSACustomerPhoneLookup } from "@/lib/types";

const emptyFields = {
  name: "",
  delivery: { province_code: "", ward_code: "", address: "" },
  note: "",
};
type PhoneCheck =
  { status: "idle" | "checking" } | { status: "error"; message: string } | CSACustomerPhoneLookup;

export function CSACustomerForm() {
  const { t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const [tab, setTab] = useState("managed");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [lookup, setLookup] = useState<PhoneCheck>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const accountTabRef = useRef<HTMLButtonElement>(null);
  const mutation = useRef<AbortController | null>(null);
  const copy = t.csaCustomers;

  useEffect(() => () => mutation.current?.abort(), []);

  const clearAccountLookup = useCallback((id: string) => {
    setLookup((current) =>
      current.status === "account_found" && current.user.id === id ? { status: "idle" } : current,
    );
  }, []);

  const createCustomer: CreateCSACustomer = async (path, input) => {
    if (mutation.current || !isCurrent()) return;
    const controller = new AbortController();
    mutation.current = controller;
    setSaving(true);
    let savedCustomer = false;
    try {
      const saved = await api<CSACustomer>(path, {
        method: "POST",
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (controller.signal.aborted || !isCurrent()) return;
      if (!UUID_PATH_SEGMENT.test(saved?.id ?? "")) throw invalidApiResponse();
      void client.invalidateQueries({ queryKey: csaCustomerListKey });
      toast(copy.created);
      router.replace(`/csa-customers/${saved.id}`);
      savedCustomer = true;
    } finally {
      if (!savedCustomer && !controller.signal.aborted && isCurrent()) {
        mutation.current = null;
        setSaving(false);
      }
    }
  };

  return (
    <>
      <PageHeading title={copy.createTitle} visuallyHiddenTitle />
      <Paper withBorder p="md" w="100%" maw={760}>
        <Tabs value={tab} onChange={(value) => value && !mutation.current && setTab(value)}>
          <Tabs.List aria-label={copy.createTitle}>
            <Tabs.Tab value="managed" disabled={saving}>
              {copy.newCustomerTab}
            </Tabs.Tab>
            <Tabs.Tab value="account" disabled={saving} ref={accountTabRef}>
              {copy.fromAccountTab}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="managed" pt="md" miw={0}>
            <ManagedCustomerForm
              saving={saving}
              lookup={lookup}
              onLookupChange={setLookup}
              onCreate={createCustomer}
              onUseAccount={(id) => {
                setAccountId(id);
                setTab("account");
                accountTabRef.current?.focus();
              }}
            />
          </Tabs.Panel>
          <Tabs.Panel value="account" pt="md" miw={0}>
            <CSACustomerAccountForm
              accountId={accountId}
              onSelect={setAccountId}
              onAccountUnavailable={clearAccountLookup}
              onCreate={createCustomer}
              saving={saving}
            />
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </>
  );
}

function ManagedCustomerForm({
  saving,
  lookup,
  onLookupChange,
  onCreate,
  onUseAccount,
}: {
  saving: boolean;
  lookup: PhoneCheck;
  onLookupChange: (lookup: PhoneCheck) => void;
  onCreate: CreateCSACustomer;
  onUseAccount: (id: string) => void;
}) {
  const { t } = useAdminI18n();
  const copy = t.csaCustomers;
  const [phone, setPhone] = useState<EditablePhone>({ value: "", entry: "ready" });
  const [phoneSubmitted, setPhoneSubmitted] = useState(false);
  const [fields, setFields] = useState(emptyFields);
  const [noteOpen, setNoteOpen] = useState(false);
  const [error, setError] = useState("");
  const phoneRef = useRef<HTMLInputElement>(null);
  const lookupRequest = useRef<AbortController | null>(null);
  const normalizedPhone = normalizeEditablePhone(phone);
  const checking = lookup.status === "checking";
  const available =
    !!normalizedPhone && lookup.status === "available" && lookup.phone === normalizedPhone;
  const addressState = useAddressFields(fields.delivery, available);
  const canCreate = available && !saving && addressState.valid && !!fields.name.trim();

  useEffect(() => () => lookupRequest.current?.abort(), []);

  function updatePhone(next: EditablePhone) {
    const numberChanged =
      normalizeEditablePhone({ value: next.value, entry: "ready" }) !==
      normalizeEditablePhone({ value: phone.value, entry: "ready" });
    if (numberChanged || next.entry !== "ready" || phone.entry !== "ready") {
      lookupRequest.current?.abort();
      onLookupChange({ status: "idle" });
    }
    if (numberChanged) {
      setFields(emptyFields);
      setNoteOpen(false);
      setError("");
    }
    setPhone(next);
  }

  function checkCurrentPhone() {
    if (normalizedPhone && !checking && !saving) void checkPhone(normalizedPhone);
  }

  async function checkPhone(number: string) {
    lookupRequest.current?.abort();
    const controller = new AbortController();
    lookupRequest.current = controller;
    onLookupChange({ status: "checking" });
    setError("");
    try {
      const result = await lookupCSACustomerPhone(number, controller.signal);
      if (!controller.signal.aborted) onLookupChange(result);
    } catch (caught) {
      if (!controller.signal.aborted) {
        onLookupChange({ status: "error", message: csaCustomerCreateError(caught, t) });
      }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!normalizedPhone) {
      setPhoneSubmitted(true);
      phoneRef.current?.focus();
      return;
    }
    if (!canCreate) return;
    const checkedRequest = lookupRequest.current;
    setError("");
    try {
      await onCreate("admin/csa-customers", {
        name: fields.name.trim(),
        phone: normalizedPhone,
        ...fields.delivery,
        address: fields.delivery.address.trim(),
        note: fields.note.trim(),
      });
    } catch (caught) {
      if (isCSACustomerCreateConflict(caught)) {
        if (checkedRequest && !checkedRequest.signal.aborted) await checkPhone(normalizedPhone);
        return;
      }
      setError(csaCustomerCreateError(caught, t));
      if (caught instanceof Error && caught.message === "csa_customer_shipping_area_unsupported") {
        void addressState.query.refetch();
      }
    }
  }

  const phoneError =
    lookup.status === "customer_exists"
      ? copy.phoneAlreadyExists
      : lookup.status === "error"
        ? lookup.message
        : phoneSubmitted && !phone.value
          ? t.phoneInput.required
          : undefined;

  return (
    <form aria-busy={saving} noValidate onSubmit={submit}>
      <Stack gap="lg">
        <Fieldset legend={t.users.contactDetails} variant="unstyled" disabled={saving} miw={0}>
          <Stack gap="md">
            <Stack gap="xs">
              <Group align="flex-start" gap="xs">
                <Box miw={0} style={{ flex: "1 1 10rem" }}>
                  <PhoneInput
                    ref={phoneRef}
                    name="phone"
                    state={phone}
                    onChange={updatePhone}
                    onEnter={checkCurrentPhone}
                    error={phoneError}
                    required
                    disabled={saving}
                    autoComplete="tel"
                  />
                </Box>
                <Button
                  type="button"
                  variant="default"
                  mt="calc(var(--mantine-font-size-md) * var(--mantine-line-height))"
                  disabled={!normalizedPhone || checking || saving}
                  onClick={checkCurrentPhone}
                >
                  {copy.checkPhone}
                </Button>
              </Group>
              {checking && (
                <Text role="status" size="sm">
                  {copy.checkingPhone}
                </Text>
              )}
              {available && (
                <Text role="status" size="sm">
                  {copy.phoneAvailable}
                </Text>
              )}
              {lookup.status === "account_found" && (
                <Group gap="sm">
                  <Text role="status" size="sm">
                    {lookup.user.name} · {formatVietnamPhone(lookup.phone)}
                  </Text>
                  <Button
                    type="button"
                    variant="light"
                    onClick={() => onUseAccount(lookup.user.id)}
                  >
                    {copy.useAccount}
                  </Button>
                </Group>
              )}
            </Stack>
            <TextInput
              label={copy.name}
              required
              disabled={!available || saving}
              autoComplete="name"
              maxLength={150}
              value={fields.name}
              onChange={(event) => setFields({ ...fields, name: event.currentTarget.value })}
            />
          </Stack>
        </Fieldset>
        <Fieldset
          legend={copy.addressSection}
          variant="unstyled"
          disabled={!available || saving}
          miw={0}
        >
          <AddressFields
            value={fields.delivery}
            onChange={(delivery) => setFields((current) => ({ ...current, delivery }))}
            state={addressState}
            disabled={!available || saving}
          />
        </Fieldset>
        {available && (
          <Stack gap="xs" align="flex-start">
            <Button
              type="button"
              variant="subtle"
              disabled={saving}
              aria-expanded={noteOpen}
              onClick={() => setNoteOpen(!noteOpen)}
            >
              {copy.addNote}
            </Button>
            {noteOpen && (
              <Textarea
                label={copy.note}
                maxLength={1000}
                value={fields.note}
                disabled={saving}
                w="100%"
                onChange={(event) => setFields({ ...fields, note: event.currentTarget.value })}
              />
            )}
          </Stack>
        )}
        {error && (
          <Alert color="danger" role="alert">
            {error}
          </Alert>
        )}
        <Group component="footer" justify="flex-end">
          {!saving && (
            <Button component={AdminNavigationLink} href="/csa-customers" variant="default">
              {t.membershipCatalog.cancel}
            </Button>
          )}
          <Button type="submit" loading={saving} disabled={!canCreate}>
            {saving ? copy.saving : copy.create}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
