"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatAdminDateTime } from "@/lib/admin-date";
import { formatMembershipMoney } from "@/lib/membership-format";
import type { MembershipPackage, MembershipProduct } from "@/lib/types";

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useAdminI18n();
  return (
    <div className="panel load-error-state">
      <p className="error-box" role="alert">
        {requestErrorMessage(error, t)}
      </p>
      <button className="button secondary" onClick={retry} type="button">
        {t.common.retry}
      </button>
    </div>
  );
}

function Status({ active }: { active: boolean }) {
  const { t } = useAdminI18n();
  return (
    <span className={`badge ${active ? "" : "warm"}`}>
      {active ? t.membershipCatalog.active : t.membershipCatalog.inactive}
    </span>
  );
}

function formatUnitConversion(template: string, amount: string, label: string) {
  return template.replace("{amount}", amount).replace("{label}", label);
}

function DeleteDialog({
  busy,
  error,
  name,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useAdminI18n();
  return (
    <ConfirmationDialog
      busy={busy}
      busyLabel={t.membershipCatalog.deleting}
      cancelLabel={t.membershipCatalog.cancel}
      confirmLabel={t.membershipCatalog.confirmDelete}
      danger
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={t.membershipCatalog.deleteTitle}
    >
      <p>{t.membershipCatalog.deleteBody.replace("{name}", name)}</p>
    </ConfirmationDialog>
  );
}

export function MembershipProductDetail({ productId }: { productId: string }) {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const deletingRef = useRef(false);
  const [item, setItem] = useState<MembershipProduct | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(() => {
    setError(null);
    api<MembershipProduct>(`admin/membership-products/${productId}`)
      .then(setItem)
      .catch((caught) => setError(caught));
  }, [productId]);
  useEffect(load, [attempt, load]);

  async function remove() {
    if (!item || deletingRef.current) return;
    deletingRef.current = true;
    setDeleteBusy(true);
    setDeleteError("");
    let navigating = false;
    try {
      await api(`admin/membership-products/${item.id}`, { method: "DELETE" });
      toast(t.membershipCatalog.deleted);
      navigating = true;
      router.replace("/membership-catalog/products");
    } catch (caught) {
      setDeleteError(requestErrorMessage(caught, t));
    } finally {
      if (!navigating) {
        deletingRef.current = false;
        setDeleteBusy(false);
      }
    }
  }

  if (error && !item) return <LoadError error={error} retry={() => setAttempt((v) => v + 1)} />;
  if (!item) return <div className="panel">{t.membershipCatalog.loadingProduct}</div>;

  return (
    <>
      <DetailPageHeading
        backHref="/membership-catalog/products"
        backLabel={t.membershipCatalog.backToProducts}
        title={item.name}
      />
      <section className="panel catalog-detail">
        <div className="panel-head">
          <h2>{t.membershipCatalog.productDetails}</h2>
          <div className="row-actions">
            <button className="button danger" onClick={() => setDeleteOpen(true)} type="button">{t.membershipCatalog.delete}</button>
            <Link className="button" href={`/membership-catalog/products/${item.id}/edit`}>{t.membershipCatalog.editProduct}</Link>
          </div>
        </div>
        <dl className="detail-list">
          <div><dt>{t.membershipCatalog.name}</dt><dd>{item.name}</dd></div>
          <div><dt>{t.membershipCatalog.shortDescription}</dt><dd>{item.short_description || "—"}</dd></div>
          <div>
            <dt>{t.membershipCatalog.unitConversion}</dt>
            <dd>
              {formatUnitConversion(
                t.membershipCatalog.unitConversionValue,
                item.unit_size,
                locale === "vi" ? item.unit_label_vi : item.unit_label_en,
              )}
            </dd>
          </div>
          <div><dt>{t.membershipCatalog.unitVi}</dt><dd>{item.unit_label_vi}</dd></div>
          <div><dt>{t.membershipCatalog.unitEn}</dt><dd>{item.unit_label_en}</dd></div>
          <div><dt>{t.membershipCatalog.status}</dt><dd><Status active={item.is_active} /></dd></div>
          {item.created_at && <div><dt>{t.membershipCatalog.createdAt}</dt><dd>{formatAdminDateTime(item.created_at)}</dd></div>}
          {item.updated_at && <div><dt>{t.membershipCatalog.updatedAt}</dt><dd>{formatAdminDateTime(item.updated_at)}</dd></div>}
        </dl>
      </section>
      {deleteOpen && <DeleteDialog busy={deleteBusy} error={deleteError} name={item.name} onCancel={() => { setDeleteOpen(false); setDeleteError(""); }} onConfirm={remove} />}
    </>
  );
}

export function MembershipPackageDetail({ packageId }: { packageId: string }) {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const deletingRef = useRef(false);
  const [item, setItem] = useState<MembershipPackage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(() => {
    setError(null);
    api<MembershipPackage>(`admin/membership-packages/${packageId}`)
      .then(setItem)
      .catch((caught) => setError(caught));
  }, [packageId]);
  useEffect(load, [attempt, load]);

  async function remove() {
    if (!item || deletingRef.current) return;
    deletingRef.current = true;
    setDeleteBusy(true);
    setDeleteError("");
    let navigating = false;
    try {
      await api(`admin/membership-packages/${item.id}`, { method: "DELETE" });
      toast(t.membershipCatalog.deleted);
      navigating = true;
      router.replace("/membership-catalog/packages");
    } catch (caught) {
      setDeleteError(requestErrorMessage(caught, t));
    } finally {
      if (!navigating) {
        deletingRef.current = false;
        setDeleteBusy(false);
      }
    }
  }

  if (error && !item) return <LoadError error={error} retry={() => setAttempt((v) => v + 1)} />;
  if (!item) return <div className="panel">{t.membershipCatalog.loadingPackage}</div>;

  return (
    <>
      <DetailPageHeading
        backHref="/membership-catalog/packages"
        backLabel={t.membershipCatalog.backToPackages}
        title={item.name}
      />
      <section className="panel catalog-detail">
        <div className="panel-head">
          <h2>{t.membershipCatalog.packageDetails}</h2>
          <div className="row-actions">
            <button className="button danger" onClick={() => setDeleteOpen(true)} type="button">{t.membershipCatalog.delete}</button>
            <Link className="button" href={`/membership-catalog/packages/${item.id}/edit`}>{t.membershipCatalog.editPackage}</Link>
          </div>
        </div>
        <dl className="detail-list catalog-package-summary">
          <div><dt>{t.membershipCatalog.name}</dt><dd>{item.name}</dd></div>
          <div><dt>{t.membershipCatalog.upfrontPrice}</dt><dd>{formatMembershipMoney(item.upfront_price, locale)}</dd></div>
          <div><dt>{t.membershipCatalog.duration}</dt><dd>{item.duration_months}</dd></div>
          <div><dt>{t.membershipCatalog.policy}</dt><dd>{item.quota_policy === "expire" ? t.membershipCatalog.expire : t.membershipCatalog.rollover}</dd></div>
          <div><dt>{t.membershipCatalog.status}</dt><dd><Status active={item.is_active} /></dd></div>
          <div><dt>{t.membershipCatalog.description}</dt><dd>{item.description || "—"}</dd></div>
          {item.created_at && <div><dt>{t.membershipCatalog.createdAt}</dt><dd>{formatAdminDateTime(item.created_at)}</dd></div>}
          {item.updated_at && <div><dt>{t.membershipCatalog.updatedAt}</dt><dd>{formatAdminDateTime(item.updated_at)}</dd></div>}
        </dl>
        <div className="catalog-package-products">
          <h3>{t.membershipCatalog.packageProducts}</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t.membershipCatalog.product}</th><th>{t.membershipCatalog.quotaUnits}</th><th>{t.membershipCatalog.unitConversion}</th></tr></thead>
              <tbody>
                {item.items.map((line) => (
                  <tr key={line.product_id}>
                    <td><strong>{line.product_name}</strong><small className="table-secondary">{line.short_description || "—"}</small></td>
                    <td>{line.quota_units}</td>
                    <td>
                      {formatUnitConversion(
                        t.membershipCatalog.unitConversionValue,
                        line.unit_size,
                        locale === "vi" ? line.unit_label_vi : line.unit_label_en,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      {deleteOpen && <DeleteDialog busy={deleteBusy} error={deleteError} name={item.name} onCancel={() => { setDeleteOpen(false); setDeleteError(""); }} onConfirm={remove} />}
    </>
  );
}
