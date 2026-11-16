import { FOOD_CATALOG } from './user-profile.mjs';

export const METRICS = ['kcal', 'protein', 'fett', 'kohlenhydrate'];
export const emptyNutrients = () => Object.fromEntries(METRICS.map(key => [key, 0]));
const plain = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
const round = value => Math.round(value * 10) / 10;

// Fixed generic estimates per 100 g/ml, deliberately not product-specific lab values.
// The same catalog powers intake and changes. Product labels take precedence in counselling.
const extraFoods = [
  ['cola', 'Cola / Limonade', /cola|limonade|fanta|sprite|eistee/, 0, 0, 10.5, 250, 'ml', 'drink'],
  ['zero', 'Zuckerfreies Getränk', /(?:cola\s*)?(?:zero|light)|(?:cola|limonade)\s*(?:zero|light|zuckerfrei)/, 0, 0, 0, 250, 'ml', 'drink'],
  ['juice', 'Fruchtsaft', /(?:apfel|orangen|frucht)?saft/, 0.2, 0, 10, 200, 'ml', 'drink'],
  ['coffee', 'Kaffee ohne Zusätze', /kaffee|espresso/, 0, 0, 0, 150, 'ml', 'drink'],
  ['tea', 'Tee ohne Zusätze', /(?:ungesusster\s+)?tee/, 0, 0, 0, 200, 'ml', 'drink'],
  ['milk', 'Milch (Standardannahme 1,5 % Fett)', /milch/, 3.4, 1.5, 4.8, 200, 'ml', 'dairy'],
  ['soy_drink', 'Sojadrink ungesüßt', /(?:ungesusst(?:em|er|en)?\s+)?soja(?:drink|milch)/, 3.3, 1.8, 0.7, 250, 'ml', 'dairy'],
  ['oat_drink', 'Haferdrink', /hafer(?:drink|milch)/, 1, 1.5, 6.5, 250, 'ml', 'dairy'],
  ['sugar', 'Zucker', /zucker/, 0, 0, 100, 5, 'g', 'sweet'],
  ['butter', 'Butter', /butter/, 0.7, 82, 0.6, 10, 'g', 'fat'],
  ['jam', 'Marmelade', /marmelade|konfiture/, 0.3, 0.1, 60, 25, 'g', 'spread'],
  ['nutella', 'Nuss-Nougat-Creme', /nutella|nuss[ -]nougat[ -]creme/, 6, 31, 57, 25, 'g', 'spread'],
  ['rice', 'Reis (gekocht)', /(?:gekocht\w*\s+)?(?:vollkorn)?reis(?:\s*\(?gekocht\)?)?/, 2.7, 0.7, 28, 200, 'g', 'starch'],
  ['pasta', 'Nudeln (gekocht)', /(?:gekocht\w*\s+)?(?:vollkorn)?(?:nudeln|pasta|spaghetti)(?:\s*\(?gekocht\)?)?/, 5, 1.2, 28, 200, 'g', 'starch'],
  ['potato', 'Kartoffeln (gekocht)', /kartoffeln?/, 2, 0.1, 15, 250, 'g', 'starch'],
  ['muesli', 'Müsli', /musli|muesli/, 10, 7, 64, 70, 'g', 'cereal'],
  ['roll', 'Brötchen', /brotchen|broetchen/, 9, 2, 52, 60, 'g', 'bread'],
  ['chicken', 'Hähnchenbrust', /hahnchen(?:brust)?|haehnchen(?:brust)?|huhnerbrust/, 23, 2, 0, 150, 'g', 'savory'],
  ['turkey', 'Putenbrust', /putenbrust|putenaufschnitt|pute/, 23, 2, 1, 50, 'g', 'topping'],
  ['sausage', 'Wurst / Aufschnitt', /wurst|salami|aufschnitt/, 18, 28, 1, 40, 'g', 'topping'],
  ['egg', 'Ei', /eiern?(?:\s+als\s+ruhrei)?|ei|ruhrei(?:er)?/, 13, 11, 1, 60, 'g', 'savory'],
  ['quark', 'Magerquark', /magerquark|quark/, 12, 0.3, 4, 200, 'g', 'dairy'],
  ['cream_cheese', 'Frischkäse', /frischkase|frischkaese/, 6, 22, 4, 40, 'g', 'topping'],
  ['cream_sauce', 'Sahnesauce', /sahne(?:sauce|sosse)/, 3, 15, 6, 150, 'g', 'sauce'],
  ['bolognese', 'Bolognese', /bolognese/, 8, 7, 6, 180, 'g', 'sauce'],
  ['tomato_sauce', 'Tomatensauce', /tomaten(?:sauce|sosse)/, 1.5, 1, 6, 150, 'g', 'sauce'],
  ['pizza', 'Pizza Margherita', /pizza(?:\s*margherita)?/, 10, 9, 30, 350, 'g', 'dish'],
  ['burger', 'Burger', /(?:hamburger|cheeseburger|burger)/, 13, 12, 23, 250, 'g', 'dish'],
  ['doener', 'Döner', /doner|doener/, 10, 9, 21, 450, 'g', 'dish'],
  ['fries', 'Pommes', /pommes(?:\s*frites)?/, 3.5, 15, 38, 150, 'g', 'starch'],
  ['protein_bar', 'Proteinriegel', /proteinriegel|eiweissriegel/, 30, 12, 35, 60, 'g', 'sweet'],
  ['chocolate_bar', 'Schokoriegel', /schokoriegel/, 6, 28, 60, 50, 'g', 'sweet'],
  ['nuts', 'Nüsse / Mandeln', /nusse|nuesse|mandeln|walnusse|haselnusse|cashews?/, 18, 55, 15, 30, 'g', 'snack'],
  ['banana', 'Banane', /bananen?/, 1.2, 0.2, 20, 120, 'g', 'fruit'],
  ['apple', 'Apfel', /apfel|apfel/, 0.3, 0.2, 12, 150, 'g', 'fruit'],
  ['berries', 'Beeren', /beeren|erdbeeren|himbeeren|blaubeeren/, 1, 0.4, 7, 100, 'g', 'fruit'],
  ['avocado', 'Avocado', /avocado/, 2, 15, 2, 70, 'g', 'topping'],
  ['vegetables', 'Gemüse / Salat ohne Dressing', /gemuse|gemuese|salat|brokkoli|tomaten?(?:\s*(?:und|[+/])\s*gurken?)?|gurken?(?:\s*(?:und|[+/])\s*tomaten?)?/, 1.5, 0.3, 3, 200, 'g', 'vegetable']
].map(([id, name, aliases, protein, fett, kohlenhydrate, portion, unit, role]) =>
  ({ id, name, aliases, protein, fett, kohlenhydrate, portion, unit, role, kcal: protein * 4 + fett * 9 + kohlenhydrate * 4 }));

const roles = { water: 'drink', skyr: 'dairy', skyr_lf: 'dairy', tofu: 'savory', tuna: 'savory', lentils: 'savory', chocolate: 'sweet', chips: 'snack', cheese: 'topping', yogurt: 'dairy', oats: 'cereal', bread: 'bread', oil: 'fat' };
const portionTags = { butter: ['milk', 'lactose'], nuts: ['nuts', 'peanuts'], rice: [], pasta: ['gluten', 'eggs'], potato: [], chicken: ['meat'], turkey: ['meat'], egg: ['eggs'], quark: ['milk', 'lactose'], milk: ['milk', 'lactose'], avocado: [] };
export const INTAKE_FOODS = [
  ...FOOD_CATALOG.map(food => ({ ...food, unit: food.id === 'water' ? 'ml' : 'g', role: roles[food.id], aliases: new RegExp(food.id === 'bread' ? '(?:vollkorn)?brot|toast' : plain(food.aliases.source)) })),
  ...extraFoods.map(food => ({ ...food, ...(food.id in portionTags ? { tags: portionTags[food.id], minutes: 0, portionAdjustable: true } : {}) }))
];

export function nutrients(food, amount) {
  return Object.fromEntries(METRICS.map(key => [key, food[key] * amount / 100]));
}

export function amountsInText(text) {
  const source = plain(text);
  const pattern = /\b(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(kg|ml|cl|dl|g|l|el|tl|stuck|scheiben?|tassen?|glaser?)?\b/g;
  return [...source.matchAll(pattern)].map(match => ({
    start: match.index, end: match.index + match[0].length,
    value: match[2] ? (Number(match[1].replace(',', '.')) + Number(match[2].replace(',', '.'))) / 2 : Number(match[1].replace(',', '.')),
    unit: match[3] || 'count', range: Boolean(match[2])
  }));
}

function foodMentions(text) {
  const possible = INTAKE_FOODS.flatMap(food => [...text.matchAll(new RegExp(`\\b(?:${food.aliases.source})\\b`, 'g'))]
    .map(match => ({ food, start: match.index, end: match.index + match[0].length })));
  // A compound food (e.g. Sojamilch, Frischkäse, Cola Zero) owns its full span.
  const selected = [];
  for (const item of possible.sort((a, b) => (b.end - b.start) - (a.end - a.start))) {
    if (!selected.some(other => item.start < other.end && item.end > other.start)) selected.push(item);
  }
  return selected.sort((a, b) => a.start - b.start);
}

const boundary = /[,;\n]|\b(?:und|plus)\b/;
function boundAmount(text, mentions, amounts, index) {
  const mention = mentions[index];
  const previousEnd = mentions[index - 1]?.end ?? 0;
  const nextStart = mentions[index + 1]?.start ?? text.length;
  const before = amounts.filter(amount => amount.start >= previousEnd && amount.end <= mention.start && !boundary.test(text.slice(amount.end, mention.start))).at(-1);
  const after = amounts.find(amount => amount.start >= mention.end && amount.end <= nextStart && !boundary.test(text.slice(mention.end, amount.start))) || null;
  if (before && !['g', 'kg', 'ml', 'l', 'cl', 'dl'].includes(before.unit) && after && ['g', 'kg', 'ml', 'l'].includes(after.unit)) return { ...after, countQualifier: before };
  return before || after;
}

function convertAmount(amount, food) {
  if (!amount) return { amount: food.portion, estimated: true };
  const { value, unit } = amount;
  if (unit === 'count' || /stuck|tasse|glas/.test(unit)) return { amount: value * food.portion, estimated: true };
  if (/scheibe/.test(unit)) return { amount: value * (food.role === 'bread' ? 50 : 25), estimated: true };
  if (unit === 'el' || unit === 'tl') return { amount: value * (unit === 'el' ? 15 : 5), estimated: true };
  const liquid = ['ml', 'l', 'cl', 'dl'].includes(unit);
  if ((food.unit === 'ml') !== liquid) return { error: `Bitte die Menge von ${food.name} in ${food.unit} angeben.` };
  return { amount: value * ({ kg: 1000, l: 1000, cl: 10, dl: 100 }[unit] || 1), estimated: amount.range };
}

export function parseMeal(value) {
  const text = plain(value).replace(/cola\s+(?:ohne\s*zucker|zuckerfrei)/g, 'cola zero');
  if (/(?:^|[,;\s])[-−]\s*\d/.test(text)) return { entries: [], issues: ['Negative Lebensmittelmengen sind nicht auswertbar. Bitte die Menge prüfen.'] };
  if (/\b\d+[.,]\d{3}\b/.test(text)) return { entries: [], issues: ['Bitte Mengen ohne Tausendertrennzeichen angeben, z. B. 1000 ml statt 1.000 ml.'] };
  if (!text.trim() || /^(?:keine?r?|nichts|entfallt|ausgelassen|gefastet|fasten|-)\.?$/.test(text.trim())) return { entries: [], issues: [] };
  const mentions = foodMentions(text);
  const amounts = amountsInText(text);
  const usedAmounts = new Set();
  const entries = [];
  const issues = [];
  mentions.forEach((mention, index) => {
    let food = mention.food;
    if (/\bohne\s*$/.test(text.slice(Math.max(0, mention.start - 8), mention.start))) return;
    const amount = boundAmount(text, mentions, amounts, index);
    if (amount && usedAmounts.has(amount)) { issues.push(`Menge bei ${food.name} ist mehrdeutig.`); return; }
    if (amount) usedAmounts.add(amount);
    if (amount?.countQualifier) usedAmounts.add(amount.countQualifier);
    const section = text.slice(mentions[index - 1]?.end ?? 0, mention.start).split(/[,;]|\bund\b/).at(-1) + text.slice(mention.start, mention.end) + text.slice(mention.end, mentions[index + 1]?.start ?? text.length).split(/[,;]|\bund\b/)[0];
    if (['rice', 'pasta'].includes(food.id)) {
      const raw = /\b(?:roh\w*|trocken\w*|ungekocht\w*)\b/.test(section);
      const cooked = /\b(?:gekocht\w*|gegart\w*)\b/.test(section);
      if (!raw && !cooked) issues.push(`Bitte bei ${food.name.split(' (')[0]} ergänzen, ob die Menge roh/trocken oder gekocht gewogen wurde.`);
      if (raw && cooked) issues.push(`Roh-/Gekochte-Menge bei ${food.name} ist mehrdeutig.`);
      if (raw) food = { ...food, name: food.name.replace('gekocht', 'trocken'), protein: food.id === 'rice' ? 7 : 13, fett: 1.5, kohlenhydrate: food.id === 'rice' ? 77 : 70, kcal: food.id === 'rice' ? 349.5 : 345.5 };
    }
    const converted = convertAmount(amount, food);
    if (converted.error) { issues.push(converted.error); return; }
    if (!(converted.amount > 0) || converted.amount > (food.unit === 'ml' ? 10000 : 3000)) { issues.push(`Bitte die Menge von ${food.name} prüfen.`); return; }
    entries.push({ food, amount: converted.amount, estimated: converted.estimated, ...nutrients(food, converted.amount) });
  });
  // Do not silently drop unknown foods or extra quantities from a mixed entry.
  const spans = [...mentions, ...usedAmounts].sort((a, b) => b.start - a.start);
  let remainder = text;
  for (const span of spans) remainder = remainder.slice(0, span.start) + ' '.repeat(span.end - span.start) + remainder.slice(span.end);
  remainder = remainder.replace(/\b(?:mit|und|oder|plus|dazu|ca|circa|etwa|natur|ungesusst\w*|verzehrfertig\w*|aus|der|dem|die|dose|konserve|abgetropft|gemischt\w*|gekocht\w*|gegart\w*|roh\w*|trocken\w*|ungekocht\w*|ohne|dressing|wasser|schwarz|klein\w*|gross\w*|vollkorn|zum|fruhstuck|mittagessen|abendessen)\b/g, ' ').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  if (remainder) issues.push(`Noch nicht eindeutig zugeordnet: „${remainder}“. Bitte Namen und Mengen prüfen. Unbekannte Lebensmittel werden nicht automatisch geschätzt; dafür kann eine individuelle Auswertung nötig sein.`);
  return { entries, issues };
}

export function buildNutritionLedger(days) {
  const entries = [];
  const issues = [];
  for (const [dayIndex, day] of days.entries()) {
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks']) {
      const parsed = parseMeal(day[meal]);
      parsed.issues.forEach(message => issues.push({ day: dayIndex + 1, meal, message }));
      parsed.entries.forEach((entry, index) => entries.push({ ...entry, day: dayIndex + 1, meal, sourceId: `ledger_${dayIndex + 1}_${meal}_${index}` }));
    }
  }
  const weekly = entries.reduce((total, entry) => {
    METRICS.forEach(key => { total[key] += entry[key]; });
    return total;
  }, emptyNutrients());
  const daily = Object.fromEntries(METRICS.map(key => [key, round(weekly[key] / 7)]));
  const estimatedCount = entries.filter(entry => entry.estimated).length;
  return { entries, issues, weekly, daily, estimatedCount,
    note: `Nährwerte aus festen, generischen Standardwerten; Produkt und Zubereitung können abweichen. ${estimatedCount ? `${estimatedCount} Portionsmengen wurden aus Standardportionen, Stückzahlen oder Mengenbereichen geschätzt.` : 'Die erfassten Mengen wurden den einzelnen Lebensmitteln zugeordnet.'} Roh-/Gekochte-Angaben bei Reis und Nudeln werden getrennt berücksichtigt. Die Berechnung ist unabhängig von Körperdaten und Ziel.` };
}

export function ledgerFoodAnalysis(ledger) {
  const groups = new Map();
  for (const entry of ledger.entries) {
    const key = entry.food.name;
    if (!groups.has(key)) groups.set(key, { lebensmittel: key, amount: 0, unit: entry.food.unit, ...emptyNutrients() });
    const group = groups.get(key);
    group.amount += entry.amount;
    METRICS.forEach(metric => { group[metric] += entry[metric]; });
  }
  return [...groups.values()].map(group => ({ ...group, menge: `${round(group.amount)} ${group.unit} / Woche`,
    ...Object.fromEntries(METRICS.map(key => [key, round(group[key])])), bewertung: 'neutral',
    einordnung: 'Summe der protokollierten Woche; generische Nährwertschätzung, keine Empfehlung.' }));
}

// Legacy callers now get an amount bound to an actual food mention, never a neighbour's water.
export function amountForFood(text, keywords, unit, fallback) {
  const parsed = parseMeal(text);
  const matching = parsed.entries.filter(entry => entry.food.unit === unit && keywords.some(word => plain(entry.food.name).includes(plain(word)) || entry.food.aliases.test(plain(word))));
  return matching.length ? matching.reduce((total, entry) => total + entry.amount, 0) : fallback;
}
