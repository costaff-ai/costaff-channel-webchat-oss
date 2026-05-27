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
  const escaped = reviveSafeTags(escapeHtml(text));
  return escaped
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}
