const KEYWORDS = new Set("ADD ALTER AND AS AUTO_INCREMENT AUTOINCREMENT BY CASCADE CHECK COLUMN COMMENT CONSTRAINT CREATE DEFAULT DELETE ENUM EXISTS FOREIGN GENERATED IDENTITY IF IN INDEX IS KEY NO ACTION NOT NULL ON PRIMARY REFERENCES RESTRICT SET TABLE TYPE UNIQUE UPDATE".split(" "));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Turns a SQL script into HTML with spans for comments, strings, numbers, keywords
// and the type that follows a column name. Everything is escaped, so the result is
// safe to insert as markup.
export function highlightSql(sql: string): string {
  const re = /(--[^\n]*)|('(?:[^']|'')*')|("(?:[^"]|"")*"|`[^`]*`|\[[^\]\n]*\])|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let out = "", last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    out += esc(sql.slice(last, m.index));
    last = m.index + m[0].length;
    const cls = m[1] ? "sc" : m[2] ? "ss" : m[3] ? "si" : m[4] ? "sn" : KEYWORDS.has(m[5].toUpperCase()) && m[5] === m[5].toUpperCase() ? "sk" : "";
    out += cls ? `<span class="${cls}">${esc(m[0])}</span>` : esc(m[0]);
  }
  return out + esc(sql.slice(last));
}
