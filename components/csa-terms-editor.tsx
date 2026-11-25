"use client";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconCopy, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  DataState,
  FormField,
  FormInput,
  FormTextarea,
  Section,
  Status,
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
      await api(`admin/csa-terms/${document.id}`, { method: "DELETE" }, { response: "no-content" });
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

  const heading =
    !termsId && !document
      ? copy.createTitle
      : !document || readOnly
        ? copy.viewTitle
        : copy.editTitle;

  if (loading || loadFailed)
    return (
      <Stack gap="md" w="100%" maw={760} miw={0}>
        <PageHeading title={heading} visuallyHiddenTitle />
        <Paper withBorder p="md">
          {loading ? (
            <DataState kind="loading" title={copy.loading} />
          ) : (
            <Alert color="danger" role="alert">
              {error}
            </Alert>
          )}
        </Paper>
      </Stack>
    );

  const status = document && (
    <Status domain="csa-terms" status={document.status} label={copy.statuses[document.status]} />
  );

  return (
    <Stack gap="md" w="100%" maw={760} miw={0}>
      <PageHeading title={heading} visuallyHiddenTitle />
      {error && (
        <Alert color="danger" role="alert">
          {error}
        </Alert>
      )}
      {message && (
        <Alert color="success" role="status">
          {message}
        </Alert>
      )}
      <Tabs
        value={locale}
        onChange={(value) => {
          if (value === "vi" || value === "en") setLocale(value);
        }}
        keepMounted={false}
      >
        <Stack gap="md">
          <Paper component="section" withBorder p="md">
            <Stack gap="md">
              {readOnly ? (
                <>
                  <Group justify="space-between" gap="sm">
                    <Stack gap={4}>
                      <Text size="sm" c="dimmed">
                        {copy.version}
                      </Text>
                      <Text fw={600} style={{ overflowWrap: "anywhere" }}>
                        {draft.version}
                      </Text>
                    </Stack>
                    <Group gap="sm">
                      {status}
                      <Button
                        leftSection={<IconCopy size={16} aria-hidden />}
                        onClick={() => {
                          setCloneVersion("");
                          setDialog("clone");
                        }}
                        variant="default"
                      >
                        {copy.clone}
                      </Button>
                    </Group>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {copy.readOnly}
                  </Text>
                </>
              ) : (
                <Group align="flex-end" gap="sm">
                  <Box flex={1} maw={360} miw={0}>
                    <FormField label={copy.versionLabel}>
                      <FormInput
                        disabled={busy}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            version: event.currentTarget.value,
                          }))
                        }
                        value={draft.version}
                      />
                    </FormField>
                  </Box>
                  {status}
                </Group>
              )}
              <Tabs.List aria-label={copy.language}>
                <Tabs.Tab value="vi">{copy.vietnamese}</Tabs.Tab>
                <Tabs.Tab value="en">{copy.english}</Tabs.Tab>
              </Tabs.List>
            </Stack>
          </Paper>

          <Tabs.Panel value={locale}>
            {readOnly ? (
              <Section title={draft.titles[locale] || copy.documentTitle}>
                <Stack gap="md">
                  {draft.clauses.map((clause, index) => (
                    <Fragment key={clause.key}>
                      {index > 0 && <Divider />}
                      <Stack
                        component="article"
                        gap="xs"
                        miw={0}
                        style={{ overflowWrap: "anywhere" }}
                      >
                        <Group gap="xs" align="baseline">
                          <Text size="sm" c="dimmed" aria-hidden>
                            {String(index + 1).padStart(2, "0")}
                          </Text>
                          <Title order={3} size="h5">
                            {clause.headings[locale] ||
                              copy.clause.replace("{number}", String(index + 1))}
                          </Title>
                        </Group>
                        {splitParagraphs(clause.paragraphs[locale]).map(
                          (paragraph, paragraphIndex) => (
                            <Text key={paragraphIndex} size="sm">
                              {paragraph}
                            </Text>
                          ),
                        )}
                      </Stack>
                    </Fragment>
                  ))}
                </Stack>
              </Section>
            ) : (
              <Stack gap="md">
                <Paper withBorder p="md">
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
                </Paper>

                {draft.clauses.map((clause, index) => (
                  <Section
                    key={clause.key}
                    title={copy.clause.replace("{number}", String(index + 1))}
                    actions={
                      <>
                        <ActionIcon
                          aria-label={copy.moveUp}
                          disabled={busy || index === 0}
                          onClick={() => moveClause(index, -1)}
                          color="gray"
                          variant="subtle"
                        >
                          <IconArrowUp size={16} aria-hidden />
                        </ActionIcon>
                        <ActionIcon
                          aria-label={copy.moveDown}
                          disabled={busy || index === draft.clauses.length - 1}
                          onClick={() => moveClause(index, 1)}
                          color="gray"
                          variant="subtle"
                        >
                          <IconArrowDown size={16} aria-hidden />
                        </ActionIcon>
                        <ActionIcon
                          aria-label={copy.deleteClause}
                          disabled={busy}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              clauses: current.clauses.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                          color="gray"
                          variant="subtle"
                        >
                          <IconTrash size={16} aria-hidden />
                        </ActionIcon>
                      </>
                    }
                  >
                    <Stack gap="sm">
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
                    </Stack>
                  </Section>
                ))}

                <Group>
                  <Button
                    disabled={busy}
                    leftSection={<IconPlus size={16} aria-hidden />}
                    onClick={addClause}
                    variant="default"
                  >
                    {copy.addClause}
                  </Button>
                </Group>

                <Group component="footer" justify="flex-end" gap="sm">
                  {document && (
                    <Button
                      color="danger"
                      disabled={busy}
                      leftSection={<IconTrash size={16} aria-hidden />}
                      onClick={() => setDialog("delete")}
                      me="auto"
                      variant="subtle"
                    >
                      {copy.deleteDraft}
                    </Button>
                  )}
                  <Button loading={busy} onClick={() => void saveDraft()} variant="default">
                    {busy ? copy.saving : copy.save}
                  </Button>
                  <Button disabled={busy} onClick={() => setDialog("publish")}>
                    {copy.publish}
                  </Button>
                </Group>
              </Stack>
            )}
          </Tabs.Panel>
        </Stack>
      </Tabs>

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
    </Stack>
  );
}
