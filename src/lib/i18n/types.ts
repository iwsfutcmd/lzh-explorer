/**
 * A message is a string with `{name}` placeholders, or a set of variants keyed
 * by CLDR plural category (selected with the `count` parameter).
 */
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Message = string | PluralMessage;
