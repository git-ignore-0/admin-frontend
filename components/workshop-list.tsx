"use client";
import { DataState } from "@/components/nfv-controls";

import { Status } from "@/components/nfv-controls";

import { Button, Table, Alert } from "@mantine/core";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatAdminDateTimeInZone } from "@/lib/admin-date";
import type { Workshop } from "@/lib/types";

export function WorkshopList() {
  const { t } = useAdminI18n();
  const [items, setItems] = useState<Workshop[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Workshop[]>("admin/workshops/")
      .then(setItems)
      .catch((caught) => setError(requestErrorMessage(caught, t)));
  }, [t]);
  const statusLabel: Record<string, string> = t.workshops.status;
  if (error) return <Alert color="red">{error}</Alert>;
  if (!items) return <DataState kind="loading" title={t.workshops.loading} />;
  if (!items.length)
    return (
      <div className="empty">
        <p>{t.workshops.empty}</p>
        <Button component={Link} variant="filled" href="/workshops/new">
          {t.workshops.createFirst}
        </Button>
      </div>
    );
  return (
    <Table.ScrollContainer type="native" minWidth={640} className="table-wrap">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t.workshops.tableWorkshop}</Table.Th>
            <Table.Th>{t.workshops.tableTime}</Table.Th>
            <Table.Th>{t.workshops.tableLanguages}</Table.Th>
            <Table.Th>{t.workshops.tableStatus}</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => {
            const title =
              item.translations.find((translation) => translation.locale === item.default_locale)
                ?.title || t.workshops.untitled;
            return (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <strong>{title}</strong>
                </Table.Td>
                <Table.Td>{formatAdminDateTimeInZone(item.start_at, item.event_timezone)}</Table.Td>
                <Table.Td>
                  {item.translations.map((t) => (
                    <Status
                      domain="completion"
                      status={t.is_ready ? "complete" : "incomplete"}
                      key={t.locale}
                      label={t.locale.toUpperCase()}
                    />
                  ))}
                </Table.Td>
                <Table.Td>
                  <Status
                    domain="workshop"
                    status={item.effective_status}
                    label={statusLabel[item.effective_status] ?? item.effective_status}
                  />
                  {item.has_published_revision && (
                    <>
                      {" "}
                      <Status
                        domain="visibility"
                        status="visible"
                        label={t.workshops.publiclyVisible}
                      />
                    </>
                  )}
                </Table.Td>
                <Table.Td>
                  <Button component={Link} variant="default" href={`/workshops/${item.id}`}>
                    {t.workshops.edit}
                  </Button>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
