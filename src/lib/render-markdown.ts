import createDOMPurify from "dompurify";
import { marked } from "marked";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderMarkdown(markdown: string) {
  const source = markdown.trim();

  if (!source) {
    return "";
  }

  const html = marked.parse(source, {
    async: false,
  });

  if (typeof window === "undefined") {
    return escapeHtml(html);
  }

  const purifier = createDOMPurify(window);

  return purifier.sanitize(html);
}
