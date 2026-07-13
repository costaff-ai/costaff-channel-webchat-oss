function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { escapeHtml };

// Inline HTML tags the Manager Agent emits for Telegram-compatible
// formatting. Escape-then-allowlist keeps everything else safe: arbitrary
// <script>, <img>, attributes, etc. stay neutralised.
const SAFE_TAG_PATTERNS: [RegExp, string][] = [
  [/&lt;(\/?)b&gt;/gi, "<$1b>"],
  [/&lt;(\/?)strong&gt;/gi, "<$1strong>"],
  [/&lt;(\/?)i&gt;/gi, "<$1i>"],
  [/&lt;(\/?)em&gt;/gi, "<$1em>"],
  [/&lt;(\/?)code&gt;/gi, "<$1code>"],
  [/&lt;(\/?)pre&gt;/gi, "<$1pre>"],
  [/&lt;br\s*\/?&gt;/gi, "<br>"],
];

function reviveSafeTags(escaped: string): string {
  let out = escaped;
  for (const [re, replacement] of SAFE_TAG_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

export function formatReply(text: string): string {
  // Escape first, then pull fenced code blocks OUT before any inline rule or
  // the newline->br pass runs. Inside a code block newlines must stay literal:
  // a <br> there breaks copy-paste and, being inline, makes each line paint its
  // own background box (the reported "broken" look). Swap each block for an
  // inert placeholder, format the prose around it, then splice the blocks back.
  const escaped = escapeHtml(text);
  const blocks: string[] = [];
  const withoutCode = escaped.replace(
    /```[a-zA-Z0-9_+-]*\n?([\s\S]*?)```/g,
    (_m, code: string) => {
      blocks.push(`<pre><code>${code.replace(/\n$/, "")}</code></pre>`);
      // Sentinel that no inline rule matches and real prose won't contain, so
      // it survives formatting and never collides with text like "vitamin B12".
      return `@@CODEBLOCK${blocks.length - 1}@@`;
    },
  );

  const formatted = reviveSafeTags(withoutCode)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");

  return formatted.replace(/@@CODEBLOCK(\d+)@@/g, (_m, i) => blocks[Number(i)]);
}
