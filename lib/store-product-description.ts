import type { TiptapDocument } from "@/lib/types";

type Node = {
  type?: string;
  text?: string;
  content?: Node[];
};

/** Legacy text is inserted as text nodes, never interpreted as HTML. */
export function descriptionDocument(
  legacy: string,
  document?: TiptapDocument | null,
): TiptapDocument {
  if (document) return document;
  return {
    type: "doc",
    content: legacy
      .replace(/\r\n?/gu, "\n")
      .split("\n")
      .map((line) => ({
        type: "paragraph",
        ...(line ? { content: [{ type: "text", text: line }] } : {}),
      })),
  };
}

export function descriptionText(document: TiptapDocument): string {
  function text(node: Node): string {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    const separator = ["doc", "bulletList", "orderedList", "listItem", "blockquote"].includes(
      node.type ?? "",
    )
      ? "\n"
      : "";
    return (node.content ?? []).map(text).join(separator);
  }
  return text(document as Node);
}

export function descriptionChanged(
  document: TiptapDocument,
  legacy: string,
  originalDocument?: TiptapDocument | null,
): boolean {
  return JSON.stringify(document) !== JSON.stringify(descriptionDocument(legacy, originalDocument));
}

export function descriptionPayload(
  document: TiptapDocument,
  legacy: string,
  originalDocument?: TiptapDocument | null,
): { description: string; description_document?: TiptapDocument } {
  if (!descriptionChanged(document, legacy, originalDocument))
    return {
      description: legacy,
      ...(originalDocument ? { description_document: originalDocument } : {}),
    };
  return { description: descriptionText(document), description_document: document };
}
