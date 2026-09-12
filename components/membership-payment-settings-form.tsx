"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { apiErrorFields, requestErrorMessage } from "@/lib/client-error";
import type { MembershipBank, MembershipPaymentSettings } from "@/lib/types";

type FieldErrors = Partial<Record<"bank" | "accountNumber" | "accountName", string>>;

export function MembershipPaymentSettingsForm() {
  const { t } = useAdminI18n();
  const toast = useToast();
  const savingRef = useRef(false);
  const [data, setData] = useState<MembershipPaymentSettings | null>(null);
  const [banks, setBanks] = useState<MembershipBank[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api<MembershipPaymentSettings>("admin/membership-payment-settings"),
      api<MembershipBank[]>("admin/membership-banks"),
    ])
      .then(([settings, supportedBanks]) => {
        setData(settings);
        setBanks(supportedBanks);
      })
      .catch((caught) =>
        setLoadError(
          caught instanceof Error && caught.message === "membership_bank_directory_unavailable"
            ? t.paymentSettings.banksUnavailable
            : requestErrorMessage(caught, t),
        ),
      );
  }, [t]);

  function validate(current: MembershipPaymentSettings) {
    const next: FieldErrors = {};
    if (!current.bank_bin || !banks?.some((bank) => bank.bin === current.bank_bin))
      next.bank = t.paymentSettings.bankRequired;
    if (!/^\d{6,19}$/.test(current.account_number))
      next.accountNumber = t.paymentSettings.accountNumberRequired;
    if (!current.account_name.trim()) next.accountName = t.paymentSettings.accountNameRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || savingRef.current || !validate(data)) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await api<MembershipPaymentSettings>("admin/membership-payment-settings", {
        method: "PATCH",
        body: JSON.stringify({
          bank_bin: data.bank_bin,
          bank_name: data.bank_name,
          account_number: data.account_number,
          account_name: data.account_name.trim(),
          direct_transfer_enabled: data.direct_transfer_enabled,
        }),
      });
      setData(saved);
      setErrors({});
      toast(t.paymentSettings.saved);
    } catch (caught) {
      const backendFields = apiErrorFields(caught);
      const backendErrors: FieldErrors = {};
      if (backendFields.bank_bin || backendFields.bank_name)
        backendErrors.bank = t.paymentSettings.bankInvalid;
      if (backendFields.account_number)
        backendErrors.accountNumber = t.paymentSettings.accountNumberRequired;
      if (backendFields.account_name)
        backendErrors.accountName = t.paymentSettings.accountNameRequired;
      if (Object.keys(backendErrors).length) {
        setErrors(backendErrors);
        return;
      }
      toast(requestErrorMessage(caught, t), "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!data || !banks) {
    return (
      <div className={loadError ? "error-box" : "panel"}>
        {loadError || t.paymentSettings.loading}
      </div>
    );
  }

  return (
    <form className="payment-settings-form" noValidate onSubmit={submit}>
      <section className="panel vertical-form-section">
        <label className="field" htmlFor="payment-bank">
          <span>{t.paymentSettings.bank}</span>
          <select
            aria-describedby={errors.bank ? "payment-bank-error" : undefined}
            aria-invalid={Boolean(errors.bank)}
            className="input"
            id="payment-bank"
            onChange={(event) => {
              const bank = banks.find((item) => item.bin === event.target.value);
              setData({ ...data, bank_bin: bank?.bin ?? "", bank_name: bank?.name ?? "" });
              setErrors((current) => ({ ...current, bank: undefined }));
            }}
            value={data.bank_bin}
          >
            <option value="">{t.paymentSettings.chooseBank}</option>
            {banks.map((bank) => (
              <option key={bank.bin} value={bank.bin}>
                {bank.short_name} — {bank.name}
              </option>
            ))}
          </select>
          {errors.bank && (
            <small className="field-error" id="payment-bank-error">
              {errors.bank}
            </small>
          )}
        </label>
        <label className="field" htmlFor="payment-account-number">
          <span>{t.paymentSettings.accountNumber}</span>
          <input
            aria-describedby={errors.accountNumber ? "payment-account-number-error" : undefined}
            aria-invalid={Boolean(errors.accountNumber)}
            className="input"
            id="payment-account-number"
            inputMode="numeric"
            onChange={(event) => setData({ ...data, account_number: event.target.value })}
            value={data.account_number}
          />
          {errors.accountNumber && (
            <small className="field-error" id="payment-account-number-error">
              {errors.accountNumber}
            </small>
          )}
        </label>
        <label className="field" htmlFor="payment-account-name">
          <span>{t.paymentSettings.accountName}</span>
          <input
            aria-describedby={errors.accountName ? "payment-account-name-error" : undefined}
            aria-invalid={Boolean(errors.accountName)}
            className="input"
            id="payment-account-name"
            onChange={(event) => setData({ ...data, account_name: event.target.value })}
            value={data.account_name}
          />
          {errors.accountName && (
            <small className="field-error" id="payment-account-name-error">
              {errors.accountName}
            </small>
          )}
        </label>
        <label className="checkbox">
          <input
            checked={data.direct_transfer_enabled}
            onChange={(event) =>
              setData({ ...data, direct_transfer_enabled: event.target.checked })
            }
            type="checkbox"
          />
          {t.paymentSettings.directTransfer}
        </label>
      </section>
      <div className="form-actions">
        <button className="button" disabled={saving} type="submit">
          {saving ? t.paymentSettings.saving : t.paymentSettings.save}
        </button>
      </div>
    </form>
  );
}
