import DOMPurify from "isomorphic-dompurify";
import { load } from "cheerio";

export const chatError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export const escapeChatText = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function normalizeChatContent(
  value = "",
  format = "HTML",
  { historical = false } = {},
) {
  if (typeof value !== "string" || (!historical && value.length > 40000))
    throw chatError(
      "El mensaje es demasiado largo (máximo 40.000 caracteres).",
    );
  if (!["HTML", "TEXT"].includes(format))
    throw chatError("Formato de mensaje inválido.");
  let input =
    format === "TEXT" ? escapeChatText(value).replace(/\n/g, "<br>") : value;
  if (format === "TEXT")
    input = input.replace(
      /@\[([^\]]+)\]\(([a-zA-Z0-9_-]+)\)/g,
      '<span data-type="mention" data-id="$2" data-label="$1">@$1</span>',
    );
  const clean = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "a",
      "span",
      "h1",
      "h2",
      "h3",
      "mark",
    ],
    ALLOWED_ATTR: ["href", "data-type", "data-id", "data-label"],
    ALLOW_DATA_ATTR: false,
  });
  const $ = load(clean, null, false);
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!/^https?:\/\//i.test(href)) $(el).replaceWith($(el).contents());
    else $(el).attr({ target: "_blank", rel: "noopener noreferrer nofollow" });
  });
  const linkify = (node) => {
    if (node.type === "text") {
      const value = node.data || "";
      if (!/https?:\/\//i.test(value)) return;
      const html = escapeChatText(value).replace(
        /https?:\/\/[^\s<>]+/gi,
        (match) => {
          const end = match.match(/[.,!?;:)]+$/)?.[0] || "";
          const url = end ? match.slice(0, -end.length) : match;
          return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>${end}`;
        },
      );
      $(node).replaceWith(html);
    } else if (!["a", "pre", "code"].includes(node.name))
      (node.children || []).slice().forEach(linkify);
  };
  $.root().contents().toArray().forEach(linkify);
  const mentions = [];
  $("span").each((_, el) => {
    const id = $(el).attr("data-id");
    if ($(el).attr("data-type") === "mention" && /^[\w-]{1,80}$/.test(id || ""))
      mentions.push(id);
    else $(el).replaceWith($(el).contents());
  });
  // Spaces preserve searchable boundaries between pasted paragraphs/list items.
  const textRoot = load($.html(), null, false);
  textRoot("br").replaceWith(" ");
  textRoot("p,li,blockquote,pre").append(" ");
  return {
    html: $.html(),
    text: textRoot.root().text().trim(),
    mentions: [...new Set(mentions)],
  };
}
