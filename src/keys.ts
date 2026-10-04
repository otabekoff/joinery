const PUNCTUATION: Record<string, string> = {
  Backslash: "\\", Comma: ",", Period: ".", Slash: "/", Equal: "=", Minus: "-", NumpadAdd: "+", NumpadSubtract: "-",
};

// The key a shortcut refers to. On keyboard layouts that don't produce Latin letters
// (Cyrillic, for example) `event.key` is not the letter printed in our shortcut list,
// so fall back to the key's physical position.
export function keyOf(e: KeyboardEvent): string {
  const k = e.key;
  if (/^[a-z]$/i.test(k)) return k.toLowerCase();
  if (k.length === 1 && e.code.startsWith("Key")) return e.code.slice(3).toLowerCase();
  if ((e.ctrlKey || e.metaKey) && PUNCTUATION[e.code]) return PUNCTUATION[e.code];
  return k;
}
