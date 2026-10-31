"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { PageHeading } from "@/components/page-heading";
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
  const [saving, setSaving] = useState(false);
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
          invalid: "Số đăng ký phải là số nguyên từ 0 đến 4.294.967.295.",
          conflict: "Profile đã được sửa ở nơi khác. Hãy tải lại trước khi lưu.",
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
          invalid: "Signup counts must be integers from 0 to 4,294,967,295.",
          conflict: "The profile was changed elsewhere. Reload before saving.",
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
    setListError("");
    listFarms({ page, search })
      .then((result) => {
        if (!live) return;
        setFarms(result.data);
        setMeta(result.meta ?? { page, page_size: 20, total: result.data.length });
      })
      .catch((caught) => live && setListError(requestErrorMessage(caught, translationRef.current)));
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
      })
      .catch((caught) => {
        if (!live) return;
        if ((caught as { status?: number }).status === 404) {
          setProfile(null);
          setCount("0");
          setMonthCount("0");
          setVisible(true);
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || saving || checking) return;
    if (!validCount(count) || !validCount(monthCount)) {
      setError(c.invalid);
      return;
    }
    setSaving(true);
    setError("");
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
      setError(
        (caught as { status?: number }).status === 409
          ? c.conflict
          : requestErrorMessage(caught, t),
      );
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
              <label className="field">
                <span>{c.search}</span>
                <input
                  className="input"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <button className="button secondary" type="submit">
                {c.find}
              </button>
            </form>
            <label className="field">
              <span>{c.select}</span>
              <select
                className="input"
                value={selectedId}
                onChange={(event) => {
                  const id = event.target.value;
                  setFarm(farms.find((row) => row.id === id) ?? null);
                  setSelectedId(id);
                }}
                disabled={!farms.length && !farm}
              >
                <option value="">{c.select}</option>
                {farm && !farms.some((row) => row.id === farm.id) && (
                  <option value={farm.id}>{locale === "vi" ? farm.name_vi : farm.name_en}</option>
                )}
                {farms.map((row) => (
                  <option value={row.id} key={row.id}>
                    {locale === "vi" ? row.name_vi : row.name_en}
                  </option>
                ))}
              </select>
            </label>
            {!farms.length && !farm && !listError && (
              <p className="empty">
                {c.empty} <Link href="/farms/new">{t.common.farmList}</Link>
              </p>
            )}
            {meta.total > meta.page_size && (
              <div className="farm-profile-navigation">
                <button
                  type="button"
                  className="button secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  {t.common.previous}
                </button>
                <span>
                  {page} / {Math.ceil(meta.total / meta.page_size)}
                </span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={page * meta.page_size >= meta.total}
                  onClick={() => setPage((n) => n + 1)}
                >
                  {t.common.next}
                </button>
              </div>
            )}
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
          <div className="error-box" role="alert">
            {listError}
            <button
              className="button secondary"
              type="button"
              onClick={() => setListRetry((n) => n + 1)}
            >
              {t.common.retry}
            </button>
          </div>
        )}
        {farmError && (
          <div className="error-box" role="alert">
            {farmError}
            <button
              className="button secondary"
              type="button"
              onClick={() => setFarmRetry((n) => n + 1)}
            >
              {t.common.retry}
            </button>
          </div>
        )}
        {profileError && (
          <div className="error-box" role="alert">
            {profileError}
            <button
              className="button secondary"
              type="button"
              onClick={() => setProfileRetry((n) => n + 1)}
            >
              {t.common.retry}
            </button>
          </div>
        )}
        {checking ? (
          <p role="status">{c.loading}</p>
        ) : (
          selectedId &&
          !farmError &&
          !profileError &&
          (!farmId && profile ? (
            <p>
              {c.already} <Link href={`/tracker-farms/${selectedId}`}>{c.existing}</Link>
            </p>
          ) : (
            <form className="form-grid" onSubmit={submit}>
              <label className="field">
                <span>{c.sixMonths}</span>
                <input
                  className="input"
                  inputMode="numeric"
                  type="number"
                  min="0"
                  step="1"
                  max={MAX_COUNT}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>{c.month}</span>
                <input
                  className="input"
                  inputMode="numeric"
                  type="number"
                  min="0"
                  step="1"
                  max={MAX_COUNT}
                  value={monthCount}
                  onChange={(event) => setMonthCount(event.target.value)}
                  required
                />
              </label>
              <label className="field full">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(event) => setVisible(event.target.checked)}
                />{" "}
                {c.visible}
              </label>
              {error && (
                <p className="error-box full" role="alert">
                  {error}
                </p>
              )}
              <div className="catalog-editor-actions full">
                <button className="button" type="submit" disabled={saving}>
                  {profile ? c.edit : c.new}
                </button>
              </div>
            </form>
          ))
        )}
      </section>
    </>
  );
}
