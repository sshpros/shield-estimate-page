// Upgrade sections (Kyle 2026-11-17): an optional (reference) section can
// REPLACE base lines instead of stacking on top — "Upgrade to G6 Pro Turret
// cameras" (7 × $599) swaps out the 7 × $249 G6 Turrets. The section lists the
// base line ids in `replacesItemIds`; it is priced at its NET change, and while
// it is added the replaced lines drop out of the customer's total.
// Mirrors shield-app supabase/functions/_shared/upgradeSections.ts.

export type UpgradeLine = {
  id?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total?: number;
  discount_amount?: number;
  section_name?: string | null;
  is_recurring?: boolean | null;
};

export type UpgradeSection = {
  name: string;
  isReference?: boolean;
  replacesItemIds?: string[] | null;
};

const roundCents = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const normId = (v: unknown) => String(v ?? '').trim().toUpperCase();

export const upgradeLineAmount = (li: UpgradeLine) =>
  li.total ?? Math.max(0, (li.quantity ?? 0) * (li.unit_price ?? 0) - Number(li.discount_amount ?? 0));

export type UpgradeInfo<T extends UpgradeLine> = {
  /** Base lines (in `items`) this optional section replaces. */
  replaced: T[];
  sectionTotal: number;
  replacedTotal: number;
  /** What adding it changes the one-time total by. */
  net: number;
  netMonthly: number;
  /** "Replaces 7× UniFi G6 Turret" ("" when nothing). */
  summary: string;
};

/**
 * Net pricing for one optional section over the lines being shown (the active
 * tier's lines on a tiered estimate). Lines in another optional section are
 * never replaced.
 */
export function upgradeInfo<T extends UpgradeLine>(
  section: UpgradeSection,
  items: T[],
  sections: UpgradeSection[],
): UpgradeInfo<T> {
  const refs = new Set(sections.filter((s) => s.isReference).map((s) => s.name));
  const ids = new Set((section.replacesItemIds ?? []).map(normId).filter(Boolean));
  const replaced = ids.size
    ? items.filter((li) => li.id && ids.has(normId(li.id)) && !refs.has(li.section_name ?? ''))
    : [];
  const own = items.filter((li) => (li.section_name ?? '') === section.name);
  const sum = (rows: T[], recurring: boolean) =>
    roundCents(rows.filter((li) => (li.is_recurring === true) === recurring).reduce((s, li) => s + upgradeLineAmount(li), 0));
  const sectionTotal = sum(own, false);
  const replacedTotal = sum(replaced, false);
  return {
    replaced,
    sectionTotal,
    replacedTotal,
    net: roundCents(sectionTotal - replacedTotal),
    netMonthly: roundCents(sum(own, true) - sum(replaced, true)),
    summary: replacementSummary(replaced),
  };
}

export function replacementSummary(replaced: UpgradeLine[]): string {
  if (!replaced.length) return '';
  const order: string[] = [];
  const qty = new Map<string, number>();
  for (const li of replaced) {
    if (!qty.has(li.name)) order.push(li.name);
    qty.set(li.name, (qty.get(li.name) ?? 0) + Math.round(Number(li.quantity ?? 0)));
  }
  return 'Replaces ' + order.map((n) => `${qty.get(n)}× ${n}`).join(', ');
}
