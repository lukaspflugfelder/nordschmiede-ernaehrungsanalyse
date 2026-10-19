export const PROFILE_VERSION = "v47_shared_user_profile";

function plain(value) {
  return String(value || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe")
    .replace(/ü/g, "ue").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const restrictionRules = [
  ["milk", /milch(?:eiweiss|protein|produkte?|allergie)?|kasein|casein|molke|whey/g],
  ["lactose", /la[ck]tose(?:intoleranz|intolerant|unvertraeglichkeit)?/g],
  ["gluten", /gluten(?:unvertraeglichkeit)?|zoeliakie|weizen|roggen|gerste|dinkel/g],
  ["eggs", /huehnerei(?:weiss)?|eier|\bei\b|eiallergie/g],
  ["peanuts", /erdn(?:uss|uesse)(?:allergie)?|peanuts?/g],
  ["nuts", /(?:schalenfruechte|haseln(?:uss|uesse)|waln(?:uss|uesse)|pekann(?:uss|uesse)|paran(?:uss|uesse)|mandeln?|cashews?|pistazien?|macadamia|\bn(?:uss|uesse))(?:allergie)?/g],
  ["soy", /soja(?:allergie)?|soy/g],
  ["fish", /\bfisch(?:allergie)?\b/g],
  ["crustaceans", /krebstiere?|garnelen?|krabben?|shrimps?|hummer/g],
  ["molluscs", /weichtiere?|muscheln?|tintenfisch|calamari/g],
  ["celery", /sellerie/g], ["mustard", /senf/g], ["sesame", /sesam/g],
  ["lupin", /lupinen?/g], ["sulphites", /sulfite?|sulphite?|schwefeldioxid/g]
];

const foodRules = [
  ["animal", /tierisch\w*\s+(?:produkte?|lebensmittel)|tierprodukte?/g],
  ...restrictionRules,
  ["meat", /fleisch/g],
  ["mushrooms", /pilze?|champignons?/g], ["tomato", /tomaten?/g],
  ["oats", /hafer(?:flocken)?/g], ["legumes", /huelsenfruechte|linsen|kichererbsen|bohnen/g]
];

const emptyStatement = /^(?:keine?(?: bekannten)?(?: allergien| unvertraeglichkeiten| einschraenkungen| abneigungen)?|nein|nichts|keinerlei|alles|keine angabe|-)\.?$/;
const labels = {
  milk: "Milcheiweiß", lactose: "Laktose", gluten: "glutenhaltiges Getreide", eggs: "Eier",
  peanuts: "Erdnüsse", nuts: "Schalenfrüchte", soy: "Soja", fish: "Fisch",
  crustaceans: "Krebstiere", molluscs: "Weichtiere", celery: "Sellerie", mustard: "Senf",
  sesame: "Sesam", lupin: "Lupine", sulphites: "Sulfite", meat: "Fleisch",
  mushrooms: "Pilze", tomato: "Tomaten", oats: "Hafer", legumes: "Hülsenfrüchte",
  animal: "tierische Produkte"
};

function parseRestrictions(value, isAllergy) {
  const text = plain(value).trim();
  if (!text || emptyStatement.test(text)) return { tags: [], terms: [], unknown: [] };
  if (isAllergy && /^keine?\s+(?:bekannte?\s+)?[a-z]+(?:allergie|intoleranz)\.?$/.test(text)) {
    return { tags: [], terms: [], unknown: [] };
  }
  const tags = new Set();
  let remaining = text;
  for (const [tag, pattern] of isAllergy ? restrictionRules : foodRules) {
    if (new RegExp(pattern.source).test(remaining)) {
      tags.add(tag);
      remaining = remaining.replace(pattern, " ");
    }
  }
  remaining = remaining
    .replace(/\b(?:allergi\w*|unvertraeglich\w*|intoleran\w*|bekannt\w*|produkte?|keine?\w*|sonst|weiter\w*|gegen|auf|und|oder|sowie|ich|habe|bin|vertrage|vertraegt|nicht|mag|esse|gern\w*|bitte|ohne|mit|nur|auch|aber|ausser|allerdings)\b/g, " ")
    .replace(/[^a-z0-9 ,;/\n-]/g, " ").trim();
  const terms = remaining.split(/[,;/\n]+/).map(term => term.trim().replace(/\s+/g, " ")).filter(Boolean);
  return { tags: [...tags], terms: isAllergy ? [] : terms, unknown: isAllergy ? terms : [] };
}

export function parseCookingTime(value) {
  const text = plain(value).trim();
  if (!text || /^(egal|beliebig|unbegrenzt|keine angabe|-)\.?$/.test(text)) return { minutes: null };
  if (/^(keine zeit|ohne kochen|kein kochen|nur verzehrfertig)$/.test(text)) return { minutes: 0 };
  if (/^(eine? )?halbe stunde$/.test(text)) return { minutes: 30 };
  if (/^(eine? )?viertelstunde$/.test(text)) return { minutes: 15 };
  const match = text.match(/^(?:max(?:imal)?\.?|bis zu|ca\.?|hoechstens)?\s*(\d+(?:[.,]\d+)?)(?:\s*(?:[-–]|bis)\s*(\d+(?:[.,]\d+)?))?\s*(min(?:uten?)?\.?|h|std\.?|stunden?)?(?:\s+(?:pro|je)\s+(?:mahlzeit|gericht|zubereitung))?$/);
  if (!match) return { error: "Bitte gib die maximale Zubereitungszeit eindeutig an, z. B. 15 Minuten pro Mahlzeit." };
  const first = Number(match[1].replace(",", "."));
  const second = match[2] ? Number(match[2].replace(",", ".")) : first;
  const minutes = Math.max(first, second) * (/^(h|std|stunde)/.test(match[3] || "") ? 60 : 1);
  if (minutes > 240) return { error: "Bitte gib eine Zubereitungszeit zwischen 0 und 240 Minuten an." };
  return { minutes };
}

export function buildUserProfile(form, targets) {
  const extraMedicalStatements = [form.dietType, form.dislikes, form.goal, form.cookingTime]
    .flatMap(value => String(value || "").split(/[,;]/))
    .filter(clause => /allerg|intoleran|unvertraeg|zoeliakie/.test(plain(clause)))
    .map(clause => plain(clause).replace(/\b(?:vegan\w*|vegetar\w*|pescetar\w*|keto\w*|low[ -]?carb|mischkost|muskelaufbau)\b/g, " "));
  const parsedAllergies = [form.intolerances, ...extraMedicalStatements].map(value => parseRestrictions(value, true));
  const allergies = { tags: [...new Set(parsedAllergies.flatMap(value => value.tags))],
    unknown: parsedAllergies.flatMap(value => value.unknown) };
  const dislikes = parseRestrictions(form.dislikes, false);
  const time = parseCookingTime(form.cookingTime);
  const dietText = plain([form.dietType, form.goal].join("; "))
    .replace(/\b(?:nicht|kein\w*)\s+(?:vegan\w*|vegetar\w*|pescetar\w*)\b/g, " ");
  const dietaryPattern = /vegan|rein pflanzlich/.test(dietText) ? "vegan"
    : /vegetar|fleischlos/.test(dietText) ? "vegetarian"
      : /pescetar/.test(dietText) ? "pescetarian" : "mixed";
  const errors = [];
  const dietExclusions = [];
  for (const [tag, pattern] of restrictionRules) {
    if (new RegExp(`(?:${pattern.source})(?:frei)|(?:ohne|kein\\w*)\\s+(?:${pattern.source})`).test(plain(form.dietType))) dietExclusions.push(tag);
  }
  if (allergies.unknown.length) errors.push(`Diese Allergie-/Unverträglichkeitsangabe kann noch nicht sicher zugeordnet werden: ${allergies.unknown.join(", ")}. Bitte konkretisiere die betroffenen Lebensmittel; bei medizinischen Ernährungsanforderungen ist eine individuelle Beratung nötig.`);
  if (time.error) errors.push(time.error);
  if ([form.dietType, form.goal].some(value => /\b(?:kein\w*|nicht|ohne)\s+(?:keto\w*|ketogen\w*)/.test(plain(value))) && targets.dietStrategy === "keto") {
    errors.push("Keto wird in den Angaben sowohl gewünscht als auch ausgeschlossen. Bitte löse diesen Widerspruch auf.");
  }
  if ([form.intolerances, form.dislikes, form.dietType, form.cookingTime].some(value => String(value).includes("[gekürzt]"))) {
    errors.push("Bitte kürze die Angaben zu Ernährungsform, Ausschlüssen oder Zeitbudget, damit keine Einschränkung abgeschnitten wird.");
  }
  const profile = {
    version: PROFILE_VERSION,
    body: {
      age: Number(String(form.age).replace(/[^\d.,]/g, "").replace(",", ".")),
      heightCm: Number(String(form.height).replace(/[^\d.,]/g, "").replace(",", ".")),
      weightKg: Number(String(form.weight).replace(/[^\d.,]/g, "").replace(",", ".")),
      targetWeightKg: Number(String(form.targetWeight || form.weight).replace(/[^\d.,]/g, "").replace(",", ".")),
      sexForEquation: targets.berechnungslogik.geschlechtFuerFormel,
      activityFactor: targets.activity.factor
    },
    goal: targets.goal,
    dietStrategy: targets.dietStrategy,
    dietaryPattern,
    targets: { ...targets.sollZustand },
    maxPrepMinutes: time.minutes ?? null,
    allergens: allergies.tags,
    excludedFoodIds: FOOD_CATALOG.filter(food => !emptyStatement.test(plain(form.dislikes).trim()) &&
      food.aliases.test(plain(form.dislikes))).map(food => food.id),
    excludedTags: [...new Set([...dislikes.tags, ...dietExclusions])],
    excludedTerms: dislikes.terms,
    originalInputs: { ...form }
  };
  profile.constrained = Boolean(profile.allergens.length || profile.excludedTags.length || profile.excludedFoodIds.length ||
    profile.excludedTerms.length || profile.maxPrepMinutes !== null ||
    dietaryPattern !== "mixed" || targets.dietStrategy !== "standard");
  return { profile, errors };
}

// Generic, ready-to-eat ingredients. Values are estimates per 100 g, not brand guarantees.
export const FOOD_CATALOG = [
  { id: "water", name: "Wasser", aliases: /wasser/, tags: [], minutes: 0, protein: 0, fett: 0, kohlenhydrate: 0, portion: 250 },
  { id: "skyr", name: "Skyr natur", aliases: /skyr/, tags: ["milk", "lactose"], minutes: 1, protein: 11, fett: 0.2, kohlenhydrate: 4, portion: 200, proteinSource: true },
  { id: "skyr_lf", name: "Laktosefreier Skyr natur", aliases: /laktosefreie\w* skyr/, tags: ["milk"], minutes: 1, protein: 11, fett: 0.2, kohlenhydrate: 4, portion: 200, proteinSource: true },
  { id: "tofu", name: "Verzehrfertiger Naturtofu", aliases: /(?:natur)?tofu/, tags: ["soy", "legumes"], minutes: 3, protein: 16, fett: 8, kohlenhydrate: 1, portion: 150, proteinSource: true },
  { id: "tuna", name: "Thunfisch im eigenen Saft (Konserve, abgetropft)", aliases: /thunfisch/, tags: ["fish"], minutes: 3, protein: 24, fett: 1, kohlenhydrate: 0, portion: 100, proteinSource: true },
  { id: "lentils", name: "Verzehrfertige Linsen (Konserve, abgetropft)", aliases: /linsen/, tags: ["legumes"], minutes: 3, protein: 7, fett: 0.5, kohlenhydrate: 12, portion: 150, proteinSource: true },
  { id: "chocolate", name: "Schokolade", aliases: /schokolade/, tags: ["milk", "lactose", "nuts", "soy"], minutes: 1, protein: 7, fett: 30, kohlenhydrate: 55, portion: 20 },
  { id: "chips", name: "Chips", aliases: /chips/, tags: [], minutes: 1, protein: 6, fett: 34, kohlenhydrate: 50, portion: 20 },
  { id: "cheese", name: "Käse", aliases: /kaese/, tags: ["milk"], minutes: 1, protein: 25, fett: 28, kohlenhydrate: 1, portion: 30 },
  { id: "yogurt", name: "Joghurt natur", aliases: /joghurt|yoghurt/, tags: ["milk", "lactose"], minutes: 1, protein: 4, fett: 3.5, kohlenhydrate: 5, portion: 150 },
  { id: "oats", name: "Haferflocken", aliases: /haferflocken/, tags: ["gluten", "oats"], minutes: 5, protein: 13, fett: 7, kohlenhydrate: 60, portion: 40 },
  { id: "bread", name: "Brot", aliases: /brot|toast/, tags: ["gluten"], minutes: 1, protein: 9, fett: 3, kohlenhydrate: 43, portion: 50 },
  { id: "oil", name: "Olivenöl", aliases: /olivenoel/, tags: [], minutes: 1, protein: 0, fett: 100, kohlenhydrate: 0, portion: 10 }
].map(food => ({ ...food, recommendable: Boolean(food.proteinSource || ["water", "oil"].includes(food.id)),
  kcal: food.protein * 4 + food.fett * 9 + food.kohlenhydrate * 4 }));

export function recommendationFoods(profile) {
  return FOOD_CATALOG.filter(food => food.recommendable && foodIsAllowed(food, profile));
}

export function foodIsAllowed(food, profile) {
  if (profile.excludedFoodIds.includes(food.id)) return false;
  if (food.tags.some(tag => profile.allergens.includes(tag) || profile.excludedTags.includes(tag))) return false;
  if (profile.excludedTerms.some(term => plain(food.name).includes(term))) return false;
  if (profile.excludedTags.includes("animal") && food.tags.some(tag => ["milk", "eggs", "fish", "meat", "crustaceans", "molluscs"].includes(tag))) return false;
  if (profile.maxPrepMinutes !== null && food.minutes > profile.maxPrepMinutes) return false;
  if (profile.dietaryPattern === "vegan" && food.tags.some(tag => ["milk", "eggs", "fish", "meat", "crustaceans", "molluscs"].includes(tag))) return false;
  if (profile.dietaryPattern === "vegetarian" && food.tags.some(tag => ["fish", "meat", "crustaceans", "molluscs"].includes(tag))) return false;
  if (profile.dietaryPattern === "pescetarian" && food.tags.includes("meat")) return false;
  if (profile.dietStrategy === "keto" && food.kohlenhydrate > 5) return false;
  if (profile.dietStrategy === "low_carb" && food.kohlenhydrate > 15) return false;
  return true;
}

export function allowedProteinFoods(profile) {
  return FOOD_CATALOG.filter(food => food.proteinSource && foodIsAllowed(food, profile));
}

function nutrients(food, grams) {
  return Object.fromEntries(["kcal", "protein", "fett", "kohlenhydrate"].map(key => [key, food[key] * grams / 100]));
}

function portionInText(text, food) {
  const words = food.aliases.source;
  const normalized = plain(text);
  const matches = [...normalized.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*g\\s+(?:${words})\\b`, "g"))];
  // Multiple mentions cannot be assigned to a single substitution safely.
  if (matches.length !== 1) return null;
  const amount = Number(matches[0][1].replace(",", "."));
  return amount > 0 && amount <= 1000 ? amount : null;
}

export function buildProfileCandidateConfigs(days, report) {
  const profile = report.userProfile;
  const proteins = allowedProteinFoods(profile);
  const configs = [];
  const metrics = ["kcal", "protein", "fett", "kohlenhydrate"];
  const add = (config, before, after) => {
    const weeklyEffect = Object.fromEntries(metrics.map(key => [key, after[key] - before[key]]));
    if (report.differenz.kcal < 0 && weeklyEffect.kcal < 0) return;
    if (report.differenz.kcal > 0 && weeklyEffect.kcal > 0) return;
    configs.push({ ...config, weeklyEffect, priority: 20, type: "Ersetzen" });
  };
  for (const day of days) {
    for (const meal of ["breakfast", "lunch", "dinner", "snacks"]) {
      for (const source of FOOD_CATALOG.filter(food => !["skyr_lf", "oil", "water"].includes(food.id))) {
        const grams = portionInText(day[meal], source);
        if (!grams) continue;
        for (const food of proteins) {
          if (food.id === source.id || (source.id === "skyr" && food.id === "skyr_lf" && !profile.allergens.includes("lactose"))) continue;
          add({
            key: `profile_${day.tag}_${meal}_${source.id}_${food.id}`,
            group: `profile_meal_${day.tag}_${meal}`,
            title: `${source.name} gezielt ersetzen`,
            action: `An Tag ${day.tag} ersetzt du die protokollierten ${grams} g ${source.name} durch ${food.portion} g ${food.name}. Zubereitungszeit mit verzehrfertigen Zutaten: ca. ${food.minutes} Minuten.`,
            frequency: "bei diesem Wochenmuster", focus: "Energie und Protein an das persönliche Ziel anpassen",
            why: "Die Alternative wurde gegen Ernährungsform, Ausschlüsse und Zeitbudget geprüft. Die Nährwertwirkung ist eine Schätzung.",
            days: [day.tag], sourceIds: [`profile_meal_${day.tag}_${meal}`],
            swapKey: `${meal}_${source.id}_${grams}_${food.id}`,
            sourceFoodName: source.name, sourceGrams: grams,
            targetFoodIds: [food.id], prepMinutes: food.minutes
          }, nutrients(source, grams), nutrients(food, food.portion));
        }
      }
    }
  }
  // Additions are explicit; their energy is included instead of silently added to a replacement.
  if (report.differenz.kcal < 0) {
    const additions = [
      ...(report.differenz.protein < 0 ? proteins : []),
      ...(report.differenz.fett < 0 ? FOOD_CATALOG.filter(food => food.id === "oil" && foodIsAllowed(food, profile)) : [])
    ];
    for (const food of additions) {
      const count = Math.min(7, Math.max(1, Math.ceil(Math.abs(report.differenz.kcal) * 7 / nutrients(food, food.portion).kcal)));
      const perEvent = nutrients(food, food.portion);
      configs.push({
        key: `profile_add_${food.id}`, group: food.id === "oil" ? "profile_add_fat" : "profile_add_protein",
        title: food.id === "oil" ? "Energiequelle ergänzen" : "Proteinportion ergänzen",
        action: `An ${count} Tagen pro Woche ergänzt du ${food.portion} g ${food.name}${food.id === "oil" ? " zu einer vorhandenen Mahlzeit" : " als zusätzliche Portion"}. Zubereitungszeit mit verzehrfertigen Zutaten: ca. ${food.minutes} Minuten. Die zusätzlichen Kalorien sind eingerechnet.`,
        frequency: `${count}x/Woche`, focus: "Energiezufuhr zum Ziel anheben",
        why: "Die zusätzliche Portion passt zu den erfassten Ausschlüssen und zählt in der Energiebilanz mit.",
        days: Array.from({ length: count }, (_, i) => i + 1),
        sourceIds: [food.id === "oil" ? "profile_add_fat" : "profile_add_protein"],
        weeklyEffect: Object.fromEntries(metrics.map(key => [key, perEvent[key] * count])),
        priority: 20, type: "Ergänzen", targetFoodIds: [food.id], prepMinutes: food.minutes
      });
    }
  }
  const grouped = new Map();
  for (const candidate of configs) {
    if (!candidate.swapKey) {
      grouped.set(candidate.key, candidate);
      continue;
    }
    const previous = grouped.get(candidate.swapKey);
    if (!previous) grouped.set(candidate.swapKey, { ...candidate,
      days: [...candidate.days], sourceIds: [...candidate.sourceIds], weeklyEffect: { ...candidate.weeklyEffect } });
    else {
      previous.days.push(...candidate.days);
      previous.sourceIds.push(...candidate.sourceIds);
      for (const metric of metrics) previous.weeklyEffect[metric] += candidate.weeklyEffect[metric];
    }
  }
  return [...grouped.values()].map(candidate => {
    if (!candidate.swapKey) return candidate;
    const food = FOOD_CATALOG.find(entry => entry.id === candidate.targetFoodIds[0]);
    return { ...candidate, frequency: `${candidate.days.length}x/Woche`,
      action: `Bei diesem Wochenmuster (Tag ${candidate.days.join(", ")}) ersetzt du jeweils die protokollierten ${candidate.sourceGrams} g ${candidate.sourceFoodName} durch ${food.portion} g ${food.name}. Zubereitungszeit mit verzehrfertigen Zutaten: ca. ${food.minutes} Minuten.` };
  });
}

export function candidateFitsProfile(candidate, profile) {
  if (!profile?.constrained) return true;
  if (!Array.isArray(candidate.targetFoodIds) || !candidate.targetFoodIds.length) return false;
  if (!Number.isFinite(candidate.prepMinutes) ||
      (profile.maxPrepMinutes !== null && candidate.prepMinutes > profile.maxPrepMinutes)) return false;
  return candidate.targetFoodIds.every(id => {
    const food = FOOD_CATALOG.find(entry => entry.id === id);
    return Boolean(food?.recommendable && foodIsAllowed(food, profile));
  });
}

export function applyProfileToReport(report) {
  const profile = report.userProfile;
  const allowed = recommendationFoods(profile);
  const lookup = new Map(allowed.map(food => [plain(food.name), food]));
  report.stabileBausteine = (report.stabileBausteine || []).flatMap(item => {
    const food = lookup.get(plain(item.lebensmittel));
    return food ? [{ lebensmittel: food.name, begruendung: "Passt zum erfassten Nutzerprofil.",
      hinweis: `Mit verzehrfertigen Zutaten ca. ${food.minutes} Minuten. Portionsgröße und Produktetikett beachten.` }] : [];
  });
  if (profile.constrained) {
    // Model observations remain historical; actionable advice comes only from verified candidates.
    report.problemMuster = (report.problemMuster || []).map(item => ({ ...item,
      hebel: "Nutze die auf dein Profil geprüften Änderungen im Fahrplan." }));
    report.lebensmittelAnalyse = (report.lebensmittelAnalyse || []).map(item => ({ ...item,
      bewertung: "neutral", einordnung: "Historischer Protokolleintrag, keine Lebensmittelempfehlung. Beachte die geprüften Alternativen im Fahrplan." }));
  }
  const summary = [
    `Ernährungsform: ${{ mixed: "Mischkost", vegan: "vegan", vegetarian: "vegetarisch", pescetarian: "pescetarisch" }[profile.dietaryPattern]}; Strategie: ${{ standard: "Standard", keto: "Keto", low_carb: "Low Carb" }[profile.dietStrategy]}.`,
    profile.maxPrepMinutes === null ? "Keine maximale Zubereitungszeit angegeben." : `Zeitbudget: maximal ${profile.maxPrepMinutes} Minuten pro Zubereitung.`,
    profile.allergens.length ? `Erfasste Allergene/Unverträglichkeiten: ${profile.allergens.map(tag => labels[tag]).join(", ")}. Zutatenlisten und mögliche Kreuzkontakte sind anhand des konkreten Produkts zu prüfen.` : "",
    profile.excludedTags.length || profile.excludedTerms.length ? `Weitere Ausschlüsse: ${[...profile.excludedTags.map(tag => labels[tag]), ...profile.excludedTerms].join(", ")}.` : "",
    "Zeit- und Nährwertangaben gelten für die genannten verzehrfertigen Zutaten und sind Schätzungen."
  ].filter(Boolean).join(" ");
  report.schaetzHinweisOhneProfil = report.schaetzHinweis;
  report.profilHinweis = summary;
  report.schaetzHinweis = [report.schaetzHinweis, summary].filter(Boolean).join(" ");
  const count = report.zehnSchrittePlan?.length || 0;
  if (profile.constrained) {
    report.fahrplanBilanz += ` Für dein Profil stehen ${count} geprüfte Schritte zur Verfügung.`;
    if (!report.fahrplanSolverStatus?.zielkorridorErreicht) {
      report.fahrplanBilanz += " Die verfügbaren Änderungen schließen die berechneten Ziellücken noch nicht vollständig. Es werden keine unpassenden Schritte ergänzt, um eine feste Schrittzahl zu erreichen.";
    }
  }
  return report;
}
