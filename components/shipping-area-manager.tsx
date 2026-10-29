"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { Button, FormInput } from "@/components/nfv-controls";
import { useToast } from "@/components/toast-provider";
import {
  administrativeWardSortName,
  administrativeWardTypeRank,
  getAdministrativeProvinces,
  getAdministrativeWards,
} from "@/lib/administrative-units";
import { requestErrorMessage } from "@/lib/client-error";
import { parseNonNegativeBigInteger, sanitizeIntegerInput } from "@/lib/numeric-input";
import {
  getShippingSettings,
  saveShippingSettings,
  type ShippingOverrideInput,
} from "@/lib/shipping-areas";
import type { AdministrativeUnit, ShippingSettings } from "@/lib/types";

type ShippingSettingsDraft = Omit<ShippingSettings, "overrides"> & {
  overrides: ShippingOverrideInput[];
};

function upsertOverride(
  overrides: ShippingOverrideInput[],
  wardCode: string,
  patch: Partial<ShippingOverrideInput>,
  fallbackActive: boolean,
) {
  const existing = overrides.find((item) => item.ward_code === wardCode);
  const next = {
    ward_code: wardCode,
    shipping_fee_vnd: existing?.shipping_fee_vnd ?? null,
    is_active: existing?.is_active ?? fallbackActive,
    ...patch,
  };
  return existing
    ? overrides.map((item) => (item.ward_code === wardCode ? next : item))
    : [...overrides, next];
}

export function ShippingAreaManager() {
  const { locale, t } = useAdminI18n();
  const copy = t.shippingSettings;
  const toast = useToast();
  const [provinces, setProvinces] = useState<AdministrativeUnit[] | null>(null);
  const [provinceError, setProvinceError] = useState("");
  const [provinceAttempt, setProvinceAttempt] = useState(0);
  const [expandedCode, setExpandedCode] = useState("");
  const expandedCodeRef = useRef("");
  const [wards, setWards] = useState<AdministrativeUnit[]>([]);
  const [settings, setSettings] = useState<ShippingSettingsDraft | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const [validationError, setValidationError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const collator = useMemo(
    () => new Intl.Collator(locale, { sensitivity: "base", numeric: true }),
    [locale],
  );

  useEffect(() => {
    const controller = new AbortController();
    setProvinces(null);
    setProvinceError("");
    getAdministrativeProvinces(locale, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setProvinces(items);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setProvinceError(requestErrorMessage(error, t));
      });
    return () => controller.abort();
  }, [locale, provinceAttempt, t]);

  useEffect(() => {
    setWards([]);
    setSettings(null);
    setSettingsError("");
    setValidationError("");
    if (!expandedCode) {
      setLoadingSettings(false);
      return;
    }

    const requestedCode = expandedCode;
    const controller = new AbortController();
    setLoadingSettings(true);
    Promise.all([
      getAdministrativeWards(requestedCode, locale, controller.signal),
      getShippingSettings(requestedCode, controller.signal),
    ])
      .then(([nextWards, nextSettings]) => {
        if (controller.signal.aborted || expandedCodeRef.current !== requestedCode) return;
        setWards(nextWards);
        setSettings(nextSettings);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || expandedCodeRef.current !== requestedCode) return;
        setSettingsError(requestErrorMessage(error, t));
      })
      .finally(() => {
        if (!controller.signal.aborted && expandedCodeRef.current === requestedCode) {
          setLoadingSettings(false);
        }
      });
    return () => controller.abort();
  }, [expandedCode, locale, settingsAttempt, t]);

  const sortedProvinces = useMemo(
    () => [...(provinces ?? [])].sort((left, right) => collator.compare(left.name, right.name)),
    [collator, provinces],
  );
  const sortedWards = useMemo(
    () =>
      [...wards].sort(
        (left, right) =>
          administrativeWardTypeRank(left.name) - administrativeWardTypeRank(right.name) ||
          collator.compare(
            administrativeWardSortName(left.name),
            administrativeWardSortName(right.name),
          ) ||
          collator.compare(left.name, right.name),
      ),
    [collator, wards],
  );
  const overrides = useMemo(
    () => new Map(settings?.overrides.map((item) => [item.ward_code, item]) ?? []),
    [settings],
  );

  function toggleProvince(provinceCode: string) {
    const nextCode = expandedCode === provinceCode ? "" : provinceCode;
    expandedCodeRef.current = nextCode;
    setExpandedCode(nextCode);
  }

  function editSettings(update: (current: ShippingSettingsDraft) => ShippingSettingsDraft) {
    setSettings((current) => (current ? update(current) : current));
    setValidationError("");
  }

  function toggleWard(wardCode: string, isActive: boolean) {
    editSettings((current) => {
      const existing = current.overrides.find((item) => item.ward_code === wardCode);
      if (isActive === current.is_active && existing?.shipping_fee_vnd == null) {
        return {
          ...current,
          overrides: current.overrides.filter((item) => item.ward_code !== wardCode),
        };
      }
      return {
        ...current,
        overrides: upsertOverride(
          current.overrides,
          wardCode,
          { is_active: isActive },
          current.is_active,
        ),
      };
    });
  }

  function changeWardFee(wardCode: string, value: string) {
    editSettings((current) => {
      const sanitized = sanitizeIntegerInput(value);
      const existing = current.overrides.find((item) => item.ward_code === wardCode);
      const isActive = existing?.is_active ?? current.is_active;
      if (!sanitized && isActive === current.is_active) {
        return {
          ...current,
          overrides: current.overrides.filter((item) => item.ward_code !== wardCode),
        };
      }
      return {
        ...current,
        overrides: upsertOverride(
          current.overrides,
          wardCode,
          { shipping_fee_vnd: sanitized || null, is_active: isActive },
          current.is_active,
        ),
      };
    });
  }

  async function save() {
    if (!settings || savingRef.current) return;
    const provinceCode = expandedCode;
    const defaultFee = parseNonNegativeBigInteger(settings.default_shipping_fee_vnd);
    if ("error" in defaultFee) {
      setValidationError(copy.feeInvalid);
      return;
    }

    const nextOverrides: ShippingOverrideInput[] = [];
    for (const ward of sortedWards) {
      const override = overrides.get(ward.code);
      if (!override) continue;
      if (override.shipping_fee_vnd !== null) {
        const fee = parseNonNegativeBigInteger(override.shipping_fee_vnd);
        if ("error" in fee) {
          setValidationError(copy.feeInvalid);
          return;
        }
      }
      if (override.shipping_fee_vnd === null && override.is_active === settings.is_active) continue;
      nextOverrides.push({
        ward_code: override.ward_code,
        shipping_fee_vnd: override.shipping_fee_vnd,
        is_active: override.is_active,
      });
    }

    savingRef.current = true;
    setSaving(true);
    setValidationError("");
    try {
      const saved = await saveShippingSettings(provinceCode, {
        default_shipping_fee_vnd: defaultFee.value.toString(),
        is_active: settings.is_active,
        overrides: nextOverrides,
      });
      if (expandedCodeRef.current === provinceCode) setSettings(saved);
      toast(copy.saved);
    } catch (error) {
      toast(requestErrorMessage(error, t), "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (provinces === null) {
    return (
      <ListState
        empty={copy.noProvinces}
        error={provinceError}
        hasData={false}
        isEmpty={false}
        loading={!provinceError}
        loadingLabel={copy.loadingProvinces}
        onRetry={() => setProvinceAttempt((attempt) => attempt + 1)}
        retryLabel={t.common.retry}
      />
    );
  }

  if (provinces.length === 0) {
    return <div className="empty">{copy.noProvinces}</div>;
  }

  return (
    <section className="panel shipping-tree-panel">
      <div aria-label={copy.treeLabel} className="shipping-tree" role="tree">
        {sortedProvinces.map((province) => {
          const expanded = expandedCode === province.code;
          return (
            <div
              aria-expanded={expanded}
              aria-selected={expanded}
              className="shipping-province-node"
              key={province.code}
              role="treeitem"
            >
              <div className="shipping-province-header">
                <button
                  aria-label={(expanded ? copy.collapseProvince : copy.expandProvince).replace(
                    "{province}",
                    province.name,
                  )}
                  className="shipping-province-toggle"
                  onClick={() => toggleProvince(province.code)}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="shipping-tree-chevron"
                    fill="none"
                    viewBox="0 0 20 20"
                  >
                    <path d="m7.5 5.5 4.5 4.5-4.5 4.5" />
                  </svg>
                  <span>{province.name}</span>
                </button>
                {expanded && settings && !loadingSettings && !settingsError && (
                  <>
                    <label className="shipping-rule-check shipping-province-default">
                      <input
                        aria-label={copy.defaultSupport}
                        checked={settings.is_active}
                        onChange={(event) =>
                          editSettings((current) => ({
                            ...current,
                            is_active: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{copy.wholeProvince}</span>
                    </label>
                    <div className="shipping-fee-control shipping-province-fee">
                      <FormInput
                        aria-label={copy.defaultFee}
                        disabled={!settings.is_active}
                        inputMode="numeric"
                        onChange={(event) =>
                          editSettings((current) => ({
                            ...current,
                            default_shipping_fee_vnd: sanitizeIntegerInput(event.target.value),
                          }))
                        }
                        value={settings.default_shipping_fee_vnd}
                      />
                      <span>VND</span>
                    </div>
                    <Button loading={saving} onClick={save} small>
                      {copy.saveAll}
                    </Button>
                  </>
                )}
              </div>

              {expanded && (
                <div aria-label={province.name} className="shipping-province-content" role="group">
                  {loadingSettings || settingsError ? (
                    <ListState
                      empty={copy.empty}
                      error={settingsError}
                      hasData={false}
                      isEmpty={false}
                      loading={loadingSettings}
                      loadingLabel={copy.loadingAreas}
                      onRetry={() => setSettingsAttempt((attempt) => attempt + 1)}
                      retryLabel={t.common.retry}
                    />
                  ) : (
                    settings && (
                      <>
                        <div className="shipping-ward-tree" role="group">
                          <div className="shipping-ward-list">
                            {sortedWards.map((ward) => {
                              const override = overrides.get(ward.code);
                              const supported = override?.is_active ?? settings.is_active;
                              const fee = override?.shipping_fee_vnd ?? "";
                              return (
                                <div
                                  aria-label={ward.name}
                                  aria-selected="false"
                                  className="shipping-rule-row shipping-ward-row"
                                  key={ward.code}
                                  role="treeitem"
                                >
                                  <span className="shipping-ward-name">{ward.name}</span>
                                  <div className="shipping-ward-controls">
                                    <label className="shipping-ward-toggle">
                                      <input
                                        aria-label={copy.supportFor.replace("{ward}", ward.name)}
                                        checked={supported}
                                        onChange={(event) =>
                                          toggleWard(ward.code, event.target.checked)
                                        }
                                        type="checkbox"
                                      />
                                    </label>
                                    <div className="shipping-fee-control">
                                      <FormInput
                                        aria-label={copy.feeFor.replace("{ward}", ward.name)}
                                        disabled={!supported}
                                        inputMode="numeric"
                                        onChange={(event) =>
                                          changeWardFee(ward.code, event.target.value)
                                        }
                                        placeholder={settings.default_shipping_fee_vnd}
                                        value={fee}
                                      />
                                      <span>VND</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {validationError && (
                          <p className="field-error shipping-tree-error">{validationError}</p>
                        )}
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
