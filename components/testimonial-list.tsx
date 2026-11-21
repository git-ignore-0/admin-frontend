"use client";

import { FormSelect, Status, FormField } from "@/components/nfv-controls";

import { Table } from "@mantine/core";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { formatAdminDateTime } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import type { PaginationMeta, Testimonial, TestimonialStatus, TestimonialType } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function TestimonialList() {
  const { t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TestimonialStatus | "">("");
  const [type, setType] = useState<TestimonialType | "">("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
        search,
        status,
        type,
      });
      return apiEnvelope<Testimonial[], PaginationMeta>(`admin/testimonials?${params}`);
    },
    [search, status, type],
  );
  const getErrorMessage = useCallback((caught: unknown) => requestErrorMessage(caught, t), [t]);
  const { error, items, loading, meta, page, reload, setPage } = usePaginatedList({
    fetchPage,
    getErrorMessage,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const nextSearch = query.trim();
    setPage(1);
    if (nextSearch === search && page === 1) reload();
    else setSearch(nextSearch);
  }

  function changeQuery(value: string) {
    setQuery(value);
    if (!value.trim() && search) {
      setPage(1);
      setSearch("");
    }
  }

  function clearFilters() {
    setQuery("");
    setSearch("");
    setStatus("");
    setType("");
    setPage(1);
  }

  return (
    <section aria-busy={loading} className="admin-list-section testimonial-list-section">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <div className="list-toolbar-filters">
            <FormField className="field" label={t.testimonials.filterStatus}>
              <FormSelect
                disabled={loading}
                value={status}
                onChange={(value) => {
                  setStatus((value ?? "") as TestimonialStatus | "");
                  setPage(1);
                }}
                data={[
                  { value: "", label: t.testimonials.allStatuses },
                  ...(Object.keys(t.testimonials.statuses) as TestimonialStatus[]).map((value) => ({
                    value,
                    label: t.testimonials.statuses[value],
                  })),
                ]}
              />
            </FormField>
            <FormField className="field" label={t.testimonials.filterType}>
              <FormSelect
                disabled={loading}
                value={type}
                onChange={(value) => {
                  setType((value ?? "") as TestimonialType | "");
                  setPage(1);
                }}
                data={[
                  { value: "", label: t.testimonials.allTypes },
                  ...(Object.keys(t.testimonials.types) as TestimonialType[]).map((value) => ({
                    value,
                    label: t.testimonials.types[value],
                  })),
                ]}
              />
            </FormField>
          </div>
        }
        hasFilters={Boolean(query || search || status || type)}
        onClear={clearFilters}
        onQueryChange={changeQuery}
        onSubmit={submit}
        placeholder={t.testimonials.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.testimonials.searchLabel}
        searchSubmitLabel={loading ? t.testimonials.searching : t.testimonials.search}
      />

      <ListState
        empty={t.testimonials.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.testimonials.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />

      {items && items.length > 0 && (
        <Table.ScrollContainer type="native" minWidth={0} className="table-wrap admin-list-wrap">
          <Table role="table" className="admin-list-table testimonial-list-table">
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th role="columnheader">{t.testimonials.testimonial}</Table.Th>
                <Table.Th role="columnheader">{t.testimonials.typeLabel}</Table.Th>
                <Table.Th role="columnheader">{t.testimonials.statusLabel}</Table.Th>
                <Table.Th role="columnheader">{t.testimonials.featured}</Table.Th>
                <Table.Th role="columnheader">{t.testimonials.updatedAt}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => (
                <Table.Tr role="row" key={item.id}>
                  <Table.Td role="cell" data-label={t.testimonials.testimonial}>
                    <div className="testimonial-list-identity">
                      {item.image ? (
                        <Image
                          alt=""
                          className="testimonial-thumbnail"
                          height={56}
                          src={mediaUrlForWidth(item.image, 112)}
                          unoptimized
                          width={56}
                        />
                      ) : (
                        <span aria-hidden="true" className="testimonial-thumbnail placeholder">
                          {item.display_name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <Link
                        aria-label={`${t.testimonials.view}: ${item.display_name}`}
                        className="admin-list-primary-link"
                        href={`/testimonials/${item.id}`}
                      >
                        {item.display_name}
                      </Link>
                    </div>
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.testimonials.typeLabel}>
                    {t.testimonials.types[item.type]}
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.testimonials.statusLabel}>
                    <Status
                      domain="testimonial"
                      status={item.status}
                      label={t.testimonials.statuses[item.status]}
                    />
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.testimonials.featured}>
                    {item.featured ? t.testimonials.featured : t.testimonials.notFeatured}
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.testimonials.updatedAt}>
                    {formatAdminDateTime(item.updated_at)}
                    <small className="table-secondary">
                      {item.published_at
                        ? `${t.testimonials.publishedAt}: ${formatAdminDateTime(item.published_at)}`
                        : t.testimonials.notPublished}
                    </small>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {meta && (
        <Pagination
          disabled={loading}
          nextLabel={t.common.next}
          onPage={setPage}
          page={meta.page}
          pageSize={meta.page_size}
          previousLabel={t.common.previous}
          summary={t.common.pagination}
          total={meta.total}
        />
      )}
    </section>
  );
}
