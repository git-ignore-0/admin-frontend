"use client";
import { DataState } from "@/components/nfv-controls";
import { Group, Button } from "@mantine/core";

import { Status } from "@/components/nfv-controls";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useAdminRecordScope } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { useToast } from "@/components/toast-provider";
import { deleteStoreCategory, getStoreCategory, saveStoreCategory } from "@/lib/commerce-api";
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import { categoryName } from "@/lib/store-categories";
import type { StoreCategory } from "@/lib/types";

export function StoreCategoryDetail({ categoryId }: { categoryId: string }) {
  return <StoreCategoryRecord key={categoryId} categoryId={categoryId} />;
}

function StoreCategoryRecord({ categoryId }: { categoryId: string }) {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const router = useRouter();
  const toast = useToast();
  const scope = useAdminRecordScope(categoryId);
  const [item, setItem] = useState<StoreCategory | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const { current, signal } = scope.beginRead();
    setError("");
    getStoreCategory(categoryId, signal)
      .then((result) => {
        if (current()) {
          setItem(result);
          setError("");
        }
      })
      .catch((caught) => {
        if (!current()) return;
        if (isProtectedDataError(caught) || (caught as ClientApiError | null)?.status === 404) {
          scope.retire();
          setItem(null);
          setDialog(false);
          setBusy(false);
        }
        setError(requestErrorMessage(caught, t));
      });
  }, [categoryId, retry, scope, t]);

  function reportActionError(caught: unknown, message: string) {
    if (isProtectedDataError(caught) || (caught as ClientApiError | null)?.status === 404) {
      scope.retire();
      setItem(null);
      setDialog(false);
      setBusy(false);
      setError(message);
    } else setDialogError(message);
  }

  async function remove() {
    const current = scope.capture();
    if (!item || busy || !current()) return;
    setBusy(true);
    setDialogError("");
    try {
      await deleteStoreCategory(categoryId);
      if (!current()) return;
      toast(copy.deleted);
      router.replace("/store-catalog/categories");
    } catch (caught) {
      if (!current()) return;
      reportActionError(
        caught,
        (caught as ClientApiError | null)?.status === 409
          ? copy.protectedDelete
          : requestErrorMessage(caught, t),
      );
    } finally {
      if (current()) setBusy(false);
    }
  }

  async function deactivate() {
    const current = scope.capture();
    if (!item || busy || !current()) return;
    setBusy(true);
    try {
      const updated = await saveStoreCategory(
        {
          slug: item.slug,
          parent_id: item.parent_id,
          sort_order: item.sort_order,
          is_active: false,
          translations: item.translations,
        },
        item.id,
      );
      if (!current()) return;
      setItem(updated);
      setDialog(false);
      toast(copy.success);
    } catch (caught) {
      if (current()) reportActionError(caught, requestErrorMessage(caught, t));
    } finally {
      if (current()) setBusy(false);
    }
  }

  if (error)
    return (
      <DataState
        kind="error"
        title={error}
        action={{ label: t.common.retry, onClick: () => setRetry((value) => value + 1) }}
      />
    );
  if (!item) return <DataState kind="loading" title={copy.loading} />;
  return (
    <>
      <DetailPageHeading
        backHref="/store-catalog/categories"
        backLabel={copy.categories}
        title={categoryName(item, locale)}
        description={`/${item.slug}`}
      />
      <div className="panel">
        <Group gap="xs" mb="sm">
          <Status
            domain="availability"
            status={item.is_active ? "active" : "inactive"}
            label={item.is_active ? copy.active : copy.inactive}
          />
        </Group>
        <p>
          {copy.level.replace("{level}", String(item.depth))} · {copy.order}: {item.sort_order}
        </p>
        <p>
          {item.product_count} {copy.products}
        </p>
        {item.translations.map((translation) => (
          <section key={translation.locale}>
            <h2>
              {translation.locale.toUpperCase()}: {translation.name}
            </h2>
            <p>{translation.description}</p>
          </section>
        ))}
        <div className="catalog-editor-actions">
          <Button component={Link} href={`/store-catalog/categories/${item.id}/edit`}>
            {copy.edit}
          </Button>
          <Button color="red" onClick={() => setDialog(true)} type="button">
            {copy.delete}
          </Button>
        </div>
      </div>
      {dialog && (
        <ConfirmationDialog
          title={copy.delete}
          busy={busy}
          busyLabel={copy.saving}
          cancelLabel={copy.cancel}
          confirmLabel={copy.delete}
          danger
          error={dialogError}
          onCancel={() => {
            setDialog(false);
            setDialogError("");
          }}
          onConfirm={remove}
          alternateLabel={item.is_active ? copy.deactivate : undefined}
          onAlternate={deactivate}
        >
          <p>{copy.confirmDelete}</p>
        </ConfirmationDialog>
      )}
    </>
  );
}
