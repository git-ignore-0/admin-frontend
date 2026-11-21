"use client";
import { Alert, Button, Checkbox, Stack, TextInput } from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataState, FormField, FormInput, FormSelect } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import { requestErrorMessage } from "@/lib/client-error";
import {
  enableFarmTracker,
  getFarm,
  getFarmTracker,
  listFarms,
  updateFarmTracker,
} from "@/lib/farms-api";
import type { Farm, PaginationMeta, TrackerFarm } from "@/lib/types";

const MAX_COUNT = 4_294_967_295;
function validCount(value: string) {
  return /^(0|[1-9]\d*)$/.test(value) && Number(value) <= MAX_COUNT;
}

export function FarmTrackerProfileEditor({ farmId }: { farmId?: string }) {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, page_size: 20, total: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(farmId ?? "");
  const [farm, setFarm] = useState<Farm | null>(null);
  const [profile, setProfile] = useState<TrackerFarm | null>(null);
  const [checking, setChecking] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflictedFarmId, setConflictedFarmId] = useState<string | null>(null);
  const [showCountErrors, setShowCountErrors] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [farmError, setFarmError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [listRetry, setListRetry] = useState(0);
  const [farmRetry, setFarmRetry] = useState(0);
  const [profileRetry, setProfileRetry] = useState(0);
  const translationRef = useRef(t);
  translationRef.current = t;
  const [count, setCount] = useState("0");
  const [monthCount, setMonthCount] = useState("0");
  const [visible, setVisible] = useState(true);
  const conflict = conflictedFarmId === selectedId;
  const c =
    locale === "vi"
      ? {
          new: "Bật Growth Tracker",
          edit: "Lưu Growth Tracker",
          select: "Chọn trang trại",
          search: "Tìm Farm",
          find: "Tìm kiếm",
          empty: "Chưa có Farm nào. Hãy tạo trang trại trước.",
          month: "Số người đăng ký 1 tháng",
          sixMonths: "Số người đăng ký 6 tháng",
          visible: "Hiển thị trên Growth Tracker công khai",
          farmEdit: "Sửa thông tin trang trại",
          already: "Farm này đã có Growth Tracker.",
          existing: "Mở profile hiện có",
          loading: "Đang tải Growth Tracker…",
          required: "Vui lòng nhập số đăng ký.",
          invalid: "Số đăng ký phải là số nguyên từ 0 đến 4.294.967.295.",
          conflict: "Profile đã được sửa ở nơi khác. Hãy tải lại trước khi lưu.",
          reload: "Tải lại dữ liệu",
          inactive: "Farm đang tắt hoạt động nên sẽ không xuất hiện công khai dù profile được bật.",
        }
      : {
          new: "Enable Growth Tracker",
          edit: "Save Growth Tracker",
          select: "Select a farm",
          search: "Search farms",
          find: "Search",
          empty: "No farms yet. Create a farm first.",
          month: "1-month signup count",
          sixMonths: "6-month signup count",
          visible: "Visible on the public Growth Tracker",
          farmEdit: "Edit farm details",
          already: "This farm already has a Growth Tracker profile.",
          existing: "Open existing profile",
          loading: "Loading Growth Tracker…",
          required: "Enter a signup count.",
          invalid: "Signup counts must be integers from 0 to 4,294,967,295.",
          conflict: "The profile was changed elsewhere. Reload before saving.",
          reload: "Reload data",
          inactive:
            "This farm is inactive, so it will not appear publicly even when the profile is visible.",
        };

  useEffect(() => {
    if (farmId) {
      let live = true;
      setFarmError("");
      getFarm(farmId)
        .then((row) => live && setFarm(row))
        .catch(
          (caught) => live && setFarmError(requestErrorMessage(caught, translationRef.current)),
        );
      return () => {
        live = false;
      };
    }
    let live = true;
    setListLoading(true);
    setListError("");
    listFarms({ page, search })
      .then((result) => {
        if (!live) return;
        setFarms(result.data);
        setMeta(result.meta ?? { page, page_size: 20, total: result.data.length });
      })
      .catch((caught) => live && setListError(requestErrorMessage(caught, translationRef.current)))
      .finally(() => live && setListLoading(false));
    return () => {
      live = false;
    };
  }, [farmId, page, search, listRetry, farmRetry]);

  useEffect(() => {
    if (!selectedId) {
      setFarm(null);
      setProfile(null);
      setChecking(false);
      return;
    }
    let live = true;
    setChecking(true);
    setProfileError("");
    getFarmTracker(selectedId)
      .then((row) => {
        if (!live) return;
        setProfile(row);
        setCount(String(row.signup_count));
        setMonthCount(String(row.one_month_signup_count ?? 0));
        setVisible(row.is_visible);
        setConflictedFarmId(null);
        setShowCountErrors(false);
      })
      .catch((caught) => {
        if (!live) return;
        if ((caught as { status?: number }).status === 404) {
          setProfile(null);
          setCount("0");
          setMonthCount("0");
          setVisible(true);
          setConflictedFarmId(null);
          setShowCountErrors(false);
        } else setProfileError(requestErrorMessage(caught, translationRef.current));
      })
      .finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, [selectedId, profileRetry]);

  function searchFarms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
    if (search === query.trim() && page === 1) setListRetry((n) => n + 1);
  }

  function countError(value: string) {
    if (!showCountErrors || validCount(value)) return undefined;
    return value ? c.invalid : c.required;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || saving || checking || conflict) return;
    setError("");
    if (!validCount(count) || !validCount(monthCount)) {
      setShowCountErrors(true);
      return;
    }
    setSaving(true);
    try {
      const values = {
        signup_count: Number(count),
        one_month_signup_count: Number(monthCount),
        is_visible: visible,
      };
      if (profile) await updateFarmTracker(selectedId, { ...values, version: profile.version });
      else await enableFarmTracker(selectedId, values);
      router.replace("/tracker-farms");
      router.refresh();
    } catch (caught) {
      if ((caught as { status?: number }).status === 409) setConflictedFarmId(selectedId);
      else setError(requestErrorMessage(caught, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        title={farmId ? t.common.trackerFarms : c.new}
        backHref="/tracker-farms"
        backLabel={t.common.trackerFarms}
      />
      <section className="panel farm-tracker-profile">
        {!farmId && (
          <>
            <form className="farm-product-picker" role="search" onSubmit={searchFarms}>
              <FormField label={c.search} className="field">
                <FormInput
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </FormField>
              <Button variant="default" type="submit">
                {c.find}
              </Button>
            </form>
            <FormField label={c.select} className="field">
              <FormSelect
                value={selectedId}
                onChange={(selection) => {
                  const id = selection ?? "";
                  setFarm(farms.find((row) => row.id === id) ?? null);
                  setSelectedId(id);
                }}
                disabled={!farms.length && !farm}
                data={[
                  { value: "", label: c.select },
                  ...(farm && !farms.some((row) => row.id === farm.id)
                    ? [{ value: farm.id, label: locale === "vi" ? farm.name_vi : farm.name_en }]
                    : []),
                  ...farms.map((row) => ({
                    value: row.id,
                    label: locale === "vi" ? row.name_vi : row.name_en,
                  })),
                ]}
              />
            </FormField>
            {!farms.length && !farm && !listError && (
              <p className="empty">
                {c.empty} <Link href="/farms/new">{t.common.farmList}</Link>
              </p>
            )}
            <Pagination
              page={page}
              total={meta.total}
              pageSize={meta.page_size}
              onPage={setPage}
              disabled={listLoading}
              previousLabel={t.common.previous}
              nextLabel={t.common.next}
              summary={t.common.pagination}
            />
          </>
        )}
        {farm && (
          <div className="farm-profile-reference">
            <h2>{locale === "vi" ? farm.name_vi : farm.name_en}</h2>
            <p>{locale === "vi" ? farm.location_vi : farm.location_en}</p>
            <Link href={`/farms/${farm.id}/edit`}>{c.farmEdit}</Link>
            {!farm.is_active && <p className="field-help">{c.inactive}</p>}
          </div>
        )}
        {listError && (
          <Alert color="red" role="alert">
            <Stack gap="sm" align="flex-start">
              {listError}
              <Button variant="default" type="button" onClick={() => setListRetry((n) => n + 1)}>
                {t.common.retry}
              </Button>
            </Stack>
          </Alert>
        )}
        {farmError && (
          <Alert color="red" role="alert">
            <Stack gap="sm" align="flex-start">
              {farmError}
              <Button variant="default" type="button" onClick={() => setFarmRetry((n) => n + 1)}>
                {t.common.retry}
              </Button>
            </Stack>
          </Alert>
        )}
        {profileError && (
          <Alert color="red" role="alert">
            <Stack gap="sm" align="flex-start">
              {profileError}
              <Button variant="default" type="button" onClick={() => setProfileRetry((n) => n + 1)}>
                {t.common.retry}
              </Button>
            </Stack>
          </Alert>
        )}
        {checking ? (
          <DataState kind="loading" title={c.loading} />
        ) : (
          selectedId &&
          !farmError &&
          !profileError &&
          (!farmId && profile ? (
            <p>
              {c.already} <Link href={`/tracker-farms/${selectedId}`}>{c.existing}</Link>
            </p>
          ) : (
            <form className="form-grid" onSubmit={submit} noValidate>
              <TextInput
                label={c.sixMonths}
                inputMode="numeric"
                type="number"
                min="0"
                step="1"
                max={MAX_COUNT}
                value={count}
                error={countError(count)}
                onChange={(event) => setCount(event.currentTarget.value)}
                required
                withAsterisk={false}
              />
              <TextInput
                label={c.month}
                inputMode="numeric"
                type="number"
                min="0"
                step="1"
                max={MAX_COUNT}
                value={monthCount}
                error={countError(monthCount)}
                onChange={(event) => setMonthCount(event.currentTarget.value)}
                required
                withAsterisk={false}
              />
              <Checkbox
                className="full"
                label={c.visible}
                checked={visible}
                onChange={(event) => setVisible(event.currentTarget.checked)}
              />
              {error && (
                <Alert color="red" className="full" role="alert">
                  {error}
                </Alert>
              )}
              {conflict && (
                <Alert color="red" className="full" role="alert">
                  <Stack gap="sm" align="flex-start">
                    {c.conflict}
                    <Button
                      variant="default"
                      type="button"
                      onClick={() => setProfileRetry((n) => n + 1)}
                    >
                      {c.reload}
                    </Button>
                  </Stack>
                </Alert>
              )}
              <div className="catalog-editor-actions full">
                <Button type="submit" disabled={saving || conflict}>
                  {profile ? c.edit : c.new}
                </Button>
              </div>
            </form>
          ))
        )}
      </section>
    </>
  );
}
