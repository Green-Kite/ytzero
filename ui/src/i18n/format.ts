// Helper for the per-language `format` section of each locale file.
// Most locale-aware formatting (relative time, compact numbers) is done with the
// built-in Intl APIs in index.tsx, so the only thing locales must spell out is
// noun pluralization, which Intl can select but not provide words for.

/** Word forms for the plural categories we use. `other` is the required fallback. */
export type PluralForms = { one: string; few?: string; many?: string; other: string };

/** Pick the correct plural form for `n` using the language's CLDR rules. */
export function plural(localeTag: string, n: number, forms: PluralForms): string {
  const rule = new Intl.PluralRules(localeTag).select(n);
  return (forms as Record<string, string | undefined>)[rule] ?? forms.other;
}
