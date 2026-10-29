"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  Button,
  FormField,
  FormInput,
  FormTextarea,
  Icon,
  Status,
  Tabs,
} from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { api } from "@/lib/client-api";
import { parseCSATermsDocument, type CSATermsDocument, type CSATermsLocale } from "@/lib/csa-terms";

type ClauseDraft = {
  id?: string;
  key: string;
  headings: Record<CSATermsLocale, string>;
  paragraphs: Record<CSATermsLocale, string>;
};

type TermsDraft = {
  version: string;
  titles: Record<CSATermsLocale, string>;
  clauses: ClauseDraft[];
};

type DialogKind = "publish" | "delete" | "clone" | null;

const emptyDraft: TermsDraft = {
  version: "",
  titles: { vi: "", en: "" },
  clauses: [{ key: "clause_1", headings: { vi: "", en: "" }, paragraphs: { vi: "", en: "" } }],
};

function toDraft(document: CSATermsDocument): TermsDraft {
  return {
    version: document.version,
    titles: document.titles,
    clauses: document.clauses.map((clause) => ({
      id: clause.id,
      key: clause.key,
      headings: clause.headings,
      paragraphs: {
        vi: clause.paragraphs.vi.join("\n\n"),
        en: clause.paragraphs.en.join("\n\n"),
      },
    })),
  };
}

function splitParagraphs(value: string) {
  return value
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function draftPayload(draft: TermsDraft, revision?: number) {
  return {
    version: draft.version.trim().toUpperCase(),
    title_vi: draft.titles.vi.trim(),
    title_en: draft.titles.en.trim(),
    ...(revision === undefined ? {} : { revision }),
    clauses: draft.clauses.map((clause, index) => ({
      key: clause.key,
      sort_order: (index + 1) * 10,
      heading_vi: clause.headings.vi.trim(),
      heading_en: clause.headings.en.trim(),
      paragraphs_vi: splitParagraphs(clause.paragraphs.vi),
      paragraphs_en: splitParagraphs(clause.paragraphs.en),
    })),
  };
}

export function CSATermsEditor({ termsId }: { termsId?: string }) {
  const router = useRouter();
  const { t } = useAdminI18n();
  const copy = t.csaTerms;
  const [document, setDocument] = useState<CSATermsDocument | null>(null);
  const [draft, setDraft] = useState<TermsDraft>(emptyDraft);
  const [locale, setLocale] = useState<CSATermsLocale>("en");
  const [loading, setLoading] = useState(Boolean(termsId));
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [cloneVersion, setCloneVersion] = useState("");

  const readOnly = document !== null && document.status !== "draft";

  useEffect(() => {
    if (!termsId) return;
    let active = true;
    setLoading(true);
    api<unknown>(`admin/csa-terms/${termsId}`)
      .then((value) => {
        if (!active) return;
        const next = parseCSATermsDocument(value);
        setDocument(next);
        setDraft(toDraft(next));
      })
      .catch(() => {
        if (!active) return;
        setLoadFailed(true);
        setError(t.common.requestFailed);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [termsId, t.common.requestFailed]);

  const validationError = useMemo(() => {
    if (!draft.version.trim()) return copy.versionRequired;
    if (!draft.titles.vi.trim() || !draft.titles.en.trim()) return copy.titleRequired;
    if (!draft.clauses.length) return copy.clauseRequired;
    if (
      draft.clauses.some(
        (clause) =>
          !splitParagraphs(clause.paragraphs.vi).length ||
          !splitParagraphs(clause.paragraphs.en).length,
      )
    ) {
      return copy.contentRequired;
    }
    return "";
  }, [copy, draft]);

  const errorMessage = useCallback(
    (caught: unknown) => {
      const code = caught instanceof Error ? caught.message : "request_failed";
      if (code === "csa_terms_revision_conflict") return copy.revisionConflict;
      if (code === "csa_terms_version_exists") return copy.versionExists;
      if (code === "csa_terms_incomplete") return copy.incomplete;
      return t.common.requestFailed;
    },
    [copy, t.common.requestFailed],
  );

  const saveDraft = useCallback(async () => {
    if (validationError) {
      setError(validationError);
      return null;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const path = document ? `admin/csa-terms/${document.id}` : "admin/csa-terms";
      const response = await api<unknown>(path, {
        method: document ? "PATCH" : "POST",
        body: JSON.stringify(draftPayload(draft, document?.revision)),
      });
      const saved = parseCSATermsDocument(response);
      setDocument(saved);
      setDraft(toDraft(saved));
      setMessage(copy.saved);
      if (!termsId) router.replace(`/csa-terms/${saved.id}`);
      return saved;
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }, [copy.saved, document, draft, errorMessage, router, termsId, validationError]);

  function updateClause(index: number, update: (clause: ClauseDraft) => ClauseDraft) {
    setDraft((current) => ({
      ...current,
      clauses: current.clauses.map((clause, itemIndex) =>
        itemIndex === index ? update(clause) : clause,
      ),
    }));
  }

  function moveClause(index: number, offset: number) {
    setDraft((current) => {
      const clauses = [...current.clauses];
      const target = index + offset;
      if (target < 0 || target >= clauses.length) return current;
      [clauses[index], clauses[target]] = [clauses[target], clauses[index]];
      return { ...current, clauses };
    });
  }

  function addClause() {
    setDraft((current) => {
      let number = current.clauses.length + 1;
      while (current.clauses.some((clause) => clause.key === `clause_${number}`)) number += 1;
      return {
        ...current,
        clauses: [
          ...current.clauses,
          { key: `clause_${number}`, headings: { vi: "", en: "" }, paragraphs: { vi: "", en: "" } },
        ],
      };
    });
  }

  async function publish() {
    const saved = await saveDraft();
    if (!saved) return;
    setBusy(true);
    setError("");
    try {
      const published = parseCSATermsDocument(
        await api<unknown>(`admin/csa-terms/${saved.id}/publish`, {
          method: "POST",
          body: JSON.stringify({ revision: saved.revision }),
        }),
      );
      setDocument(published);
      setDraft(toDraft(published));
      setMessage(copy.published);
      setDialog(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft() {
    if (!document) return;
    setBusy(true);
    try {
      await api(`admin/csa-terms/${document.id}`, { method: "DELETE" });
      router.push("/csa-terms");
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  async function clone() {
    if (!document || !cloneVersion.trim()) return;
    setBusy(true);
    setError("");
    try {
      const cloned = parseCSATermsDocument(
        await api<unknown>(`admin/csa-terms/${document.id}/clone`, {
          method: "POST",
          body: JSON.stringify({ version: cloneVersion.trim().toUpperCase() }),
        }),
      );
      router.push(`/csa-terms/${cloned.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="csa-terms-editor">
        <p>{copy.loading}</p>
      </div>
    );

  if (loadFailed)
    return (
      <div className="csa-terms-editor csa-terms-editor-shell">
        <PageHeading backHref="/csa-terms" backLabel={copy.back} title={copy.viewTitle} />
        <p className="error-box" role="alert">
          {error}
        </p>
      </div>
    );

  const heading = !document ? copy.createTitle : readOnly ? copy.viewTitle : copy.editTitle;

  const languageTabs = (
    <Tabs
      items={[
        { value: "vi", label: copy.vietnamese },
        { value: "en", label: copy.english },
      ]}
      label={copy.language}
      onChange={(value) => setLocale(value as CSATermsLocale)}
      value={locale}
    />
  );

  return (
    <div className="csa-terms-editor csa-terms-editor-shell">
      <PageHeading
        action={
          readOnly ? (
            <div className="csa-terms-heading-actions">
              <Status status={document.status} label={copy.statuses[document.status]} />
              <Button
                onClick={() => {
                  setCloneVersion("");
                  setDialog("clone");
                }}
                small
              >
                <Icon name="copy" />
                {copy.clone}
              </Button>
            </div>
          ) : undefined
        }
        backHref="/csa-terms"
        backLabel={copy.back}
        description={readOnly ? copy.readOnly : undefined}
        title={heading}
      />
      {error ? (
        <p className="error-box" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="success-box" role="status">
          {message}
        </p>
      ) : null}

      <div className="csa-terms-meta-bar">
        <div className="csa-terms-meta-version">
          <span>{copy.version}</span>
          {readOnly ? (
            <strong>{draft.version}</strong>
          ) : (
            <FormInput
              aria-label={copy.versionLabel}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({ ...current, version: event.target.value }))
              }
              value={draft.version}
            />
          )}
        </div>
        {!readOnly && document ? (
          <Status status={document.status} label={copy.statuses[document.status]} />
        ) : null}
        <div className="csa-terms-language-tabs">{languageTabs}</div>
      </div>

      {readOnly ? (
        <section className="csa-terms-read-document">
          <header>
            <span>{copy.documentTitle}</span>
            <h2>{draft.titles[locale]}</h2>
          </header>
          <div className="csa-terms-read-list">
            {draft.clauses.map((clause, index) => (
              <article className="csa-terms-read-clause" key={clause.key}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  {clause.headings[locale] ? <h3>{clause.headings[locale]}</h3> : null}
                  {splitParagraphs(clause.paragraphs[locale]).map((paragraph, paragraphIndex) => (
                    <p key={`${clause.key}-${paragraphIndex}`}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="csa-terms-title-field">
            <FormField label={copy.documentTitle}>
              <FormInput
                disabled={busy}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    titles: { ...current.titles, [locale]: event.target.value },
                  }))
                }
                value={draft.titles[locale]}
              />
            </FormField>
          </section>

          <div className="csa-terms-clauses">
            {draft.clauses.map((clause, index) => (
              <section className="csa-terms-edit-clause" key={clause.key}>
                <header className="csa-terms-edit-clause-header">
                  <span>{copy.clause.replace("{number}", String(index + 1))}</span>
                  <div className="csa-terms-clause-actions">
                    <Button
                      aria-label={copy.moveUp}
                      disabled={busy || index === 0}
                      onClick={() => moveClause(index, -1)}
                      small
                      variant="plain"
                    >
                      <Icon name="up" />
                    </Button>
                    <Button
                      aria-label={copy.moveDown}
                      disabled={busy || index === draft.clauses.length - 1}
                      onClick={() => moveClause(index, 1)}
                      small
                      variant="plain"
                    >
                      <Icon name="down" />
                    </Button>
                    <Button
                      aria-label={copy.deleteClause}
                      disabled={busy}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          clauses: current.clauses.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                      small
                      variant="plain"
                    >
                      <Icon name="trash" />
                    </Button>
                  </div>
                </header>
                <div className="csa-terms-edit-clause-body">
                  <FormField label={copy.heading}>
                    <FormInput
                      disabled={busy}
                      onChange={(event) =>
                        updateClause(index, (current) => ({
                          ...current,
                          headings: { ...current.headings, [locale]: event.target.value },
                        }))
                      }
                      value={clause.headings[locale]}
                    />
                  </FormField>
                  <FormField label={copy.content}>
                    <FormTextarea
                      disabled={busy}
                      onChange={(event) =>
                        updateClause(index, (current) => ({
                          ...current,
                          paragraphs: {
                            ...current.paragraphs,
                            [locale]: event.target.value,
                          },
                        }))
                      }
                      value={clause.paragraphs[locale]}
                    />
                  </FormField>
                </div>
              </section>
            ))}
          </div>

          <Button
            className="csa-terms-add-clause"
            disabled={busy}
            onClick={addClause}
            variant="outline"
          >
            <Icon name="plus" />
            {copy.addClause}
          </Button>

          <div className="csa-terms-footer-actions">
            {document ? (
              <Button disabled={busy} onClick={() => setDialog("delete")} variant="plain">
                <Icon name="trash" />
                {copy.deleteDraft}
              </Button>
            ) : null}
            <Button loading={busy} onClick={() => void saveDraft()} variant="outline">
              {busy ? copy.saving : copy.save}
            </Button>
            <Button disabled={busy} onClick={() => setDialog("publish")}>
              {copy.publish}
            </Button>
          </div>
        </>
      )}

      {dialog === "publish" ? (
        <ConfirmationDialog
          busy={busy}
          busyLabel={copy.publishing}
          cancelLabel={copy.cancel}
          confirmLabel={copy.publish}
          error={error || undefined}
          onCancel={() => setDialog(null)}
          onConfirm={() => void publish()}
          title={copy.confirmPublishTitle}
        >
          <p>{copy.confirmPublishBody}</p>
        </ConfirmationDialog>
      ) : null}
      {dialog === "delete" ? (
        <ConfirmationDialog
          busy={busy}
          busyLabel={copy.deleting}
          cancelLabel={copy.cancel}
          confirmLabel={copy.deleteDraft}
          danger
          error={error || undefined}
          onCancel={() => setDialog(null)}
          onConfirm={() => void deleteDraft()}
          title={copy.confirmDeleteTitle}
        >
          <p>{copy.confirmDeleteBody}</p>
        </ConfirmationDialog>
      ) : null}
      {dialog === "clone" ? (
        <ConfirmationDialog
          busy={busy}
          busyLabel={copy.cloning}
          cancelLabel={copy.cancel}
          confirmDisabled={!cloneVersion.trim()}
          confirmLabel={copy.clone}
          error={error || undefined}
          onCancel={() => setDialog(null)}
          onConfirm={() => void clone()}
          title={copy.cloneTitle}
        >
          <p>{copy.cloneDescription}</p>
          <FormField label={copy.versionLabel}>
            <FormInput
              autoFocus
              onChange={(event) => setCloneVersion(event.target.value)}
              value={cloneVersion}
            />
          </FormField>
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}
