import hljs from "highlight.js/lib/common";

const EXT_LANG: Record<string, string> = {
  py: "python",
  pyi: "python",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  rb: "ruby",
  php: "php",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  scala: "scala",
  css: "css",
  scss: "scss",
  html: "xml",
  xml: "xml",
  vue: "xml",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  md: "markdown",
  markdown: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  dockerfile: "dockerfile",
};

/** Guess a highlight.js language id from a file path. "" = let hljs autodetect. */
export function languageForFile(file: string): string {
  const name = file.split("/").pop() ?? file;
  if (/^dockerfile$/i.test(name)) return "dockerfile";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const lang = EXT_LANG[ext];
  if (lang && hljs.getLanguage(lang)) return lang;
  return "";
}

/**
 * Highlight `code`, then split the resulting HTML into per-line fragments while
 * preserving spans that cross newlines (multi-line strings/comments). Each entry
 * is safe HTML (already escaped by highlight.js) for `dangerouslySetInnerHTML`.
 */
export function highlightToLines(code: string, language: string): string[] {
  let html: string;
  try {
    html =
      language && hljs.getLanguage(language)
        ? hljs.highlight(code, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(code).value;
  } catch {
    html = escapeHtml(code);
  }
  return splitHighlightedLines(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const openTags: string[] = [];
  let current = "";
  const re = /(<span[^>]*>)|(<\/span>)|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) {
      openTags.push(m[1]);
      current += m[1];
    } else if (m[2]) {
      openTags.pop();
      current += "</span>";
    } else {
      const parts = m[3].split("\n");
      parts.forEach((part, i) => {
        if (i > 0) {
          current += "</span>".repeat(openTags.length);
          lines.push(current);
          current = openTags.join("");
        }
        current += part;
      });
    }
  }
  lines.push(current);
  return lines;
}
