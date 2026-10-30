import { FLAG_META } from '@/lib/sanmarineRules';

// How an alert presents itself: the headline always comes from the alert's CATEGORY, never from the stored
// sentence, so an alert recorded earlier reads exactly as clearly as a new one.

export const alertType = (a) => FLAG_META[a.category]?.headline || FLAG_META[a.category]?.label || a.title || a.category || 'অজানা সমস্যা';

// The exact KG gap: stored as a number on new alerts; older alerts carried it only inside the sentence.
export function alertKg(a) {
  const stored = Number(a.differenceKg);
  if (Number.isFinite(stored) && stored !== 0) return Math.abs(stored);
  const m = /পার্থক্য\s*([+-]?\d+(?:\.\d+)?)/.exec(a.description || '');
  return m ? Math.abs(Number(m[1])) : null;
}

// The two numbers that were compared (slip vs monitor, previous vs current …).
export const alertCompare = (a) => (a.expectedValue || a.actualValue ? [a.expectedValue || '—', a.actualValue || '—'] : null);