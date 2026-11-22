"use client";
import { Table } from "@mantine/core";

import { useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ActionLink, DataState, Icon, Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { api } from "@/lib/client-api";
import { parseCSATermsDocuments, type CSATermsDocument } from "@/lib/csa-terms";

export function CSATermsList() {
  const { locale, t } = useAdminI18n();
  const copy = t.csaTerms;
  const [items, setItems] = useState<CSATermsDocument[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setItems(parseCSATermsDocuments(await api<unknown>("admin/csa-terms")));
    } catch {
      setItems(null);
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="csa-terms-screen csa-terms-list-shell">
      <PageHeading
        bottomSpacing={0}
        action={
          <ActionLink href="/csa-terms/new" small>
            <Icon name="plus" />
            {copy.create}
          </ActionLink>
        }
        description={copy.description}
        title={copy.title}
      />
      {error ? (
        <DataState
          action={{ label: t.common.retry, onClick: () => void load() }}
          kind="error"
          title={t.common.requestFailed}
        />
      ) : items === null ? (
        <DataState kind="loading" title={copy.loading} />
      ) : items.length === 0 ? (
        <DataState kind="empty" title={copy.empty} />
      ) : (
        <Table.ScrollContainer type="native" minWidth={0} className="csa-terms-table-wrap">
          <Table role="table" className="csa-terms-table">
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th role="columnheader">{copy.version}</Table.Th>
                <Table.Th role="columnheader">{copy.status}</Table.Th>
                <Table.Th role="columnheader">{copy.updatedAt}</Table.Th>
                <Table.Th role="columnheader">{copy.action}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => {
                const isDraft = item.status === "draft";
                return (
                  <Table.Tr role="row" key={item.id}>
                    <Table.Td role="cell" data-label={copy.version}>
                      <strong>{item.version}</strong>
                    </Table.Td>
                    <Table.Td role="cell" data-label={copy.status}>
                      <Status
                        domain="csa-terms"
                        status={item.status}
                        label={copy.statuses[item.status]}
                      />
                    </Table.Td>
                    <Table.Td role="cell" data-label={copy.updatedAt}>
                      <time dateTime={item.updatedAt}>
                        {new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
                          dateStyle: "medium",
                        }).format(new Date(item.updatedAt))}
                      </time>
                    </Table.Td>
                    <Table.Td role="cell" data-label={copy.action}>
                      <ActionLink href={`/csa-terms/${item.id}`} small variant="outline">
                        {isDraft ? <Icon name="edit" /> : null}
                        {isDraft ? copy.edit : copy.view}
                      </ActionLink>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </div>
  );
}
