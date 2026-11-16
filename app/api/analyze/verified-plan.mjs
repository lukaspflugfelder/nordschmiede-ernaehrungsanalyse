import { FOOD_CATALOG, foodIsAllowed } from './user-profile.mjs';
import { METRICS, emptyNutrients, nutrients } from './nutrition-ledger.mjs';

export const TOLERANCE = { kcal: 100, protein: 10, fett: 5, kohlenhydrate: 20 };
export function planWithinCorridor(effect, target) {
  return METRICS.every(key => Math.abs((effect[key] || 0) - target[key]) <= TOLERANCE[key]);
}

export function safeEnergyDirection(effect, target) {
  return Math.abs(effect.kcal - target.kcal) <= Math.max(TOLERANCE.kcal, Math.abs(target.kcal)) &&
    (Math.abs(target.kcal) <= TOLERANCE.kcal ? Math.abs(effect.kcal) <= TOLERANCE.kcal
      : effect.kcal * target.kcal >= 0);
}

export function planScore(effect, target) {
  return METRICS.reduce((total, key) => {
    const gap = Math.max(0, Math.abs(effect[key] - target[key]) - TOLERANCE[key]);
    return total + (gap / Math.max(TOLERANCE[key], Math.abs(target[key]))) ** 2 * (key === 'kcal' ? 5 : 1);
  }, 0);
}

// Every effect comes from the same item ledger as intake. No model-derived food totals,
// invented effect scaling, fixed step count or compulsory calorie-reduction habits.
export function buildVerifiedCandidates(ledger, profile, target) {
  const groups = new Map();
  for (const entry of ledger.entries) {
    const key = entry.food.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const candidates = [];
  const add = (entries, key, title, action, foodIds, minutes, weeklyEffect) => {
    if (profile.maxPrepMinutes !== null && minutes > profile.maxPrepMinutes) return;
    candidates.push({ key, group: key, title, action, frequency: `${new Set(entries.map(entry => entry.day)).size}x/Woche`,
      focus: 'Die gesamte Wochenbilanz dem Ziel annähern',
      why: 'Mengen und Nährwertwirkung werden mit derselben Datenbasis wie dein Protokoll berechnet.',
      days: [...new Set(entries.map(entry => entry.day))], sourceIds: entries.map(entry => entry.sourceId),
      weeklyEffect, targetFoodIds: foodIds, prepMinutes: minutes, profileAction: true, priority: 20 });
  };
  for (const [group, entries] of groups) {
    const food = entries[0].food;
    const before = entries.reduce((sum, entry) => {
      METRICS.forEach(key => { sum[key] += entry[key]; }); return sum;
    }, emptyNutrients());
    const days = [...new Set(entries.map(entry => entry.day))].join(', ');
    // Water is the only full removal. Other changes retain the meal's taste/role.
    if (food.role === 'drink' && food.kcal > 0 && ['cola', 'juice'].includes(food.id)) {
      for (const fraction of [0.25, 0.5, 1]) {
        add(entries, `drink_sugar_${group}_${fraction}`, 'Zuckergetränke dosiert ersetzen',
          `Bei deinen protokollierten Portionen ${food.name} (Tag ${days}) ersetzt du jeweils ${fraction * 100} % der Menge durch dieselbe Menge Wasser.`,
          ['water'], 0, Object.fromEntries(METRICS.map(key => [key, -before[key] * fraction])));
      }
    }
    // Explicit portion adjustments instead of nonsensical sweet-to-savory substitutions.
    const catalogFood = FOOD_CATALOG.find(item => item.id === food.id) || (food.portionAdjustable ? food : null);
    if (catalogFood && foodIsAllowed(catalogFood, { ...profile, dietStrategy: 'standard' }) && !['drink', 'vegetable'].includes(food.role)) {
      const reduce = target.kcal < -TOLERANCE.kcal || (target.fett < -TOLERANCE.fett && food.fett > 10) || (target.kohlenhydrate < -TOLERANCE.kohlenhydrate && food.kohlenhydrate > 20);
      const increase = target.kcal > TOLERANCE.kcal && ['bread', 'cereal', 'starch', 'savory', 'dairy'].includes(food.role) && foodIsAllowed(catalogFood, profile);
      const factors = [...(reduce ? [-0.25, -0.5] : []), ...(increase ? [0.25, 0.5, 1] : [])];
      for (const fraction of factors) {
        const portions = [...new Set(entries.map(entry => `${entry.amount} → ${Math.round(entry.amount * (1 + fraction) * 10) / 10} ${food.unit}`))].join('; ');
        add(entries, `portion_${group}_${fraction}`, `${food.name}: Portion anpassen`,
          `Bei diesem Wochenmuster (Tag ${days}) passt du die jeweilige Portion ${food.name} an: ${portions}. Die übrige Mahlzeit bleibt gleich.`,
          [food.id], catalogFood.minutes, Object.fromEntries(METRICS.map(key => [key, before[key] * fraction])));
      }
    }
    if (food.role === 'dairy' && food.unit === 'g') {
      for (const replacement of FOOD_CATALOG.filter(item => ['skyr', 'skyr_lf'].includes(item.id) && item.id !== food.id && foodIsAllowed(item, profile))) {
        const totalGrams = entries.reduce((sum, entry) => sum + entry.amount, 0);
        const after = nutrients(replacement, totalGrams);
        add(entries, `dairy_${group}_${replacement.id}`, `${food.name} passend ersetzen`,
          `Bei deinem Joghurt-/Quark-Muster (Tag ${days}) ersetzt du ${food.name} durch dieselbe Grammmenge ${replacement.name}. Die übrige Mahlzeit bleibt gleich. Zubereitungszeit ca. ${replacement.minutes} Minute.`,
          [replacement.id], replacement.minutes, Object.fromEntries(METRICS.map(key => [key, after[key] - before[key]])));
      }
    }
  }
  // Additions are counted explicitly, with a concrete meal context and bounded portions.
  const hasRegularSkyr = FOOD_CATALOG.some(item => item.id === 'skyr' && foodIsAllowed(item, profile));
  for (const food of FOOD_CATALOG.filter(item => ['skyr', 'skyr_lf', 'tofu', 'tuna', 'lentils', 'oil', 'oats', 'bread'].includes(item.id) && foodIsAllowed(item, profile))) {
    if (food.id === 'skyr_lf' && hasRegularSkyr) continue;
    if (ledger.entries.some(entry => entry.food.id === food.id)) continue;
    const isProtein = food.proteinSource;
    if (target.kcal <= TOLERANCE.kcal && (!isProtein || target.protein <= TOLERANCE.protein)) continue;
    if (food.id === 'oil' && target.fett <= TOLERANCE.fett) continue;
    if (['oats', 'bread'].includes(food.id) && target.kohlenhydrate <= TOLERANCE.kohlenhydrate) continue;
    const meal = ['skyr', 'skyr_lf', 'oats', 'bread'].includes(food.id) ? 'zum Frühstück' : 'zu einer herzhaften Hauptmahlzeit';
    for (const grams of [food.portion / 2, food.portion]) {
      for (const count of [3, 5, 7]) {
        const entries = Array.from({ length: count }, (_, index) => ({ day: index + 1, sourceId: `addition_${food.id.startsWith('skyr') ? 'skyr' : food.id}` }));
        add(entries, `addition_${food.id}_${grams}_${count}`, `${food.name} ergänzen`,
          `An ${count} Tagen pro Woche ergänzt du jeweils ${grams} g ${food.name} ${meal}. Zubereitungszeit mit verzehrfertigen Zutaten ca. ${food.minutes} Minuten. Diese zusätzliche Portion ist vollständig eingerechnet.`,
          [food.id], food.minutes, nutrients(food, grams * count));
      }
    }
  }
  return candidates;
}
