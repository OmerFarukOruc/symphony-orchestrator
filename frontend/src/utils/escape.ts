const htmlEscapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const htmlEscapePattern = /[&<>"']/g;

export function escapeHtml(text: string): string {
  return text.replaceAll(htmlEscapePattern, (char) => htmlEscapeMap[char] ?? char);
}
