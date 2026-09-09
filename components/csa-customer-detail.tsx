"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { CustomerMembershipCard } from "@/components/customer-membership-card";
import { DetailBackLink } from "@/components/detail-back-link";
import { LinkCustomerUserDialog } from "@/components/link-customer-user-dialog";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { CSACustomer } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

export function CSACustomerDetail({ customerId }: { customerId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestId = useRef(0);
  const [item, setItem] = useState<CSACustomer | null>(null);
  const [error, setError] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const { provinceName, wardName } = useAdministrativeUnitNames(
    item?.province_code ?? null,
    item?.ward_code ?? null,
    locale,
  );

  const load = useCallback(() => {
    const current = ++requestId.current;
    setError("");
    return api<CSACustomer>(`admin/csa-customers/${customerId}`)
      .then((customer) => {
        if (current === requestId.current) setItem(customer);
      })
      .catch((caught) => {
        if (current === requestId.current) setError(requestErrorMessage(caught, t));
      });
  }, [customerId, t]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  if (error) {
    return (
      <div className="error-box retry-error" role="alert">
        <p>{error}</p>
        <button className="button secondary" onClick={() => void load()} type="button">
          {t.common.retry}
        </button>
      </div>
    );
  }
  if (!item)
    return <div className="panel customer-detail-loading">{t.csaCustomers.detailLoading}</div>;

  const memberships = (item.memberships ?? [])
    .map((membership, index) => ({
      index,
      membership,
      startTime: Date.parse(membership.start_date ?? ""),
    }))
    .sort((left, right) => {
      const leftHasValidDate = Number.isFinite(left.startTime);
      const rightHasValidDate = Number.isFinite(right.startTime);
      if (leftHasValidDate && rightHasValidDate) {
        return right.startTime - left.startTime || left.index - right.index;
      }
      if (leftHasValidDate) return -1;
      if (rightHasValidDate) return 1;
      return left.index - right.index;
    })
    .map(({ membership }) => membership);

  return (
    <>
      <div className="detail-page-heading customer-detail-navigation">
        <DetailBackLink href="/csa-customers" label={t.csaCustomers.back} />
      </div>

      <section className="panel customer-account-section" aria-labelledby="customer-account-title">
        <div className="panel-head customer-account-heading">
          <div>
            <h1 id="customer-account-title" ref={headingRef} tabIndex={-1}>
              {t.csaCustomers.accountInformation}
            </h1>
            <p>{item.user?.name || item.name}</p>
          </div>
          {!item.user && (
            <button
              className="button secondary"
              onClick={() => setLinkDialogOpen(true)}
              type="button"
            >
              {t.csaCustomers.linkUser}
            </button>
          )}
        </div>
        <dl className="detail-list customer-account-list">
          <div>
            <dt>{t.csaCustomers.name}</dt>
            <dd>{item.user?.name || item.name || "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{item.user?.email || "—"}</dd>
          </div>
          <div>
            <dt>{t.csaCustomers.phone}</dt>
            <dd>{item.phone || "—"}</dd>
          </div>
          <div>
            <dt>{t.csaCustomers.websiteAccount}</dt>
            <dd>
              <span className={`badge ${item.user ? "customer-account-linked" : "warm"}`}>
                {item.user ? t.csaCustomers.linkedAccount : t.csaCustomers.unlinkedAccount}
              </span>
            </dd>
          </div>
          <div>
            <dt>{t.csaCustomers.province}</dt>
            <dd>{provinceName || "—"}</dd>
          </div>
          <div>
            <dt>{t.csaCustomers.ward}</dt>
            <dd>{wardName || "—"}</dd>
          </div>
          <div>
            <dt>{t.csaCustomers.deliveryAddress}</dt>
            <dd>{item.address || "—"}</dd>
          </div>
        </dl>
        {!item.user && <p className="muted-copy">{t.csaCustomers.noLinkedAccountHelp}</p>}
      </section>

      <section
        className="panel customer-membership-history"
        aria-labelledby="customer-history-title"
      >
        <div className="panel-head customer-history-heading">
          <h2 id="customer-history-title">{t.csaCustomers.membershipHistory}</h2>
          <Link
            className="button"
            href={`/memberships/assign?customerId=${encodeURIComponent(item.id)}`}
          >
            {t.csaCustomers.assignPackage}
          </Link>
        </div>
        {memberships.length ? (
          <div className="customer-membership-list">
            {memberships.map((membership) => (
              <CustomerMembershipCard item={membership} key={membership.id} t={t} />
            ))}
          </div>
        ) : (
          <div className="empty customer-membership-empty">{t.csaCustomers.noHistory}</div>
        )}
      </section>

      {linkDialogOpen && (
        <LinkCustomerUserDialog
          customerId={item.id}
          fallbackFocusRef={headingRef}
          onCancel={() => setLinkDialogOpen(false)}
          onLinked={(customer) => {
            setItem(customer);
            setLinkDialogOpen(false);
            toast(t.csaCustomers.linkedSuccess);
          }}
        />
      )}
    </>
  );
}
