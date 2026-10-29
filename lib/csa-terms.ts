export type CSATermsStatus = "draft" | "published" | "archived";
export type CSATermsLocale = "vi" | "en";

export type CSATermsClause = {
  id: string;
  key: string;
  sortOrder: number;
  headings: Record<CSATermsLocale, string>;
  paragraphs: Record<CSATermsLocale, string[]>;
};

export type CSATermsDocument = {
  id: string;
  version: string;
  status: CSATermsStatus;
  titles: Record<CSATermsLocale, string>;
  contentHashes: Record<CSATermsLocale, string | null>;
  revision: number;
  publishedAt: string | null;
  publishedById: string | null;
  createdAt: string;
  updatedAt: string;
  clauses: CSATermsClause[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string") throw new Error("invalid_csa_terms_response");
  return value;
}

function nullableString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value !== null && typeof value !== "string") throw new Error("invalid_csa_terms_response");
  return value as string | null;
}

function requiredNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("invalid_csa_terms_response");
  }
  return value;
}

function stringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("invalid_csa_terms_response");
  }
  return value as string[];
}

export function parseCSATermsDocument(value: unknown): CSATermsDocument {
  if (!isRecord(value) || !Array.isArray(value.clauses)) {
    throw new Error("invalid_csa_terms_response");
  }
  const status = value.status;
  if (status !== "draft" && status !== "published" && status !== "archived") {
    throw new Error("invalid_csa_terms_response");
  }

  return {
    id: requiredString(value, "id"),
    version: requiredString(value, "version"),
    status,
    titles: { vi: requiredString(value, "title_vi"), en: requiredString(value, "title_en") },
    contentHashes: {
      vi: nullableString(value, "content_hash_vi"),
      en: nullableString(value, "content_hash_en"),
    },
    revision: requiredNumber(value, "revision"),
    publishedAt: nullableString(value, "published_at"),
    publishedById: nullableString(value, "published_by_id"),
    createdAt: requiredString(value, "created_at"),
    updatedAt: requiredString(value, "updated_at"),
    clauses: value.clauses.map((clause) => {
      if (!isRecord(clause)) throw new Error("invalid_csa_terms_response");
      return {
        id: requiredString(clause, "id"),
        key: requiredString(clause, "key"),
        sortOrder: requiredNumber(clause, "sort_order"),
        headings: {
          vi: requiredString(clause, "heading_vi"),
          en: requiredString(clause, "heading_en"),
        },
        paragraphs: {
          vi: stringArray(clause, "paragraphs_vi"),
          en: stringArray(clause, "paragraphs_en"),
        },
      };
    }),
  };
}

export function parseCSATermsDocuments(value: unknown) {
  if (!Array.isArray(value)) throw new Error("invalid_csa_terms_response");
  return value.map(parseCSATermsDocument);
}
