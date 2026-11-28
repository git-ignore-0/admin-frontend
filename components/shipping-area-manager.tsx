"use client";
import {
  Accordion,
  Alert,
  Button,
  Checkbox,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconCornerDownRight } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListResultSummary, ListToolbar } from "@/components/list-toolbar";
import { PageHeading } from "@/components/page-heading";
import { useToast } from "@/components/toast-provider";
import {
  administrativeUnitComparators,
  getAdministrativeProvinces,
  getAdministrativeWards,
} from "@/lib/administrative-units";
import { requestErrorMessage } from "@/lib/client-error";
import { parseNonNegativeBigInteger, sanitizeIntegerInput } from "@/lib/numeric-input";
import {
  getShippingSettings,
  saveShippingSettings,
  supportedShippingAreasKey,
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

function provinceSearchText(value: string) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d");
}

export function ShippingAreaManager() {
  const { locale, t } = useAdminI18n();
  const copy = t.shippingSettings;
  const toast = useToast();
  const queryClient = useQueryClient();
  const defaultFeeId = useId();
  const [provinces, setProvinces] = useState<AdministrativeUnit[] | null>(null);
  const [provinceError, setProvinceError] = useState("");
  const [provinceAttempt, setProvinceAttempt] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
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
  const { compareProvinces, compareWards } = useMemo(
    () => administrativeUnitComparators(locale),
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
    () => [...(provinces ?? [])].sort(compareProvinces),
    [compareProvinces, provinces],
  );
  const sortedWards = useMemo(() => [...wards].sort(compareWards), [compareWards, wards]);
  const overrides = useMemo(
    () => new Map(settings?.overrides.map((item) => [item.ward_code, item]) ?? []),
    [settings],
  );

  function selectProvince(provinceCode: string | null) {
    const nextCode = provinceCode ?? "";
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
    if (!settings || settings.province_code !== expandedCode || savingRef.current) return;
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
      void queryClient.invalidateQueries({ queryKey: supportedShippingAreasKey });
      toast(copy.saved);
    } catch (error) {
      toast(requestErrorMessage(error, t), "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const query = provinceSearchText(search);
  const visibleProvinces = sortedProvinces.filter((province) =>
    provinceSearchText(province.name).includes(query),
  );
  const loadingProvinces = provinces === null && !provinceError;
  const refreshProvinces = () => setProvinceAttempt((attempt) => attempt + 1);

  return (
    <Stack gap="md" miw={0}>
      <PageHeading title={copy.title} visuallyHiddenTitle bottomSpacing={0} />
      <ListToolbar
        busy={loadingProvinces}
        search={{
          label: copy.searchLabel,
          placeholder: copy.searchPlaceholder,
          value: draftSearch,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: setDraftSearch,
          onSubmit: (value) => setSearch(value.trim()),
          submitLabel: t.users.search,
          clearLabel: t.common.clearFilters,
          onClear: () => {
            setDraftSearch("");
            setSearch("");
          },
        }}
        refresh={{ label: copy.refresh, onRefresh: refreshProvinces }}
      />

      <Stack component="section" aria-label={copy.areas} gap="xs" miw={0}>
        {visibleProvinces.length > 0 && (
          <Accordion
            value={expandedCode || null}
            onChange={selectProvince}
            order={2}
            variant="separated"
            chevronPosition="left"
            styles={{
              root: { display: "grid", gap: "var(--mantine-spacing-xs)" },
              item: { margin: 0, backgroundColor: "var(--surface)", borderColor: "var(--border)" },
              control: { borderRadius: "var(--accordion-radius)" },
              label: { fontWeight: 600 },
            }}
          >
            {visibleProvinces.map((province) => {
              const expanded = expandedCode === province.code;
              return (
                <Accordion.Item key={province.code} value={province.code}>
                  <Accordion.Control
                    aria-label={(expanded ? copy.collapseProvince : copy.expandProvince).replace(
                      "{province}",
                      province.name,
                    )}
                  >
                    {province.name}
                  </Accordion.Control>
                  <Accordion.Panel>
                    {expanded &&
                      (loadingSettings ||
                      settingsError ||
                      settings?.province_code !== province.code ? (
                        <ListState
                          embedded
                          empty={copy.empty}
                          error={settingsError}
                          hasData={false}
                          isEmpty={false}
                          loading={!settingsError}
                          loadingLabel={copy.loadingAreas}
                          onRetry={() => setSettingsAttempt((attempt) => attempt + 1)}
                          retryLabel={t.common.retry}
                        />
                      ) : (
                        <Stack
                          component="form"
                          aria-label={province.name}
                          gap="xs"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void save();
                          }}
                        >
                          <Group
                            role="group"
                            aria-label={copy.provinceDefaults}
                            justify="space-between"
                            gap="xs"
                          >
                            <Checkbox
                              label={copy.defaultSupport}
                              checked={settings.is_active}
                              disabled={saving}
                              onChange={(event) =>
                                editSettings((current) => ({
                                  ...current,
                                  is_active: event.target.checked,
                                }))
                              }
                            />
                            <Group gap="xs">
                              <Text component="label" htmlFor={defaultFeeId} size="sm">
                                {copy.defaultFee}
                              </Text>
                              <TextInput
                                id={defaultFeeId}
                                size="xs"
                                w={{ base: 104, sm: 128 }}
                                disabled={saving || !settings.is_active}
                                inputMode="numeric"
                                rightSectionWidth={34}
                                rightSection={
                                  <Text size="xs" c="dimmed" aria-hidden>
                                    VND
                                  </Text>
                                }
                                onChange={(event) =>
                                  editSettings((current) => ({
                                    ...current,
                                    default_shipping_fee_vnd: sanitizeIntegerInput(
                                      event.target.value,
                                    ),
                                  }))
                                }
                                value={settings.default_shipping_fee_vnd}
                              />
                              <Button loading={saving} type="submit" size="xs">
                                {copy.saveAll}
                              </Button>
                            </Group>
                          </Group>

                          {validationError && (
                            <Alert color="danger" role="alert">
                              {validationError}
                            </Alert>
                          )}

                          {sortedWards.length > 0 ? (
                            <Table.ScrollContainer
                              type="native"
                              minWidth={248}
                              mah={480}
                              role="region"
                              aria-label={copy.wards}
                              tabIndex={0}
                              style={{
                                borderRadius: "var(--mantine-radius-default)",
                                overflow: "auto",
                                outlineOffset: -2,
                              }}
                            >
                              <Table
                                aria-label={copy.wards}
                                horizontalSpacing="xs"
                                verticalSpacing={4}
                                stickyHeader
                                withRowBorders
                                style={{ tableLayout: "fixed" }}
                              >
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th scope="col">{copy.wards}</Table.Th>
                                    <Table.Th scope="col" ta="center" w={{ base: 74, sm: 136 }}>
                                      {copy.supported}
                                    </Table.Th>
                                    <Table.Th scope="col" w={{ base: 96, sm: 168 }}>
                                      {copy.deliveryFee}
                                    </Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {sortedWards.map((ward) => {
                                    const override = overrides.get(ward.code);
                                    const supported = override?.is_active ?? settings.is_active;
                                    return (
                                      <Table.Tr key={ward.code}>
                                        <Table.Th scope="row" bg="transparent">
                                          <Group gap={6} wrap="nowrap">
                                            <IconCornerDownRight
                                              aria-hidden
                                              size={13}
                                              stroke={1.5}
                                              color="var(--mantine-color-dimmed)"
                                              style={{ flexShrink: 0 }}
                                            />
                                            <Text
                                              size="sm"
                                              fw={500}
                                              style={{ overflowWrap: "anywhere" }}
                                            >
                                              {ward.name}
                                            </Text>
                                          </Group>
                                        </Table.Th>
                                        <Table.Td>
                                          <Group justify="center">
                                            <Checkbox
                                              aria-label={copy.supportFor.replace(
                                                "{ward}",
                                                ward.name,
                                              )}
                                              checked={supported}
                                              disabled={saving}
                                              onChange={(event) =>
                                                toggleWard(ward.code, event.target.checked)
                                              }
                                            />
                                          </Group>
                                        </Table.Td>
                                        <Table.Td>
                                          <TextInput
                                            size="xs"
                                            aria-label={copy.feeFor.replace("{ward}", ward.name)}
                                            disabled={saving || !supported}
                                            inputMode="numeric"
                                            onChange={(event) =>
                                              changeWardFee(ward.code, event.target.value)
                                            }
                                            placeholder={settings.default_shipping_fee_vnd}
                                            value={override?.shipping_fee_vnd ?? ""}
                                          />
                                        </Table.Td>
                                      </Table.Tr>
                                    );
                                  })}
                                </Table.Tbody>
                              </Table>
                            </Table.ScrollContainer>
                          ) : (
                            <ListState
                              embedded
                              empty={copy.empty}
                              error=""
                              hasData
                              isEmpty
                              loading={false}
                              loadingLabel={copy.loadingAreas}
                              onRetry={() => setSettingsAttempt((attempt) => attempt + 1)}
                              retryLabel={t.common.retry}
                            />
                          )}
                        </Stack>
                      ))}
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        )}

        <ListState
          empty={copy.noProvinces}
          noResults={search ? copy.noMatches : undefined}
          error={provinceError}
          hasData={provinces !== null}
          isEmpty={visibleProvinces.length === 0}
          loading={loadingProvinces}
          loadingLabel={copy.loadingProvinces}
          onRetry={refreshProvinces}
          retryLabel={t.common.retry}
        />

        {provinces && (
          <ListResultSummary
            count={visibleProvinces.length}
            label={t.common.resultCount}
            singularLabel={t.common.resultCountSingular}
          />
        )}
      </Stack>
    </Stack>
  );
}
