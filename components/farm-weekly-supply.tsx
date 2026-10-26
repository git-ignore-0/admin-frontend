"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { adminTodayIso, formatAdminDate } from "@/lib/admin-date";
import { requestErrorMessage } from "@/lib/client-error";
import { listFarmWeeklySupplies, setFarmWeeklySupply } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { FarmProduct } from "@/lib/types";

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayOf(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(iso, -offset);
}

function todayMonday() {
  return mondayOf(adminTodayIso());
}

export function FarmWeeklySupply({
  farmId,
  product,
  initialWeek,
  drafts,
  onDraftChange,
  onDraftSaved,
}: {
  farmId: string;
  product: FarmProduct;
  initialWeek?: string;
  drafts: Record<string, string>;
  onDraftChange: (week: string, value: string) => void;
  onDraftSaved: (week: string, savedValue: string) => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const [firstWeek, setFirstWeek] = useState(() => mondayOf(initialWeek ?? todayMonday()));
  const weeks = useMemo(
    () => Array.from({ length: 8 }, (_, index) => addDays(firstWeek, index * 7)),
    [firstWeek],
  );
  const [savedQuantities, setSavedQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingWeek, setSavingWeek] = useState("");
  const [error, setError] = useState("");
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const translationRef = useRef(t);
  translationRef.current = t;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    listFarmWeeklySupplies(farmId, product.product_id, firstWeek, weeks[7])
      .then((rows) => {
        if (!live) return;
        setSavedQuantities((current) => {
          const next = { ...current };
          for (const week of weeks) delete next[week];
          for (const row of rows) next[row.week_start] = String(row.quantity_units);
          return next;
        });
        setRowError({});
      })
      .catch((caught) => live && setError(requestErrorMessage(caught, translationRef.current)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [farmId, product.product_id, firstWeek, weeks, retry]);

  async function save(week: string) {
    const raw = drafts[week] ?? savedQuantities[week] ?? "";
    if (!/^(0|[1-9]\d*)$/.test(raw) || Number(raw) > 2_147_483_647) {
      setRowError((current) => ({
        ...current,
        [week]: locale === "vi" ? "Nhập số nguyên không âm." : "Enter a non-negative integer.",
      }));
      return;
    }
    setSavingWeek(week);
    setRowError((current) => ({ ...current, [week]: "" }));
    try {
      await setFarmWeeklySupply(farmId, product.product_id, week, Number(raw));
      setSavedQuantities((current) => ({ ...current, [week]: raw }));
      onDraftSaved(week, raw);
    } catch (caught) {
      setRowError((current) => ({ ...current, [week]: requestErrorMessage(caught, t) }));
    } finally {
      setSavingWeek("");
    }
  }

  const saleUnit = `${formatDecimalInput(product.unit_size)} ${locale === "vi" ? product.unit_label_vi : product.unit_label_en}`;
  return (
    <section className="farm-weekly-panel" aria-busy={loading}>
      <p className="field-help">
        {c.saleUnitHint} <strong>{saleUnit}</strong>.
      </p>
      <div className="farm-weekly-navigation">
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setFirstWeek(addDays(firstWeek, -56));
            setShowAll(false);
          }}
        >
          {c.weekPrevious}
        </button>
        <span>
          {formatAdminDate(weeks[0])} — {formatAdminDate(weeks[7])}
        </span>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setFirstWeek(addDays(firstWeek, 56));
            setShowAll(false);
          }}
        >
          {c.weekNext}
        </button>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {c.weeklyError} {error}
          <button className="button secondary" type="button" onClick={() => setRetry((n) => n + 1)}>
            {t.common.retry}
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">{c.loading}</p>
      ) : (
        !error && (
          <div className="farm-weekly-rows">
            {(showAll ? weeks : weeks.slice(0, 4)).map((week) => {
              const label = formatAdminDate(week);
              return (
                <div className="farm-weekly-row" key={week}>
                  <label className="field">
                    <span>
                      {c.quantity} {locale === "vi" ? "tuần" : "week"} {label}
                    </span>
                    <input
                      className="input"
                      inputMode="numeric"
                      type="number"
                      min="0"
                      step="1"
                      value={drafts[week] ?? savedQuantities[week] ?? ""}
                      onChange={(event) => onDraftChange(week, event.target.value)}
                    />
                  </label>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={Boolean(savingWeek)}
                    onClick={() => void save(week)}
                  >
                    {c.saveWeek} {label}
                  </button>
                  {rowError[week] && (
                    <p className="field-error" role="alert">
                      {rowError[week]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
      {!loading && !error && (
        <button
          className="farm-text-action farm-show-weeks"
          type="button"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? c.showFewerWeeks : c.showAllWeeks}
        </button>
      )}
    </section>
  );
}
