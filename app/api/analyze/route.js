export const runtime = "nodejs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value, step) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;

  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeForm(form) {
  const safeForm = form && typeof form === "object" ? form : {};

  return {
    age: normalizeText(safeForm.age),
    height: normalizeText(safeForm.height),
    gender: normalizeText(safeForm.gender),
    weight: normalizeText(safeForm.weight),
    targetWeight: normalizeText(safeForm.targetWeight),
    goal: normalizeText(safeForm.goal),
    activityLevel: normalizeText(safeForm.activityLevel),
    dietType: normalizeText(safeForm.dietType),
    intolerances: normalizeText(safeForm.intolerances),
    dislikes: normalizeText(safeForm.dislikes),
    cookingTime: normalizeText(safeForm.cookingTime)
  };
}

function normalizeDays(days) {
  if (!Array.isArray(days)) {
    return [];
  }

  return days.slice(0, 7).map((day, index) => {
    if (typeof day === "string") {
      return {
        tag: index + 1,
        breakfast: day.trim(),
        lunch: "",
        dinner: "",
        snacks: "",
        drinks: ""
      };
    }

    const safeDay = day && typeof day === "object" ? day : {};

    return {
      tag: index + 1,
      breakfast: normalizeText(safeDay.breakfast),
      lunch: normalizeText(safeDay.lunch),
      dinner: normalizeText(safeDay.dinner),
      snacks: normalizeText(safeDay.snacks),
      drinks: normalizeText(safeDay.drinks)
    };
  });
}

function hasUsefulNutritionData(days) {
  return days.some(day =>
    day.breakfast || day.lunch || day.dinner || day.snacks || day.drinks
  );
}

function normalizeGoal(goal) {
  const text = normalizeText(goal).toLowerCase();

  if (
    text.includes("abnehm") ||
    text.includes("reduzier") ||
    text.includes("fettverlust") ||
    text.includes("gewicht verlieren") ||
    text.includes("definition")
  ) {
    return "abnehmen";
  }

  if (
    text.includes("zunehm") ||
    text.includes("aufbau") ||
    text.includes("muskel") ||
    text.includes("masse") ||
    text.includes("bulk")
  ) {
    return "zunehmen";
  }

  if (
    text.includes("halt") ||
    text.includes("erhalt") ||
    text.includes("gewicht halten")
  ) {
    return "halten";
  }

  return "halten";
}

function detectDietStrategy(form) {
  const text = [
    form.dietType,
    form.goal,
    form.dislikes,
    form.intolerances
  ].join(" ").toLowerCase();

  const isKeto =
    text.includes("keto") ||
    text.includes("ketogen") ||
    text.includes("ketogene") ||
    text.includes("ketogenic");

  const isLowCarb =
    isKeto ||
    text.includes("low carb") ||
    text.includes("low-carb") ||
    text.includes("lowcarb") ||
    text.includes("kohlenhydratarm") ||
    text.includes("wenig kohlenhydrat") ||
    text.includes("wenige kohlenhydrate");

  if (isKeto) return "keto";
  if (isLowCarb) return "low_carb";
  return "standard";
}

function parseActivityFactor(activityLevel) {
  const raw = normalizeText(activityLevel);
  const text = raw.toLowerCase();

  const numeric = parseNumber(raw);
  if (numeric >= 1.1 && numeric <= 2.2) {
    return {
      factor: Number(numeric.toFixed(2)),
      label: "manuell angegeben",
      source: raw
    };
  }

  if (
    text.includes("extrem") ||
    text.includes("leistung") ||
    text.includes("athlet") ||
    text.includes("6x") ||
    text.includes("6 x") ||
    text.includes("täglich training") ||
    text.includes("sehr hohe")
  ) {
    return { factor: 1.8, label: "extrem aktiv", source: raw || "nicht angegeben" };
  }

  if (
    text.includes("sehr aktiv") ||
    text.includes("körperlich") ||
    text.includes("koerperlich") ||
    text.includes("viel bewegung") ||
    text.includes("viel stehen") ||
    text.includes("4x") ||
    text.includes("5x") ||
    text.includes("4 x") ||
    text.includes("5 x")
  ) {
    return { factor: 1.65, label: "sehr aktiv", source: raw || "nicht angegeben" };
  }

  if (
    text.includes("moderat") ||
    text.includes("mittel") ||
    text.includes("2-3") ||
    text.includes("2–3") ||
    text.includes("2 x") ||
    text.includes("3 x") ||
    text.includes("2x") ||
    text.includes("3x") ||
    text.includes("training 2") ||
    text.includes("training 3")
  ) {
    return { factor: 1.5, label: "moderat aktiv", source: raw || "nicht angegeben" };
  }

  if (
    text.includes("leicht") ||
    text.includes("spazier") ||
    text.includes("etwas") ||
    text.includes("alltag") ||
    text.includes("1x") ||
    text.includes("1 x")
  ) {
    return { factor: 1.35, label: "leicht aktiv", source: raw || "nicht angegeben" };
  }

  if (
    text.includes("sitz") ||
    text.includes("wenig") ||
    text.includes("kaum") ||
    text.includes("büro") ||
    text.includes("buero") ||
    text.includes("inaktiv")
  ) {
    return { factor: 1.2, label: "wenig aktiv", source: raw || "nicht angegeben" };
  }

  return {
    factor: 1.5,
    label: "Default: moderat aktiv",
    source: raw || "nicht angegeben"
  };
}

function getGenderConstant(gender) {
  const text = normalizeText(gender).toLowerCase();

  if (
    text.includes("frau") ||
    text.includes("weib") ||
    text === "w" ||
    text.includes("female")
  ) {
    return { constant: -161, label: "weiblich" };
  }

  if (
    text.includes("mann") ||
    text.includes("männ") ||
    text.includes("maenn") ||
    text === "m" ||
    text.includes("male")
  ) {
    return { constant: 5, label: "männlich" };
  }

  return { constant: -78, label: "nicht eindeutig angegeben" };
}

function calculateNutritionTargets(form) {
  const age = parseNumber(form.age);
  const height = parseNumber(form.height);
  const currentWeight = parseNumber(form.weight);
  const targetWeightInput = parseNumber(form.targetWeight);
  const targetWeight = targetWeightInput > 0 ? targetWeightInput : currentWeight;
  const goal = normalizeGoal(form.goal);
  const dietStrategy = detectDietStrategy(form);
  const activity = parseActivityFactor(form.activityLevel);
  const gender = getGenderConstant(form.gender);

  if (!age || !height || !currentWeight) {
    return {
      error: "Bitte fülle Alter, Größe und aktuelles Gewicht aus, damit Zielkalorien berechnet werden können."
    };
  }

  const bmrRaw =
    10 * currentWeight +
    6.25 * height -
    5 * age +
    gender.constant;

  const bmr = Math.max(900, bmrRaw);
  const tdee = bmr * activity.factor;

  let calorieAdjustment = 0;
  let targetCaloriesRaw = tdee;
  let goalLabel = "Gewicht halten";

  if (goal === "abnehmen") {
    calorieAdjustment = clamp(tdee * 0.15, 300, 750);
    targetCaloriesRaw = tdee - calorieAdjustment;
    goalLabel = "Abnehmen";
  } else if (goal === "zunehmen") {
    calorieAdjustment = clamp(tdee * 0.07, 150, 400);
    targetCaloriesRaw = tdee + calorieAdjustment;
    goalLabel = "Zunehmen / Muskelaufbau";
  }

  let targetCalories = roundTo(targetCaloriesRaw, 50);

  const referenceWeight = goal === "abnehmen" && targetWeight > 0 ? targetWeight : currentWeight;

  let proteinRaw;
  let fatRaw;
  let carbsRaw;
  let macroNote = "";

  if (goal === "abnehmen") {
    proteinRaw = 2.0 * referenceWeight;
    fatRaw = 0.8 * referenceWeight;
  } else if (goal === "zunehmen") {
    proteinRaw = 1.8 * currentWeight;
    fatRaw = 1.0 * currentWeight;
  } else {
    proteinRaw = 1.8 * currentWeight;
    fatRaw = 0.9 * currentWeight;
  }

  let protein = roundTo(proteinRaw, 5);
  const fatMinimum = 0.6 * referenceWeight;
  const fatMaximumStandard = (0.35 * targetCalories) / 9;

  if (dietStrategy === "keto") {
    carbsRaw = goal === "zunehmen" ? 50 : 40;
    let fatFromRest = (targetCalories - protein * 4 - carbsRaw * 4) / 9;

    if (fatFromRest < fatMinimum) {
      fatFromRest = fatMinimum;
      carbsRaw = Math.max(20, (targetCalories - protein * 4 - fatFromRest * 9) / 4);
    }

    fatRaw = fatFromRest;
    macroNote = "Keto erkannt: Kohlenhydrate werden bewusst sehr niedrig angesetzt, Fett füllt den größten Teil der Restkalorien.";
  } else if (dietStrategy === "low_carb") {
    carbsRaw = goal === "abnehmen" ? 90 : goal === "zunehmen" ? 130 : 110;
    let fatFromRest = (targetCalories - protein * 4 - carbsRaw * 4) / 9;

    if (fatFromRest < fatMinimum) {
      fatFromRest = fatMinimum;
      carbsRaw = Math.max(50, (targetCalories - protein * 4 - fatFromRest * 9) / 4);
    }

    fatRaw = fatFromRest;
    macroNote = "Low Carb erkannt: Kohlenhydrate werden reduziert angesetzt, Fett füllt einen größeren Teil der Restkalorien.";
  } else {
    fatRaw = clamp(fatRaw, fatMinimum, fatMaximumStandard);
    carbsRaw = (targetCalories - protein * 4 - fatRaw * 9) / 4;

    if (carbsRaw < 80) {
      fatRaw = fatMinimum;
      carbsRaw = (targetCalories - protein * 4 - fatRaw * 9) / 4;
    }

    macroNote = "Standard-Ernährung: Protein und Fett werden zielabhängig gesetzt, Kohlenhydrate füllen die Restkalorien.";
  }

  let fat = roundTo(fatRaw, 5);
  let carbs = roundTo((targetCalories - protein * 4 - fat * 9) / 4, 5);

  if (carbs < 0) {
    carbs = 0;
    fat = roundTo(Math.max(fatMinimum, (targetCalories - protein * 4) / 9), 5);
  }

  if (dietStrategy === "keto" && carbs > 50) {
    carbs = 50;
    fat = roundTo((targetCalories - protein * 4 - carbs * 4) / 9, 5);
  }

  if (dietStrategy === "low_carb" && carbs > 140) {
    carbs = 140;
    fat = roundTo((targetCalories - protein * 4 - carbs * 4) / 9, 5);
  }

  const sollZustand = {
    kcal: targetCalories,
    protein,
    fett: fat,
    kohlenhydrate: Math.max(0, carbs)
  };

  const berechnungslogik = {
    ziel: goalLabel,
    zielCode: goal,
    ernaehrungsstrategie: dietStrategy,
    grundumsatzFormel: "Mifflin-St. Jeor",
    geschlechtFuerFormel: gender.label,
    aktivitaetsfaktor: Number(activity.factor.toFixed(2)),
    aktivitaetsEinordnung: activity.label,
    aktivitaetsEingabe: activity.source,
    bmr: roundTo(bmr, 10),
    tdee: roundTo(tdee, 10),
    kalorienAnpassung: roundTo(calorieAdjustment, 10),
    referenzgewicht: Number(referenceWeight.toFixed(1)),
    proteinFormel:
      goal === "abnehmen"
        ? "2,0 g × Referenz-/Zielgewicht"
        : "1,8 g × aktuelles Gewicht",
    fettFormel:
      dietStrategy === "keto"
        ? "Fett = Restkalorien nach Protein und Keto-Kohlenhydraten"
        : dietStrategy === "low_carb"
          ? "Fett = Restkalorien nach Protein und Low-Carb-Kohlenhydraten"
          : goal === "abnehmen"
            ? "0,8 g × Referenz-/Zielgewicht"
            : goal === "zunehmen"
              ? "1,0 g × aktuelles Gewicht"
              : "0,9 g × aktuelles Gewicht",
    kohlenhydratFormel: "Restkalorien / 4",
    hinweis: macroNote
  };

  return {
    sollZustand,
    berechnungslogik,
    dietStrategy,
    goal,
    activity
  };
}

function calculateDifference(istZustand, sollZustand) {
  return {
    kcal: roundTo((Number(istZustand?.kcal) || 0) - sollZustand.kcal, 50),
    protein: roundTo((Number(istZustand?.protein) || 0) - sollZustand.protein, 5),
    fett: roundTo((Number(istZustand?.fett) || 0) - sollZustand.fett, 5),
    kohlenhydrate: roundTo((Number(istZustand?.kohlenhydrate) || 0) - sollZustand.kohlenhydrate, 5)
  };
}

function sanitizeStableBuildingBlocks(report) {
  const whitelist = [
    "hähnchen",
    "haehnchen",
    "pute",
    "putenbrust",
    "thunfisch",
    "ei",
    "eier",
    "quark",
    "magerquark",
    "joghurt",
    "skyr",
    "gemüse",
    "gemuese",
    "salat",
    "beeren",
    "wasser",
    "tee",
    "reis",
    "kartoffel",
    "kartoffeln",
    "käse",
    "kaese",
    "tofu",
    "tempeh",
    "hülsenfrüchte",
    "huelsenfruechte",
    "linsen",
    "bohnen"
  ];

  const stableBlacklist = [
    "cola",
    "schokolade",
    "schokoriegel",
    "chips",
    "pommes",
    "döner",
    "doener",
    "burger",
    "pizza",
    "nutella",
    "butter",
    "sahnesauce",
    "sahne",
    "mayo",
    "mayonnaise",
    "frittiert",
    "wurst",
    "aufschnitt",
    "salami",
    "speck",
    "bacon",
    "nüsse",
    "nuesse",
    "nuss",
    "fett-treiber",
    "fetttreiber",
    "zuckerquelle",
    "problem"
  ];

  const input = Array.isArray(report?.stabileBausteine) ? report.stabileBausteine : [];

  const cleaned = input
    .filter(item => {
      const text = [
        item?.lebensmittel,
        item?.begruendung,
        item?.hinweis
      ].join(" ").toLowerCase();

      const hasWhitelist = whitelist.some(keyword => text.includes(keyword));
      const hasBlacklist = stableBlacklist.some(keyword => text.includes(keyword));

      return hasWhitelist && !hasBlacklist;
    })
    .slice(0, 8);

  report.stabileBausteine = cleaned;

  return report;
}

function createSystemPrompt(targets) {
  const isKeto = targets.dietStrategy === "keto";
  const isLowCarb = targets.dietStrategy === "low_carb";

  return `
Du bist ein evidenzbasierter Ernährungsanalyst im Stil der Nordschmiede.

GRUNDHALTUNG:
- ruhig
- klar
- präzise
- erwachsen
- praktisch
- nicht moralisch
- nicht beschämend
- keine Fitness-Influencer-Sprache
- keine medizinischen Diagnosen
- keine Heilversprechen
- keine generischen Tipps

WICHTIG:
Die Soll-Werte werden NICHT von dir frei berechnet.
Sie wurden durch den Code der App berechnet und sind verbindlich.
Du darfst den Soll-Zustand nicht verändern.
Du nutzt ihn als Grundlage für Analyse, Differenz, Muster und Handlungsschritte.

BERECHNETER SOLL-ZUSTAND:
${JSON.stringify(targets.sollZustand, null, 2)}

BERECHNUNGSLOGIK:
${JSON.stringify(targets.berechnungslogik, null, 2)}

AUFGABE:
1. Schätze den Ist-Zustand aus den 7 Ernährungstagen.
2. Übernimm den oben berechneten Soll-Zustand exakt.
3. Berechne Differenz als Ist minus Soll.
4. Leite daraus konkrete Ernährungsmuster und Handlungsschritte ab.

DIFFERENZLOGIK:
Differenz = Ist minus Soll.
- positive Werte = über Ziel
- negative Werte = unter Ziel

SCHÄTZLOGIK IST-ZUSTAND:
- istZustand = geschätzter durchschnittlicher Tageswert aus den 7 Tagen.
- Die Werte sind Näherungen, keine Labormessung.
- Je ungenauer Mengen sind, desto niedriger die Schätzqualität.
- kcal auf sinnvolle ganze Werte schätzen.
- Makros auf ganze Gramm schätzen.

ERNÄHRUNGSSTRATEGIE:
${isKeto ? `
Keto wurde erkannt.
- Empfehlungen müssen keto-kompatibel sein.
- Keine Empfehlungen mit Reis, Nudeln, Brot, Kartoffeln, Haferflocken, Müsli, Banane oder normalem Zucker als Standard-Alternative.
- Nutze eher: Eier, Fisch, Fleisch, Tofu/Tempeh, Quark/Skyr nur wenn passend, Käse in kontrollierter Menge, Gemüse, Salat, Avocado, Olivenöl, Nüsse nur kontrolliert.
- Kohlenhydrate müssen sehr niedrig bleiben und dürfen nicht heimlich durch "gesunde" Kohlenhydratquellen ersetzt werden.
` : ""}

${isLowCarb && !isKeto ? `
Low Carb wurde erkannt.
- Empfehlungen müssen kohlenhydratreduziert sein.
- Keine Standard-Empfehlungen mit großen Mengen Reis, Nudeln, Brot, Kartoffeln, Müsli oder Süßobst.
- Kleine, kontrollierte Kohlenhydratmengen sind möglich, aber der Schwerpunkt liegt auf Protein, Gemüse, Salat und klaren Fettquellen.
` : ""}

${!isLowCarb && !isKeto ? `
Standard-/Mischkost wurde erkannt.
- Kohlenhydrate werden als Restkalorien genutzt.
- Reis, Kartoffeln, Haferflocken, Obst oder Brot können sinnvoll sein, wenn sie zur Analyse passen.
` : ""}

STABILE BAUSTEINE:
Stabile Bausteine sind Lebensmittel, die der Nutzer eher beibehalten und strukturieren kann.
Gute Kandidaten:
- Hähnchen, Pute, Thunfisch, Eier
- Quark, Joghurt, Skyr
- Gemüse, Salat, Beeren
- Wasser, Tee
- Reis und Kartoffeln nur bei Standard-/Mischkost; bei Low Carb/Keto nur wenn zur Strategie passend
- Käse kann stabil oder neutral sein, aber nur in kontrollierter Menge und nicht als Fett-Treiber

Dürfen NICHT als stabile Bausteine ausgegeben werden:
- Cola, Schokolade, Schokoriegel, Chips, Pommes, Döner, Burger, Pizza, Nutella, Butter, Sahnesauce, Sahne, Mayonnaise
- Wurst, stark verarbeiteter Aufschnitt, Salami, Bacon
- Nüsse, wenn sie als Fett-Treiber oder große Kalorienquelle vorkommen
- alles, was du selbst als Problem, Fett-Treiber oder Zuckerquelle einordnest

BEWERTUNG IN lebensmittelAnalyse:
- "stabil" = kann bleiben oder sinnvoll strukturiert werden.
- "neutral" = Menge/Kontext entscheidet.
- "problem" = klarer Hebel wegen Kalorien, Zucker, Fett, Verarbeitung, Flüssigkalorien oder Wiederholung.

VERBOTENE FORMULIERUNGEN IN HANDLUNGSSCHRITTEN:
Vermeide alleinstehend:
- mehr
- weniger
- häufiger
- bewusster
- optimieren
- gesünder
- ausgewogener
- auf Fett achten
- Snacks reduzieren
- bessere Entscheidungen treffen
- verarbeitete Lebensmittel reduzieren

Wenn solche Begriffe vorkommen, müssen sie konkretisiert werden:
Nicht: "weniger Cola trinken"
Sondern: "Die 500 ml Cola an Tag 5 ersetzt du durch Wasser, Tee oder ein kalorienfreies Getränk."

10-SCHRITTE-PLAN:
Jeder Schritt muss:
- mit "Schritt X:" beginnen.
- ein konkretes Lebensmittel, Getränk oder Mahlzeitenmuster aus den 7 Tagen nennen.
- eine konkrete Änderung nennen.
- eine konkrete Alternative nennen.
- einen ungefähren Effekt nennen: kcal, Protein, Fett oder Kohlenhydrate.
- einen Bezug zur Differenz nennen.
- die Ernährungsstrategie respektieren, besonders Low Carb/Keto.

ENTSCHEIDUNGSBAUM:
1. Flüssigkalorien zuerst, wenn Cola, Saft, Alkohol oder gesüßte Kaffeegetränke vorkommen.
2. Proteinlücke früh schließen, wenn Protein mindestens ca. 15–20 g unter Soll liegt.
3. Größte Kalorienquelle früh verändern, wenn kcal über Soll liegen.
4. Fettquellen konkret steuern, wenn Fett deutlich über Soll liegt.
5. Snacks/Süßigkeiten konkret ersetzen oder portionieren, wenn sie wiederholt vorkommen.
6. Mahlzeitenstruktur verbessern, wenn viele Brot-/Snack-/Fast-Food-Mahlzeiten vorkommen.
7. Frühstück nur priorisieren, wenn es klar problematisch ist.
8. Abendessen priorisieren, wenn es regelmäßig fettlastig, proteinarm oder unstrukturiert ist.
9. Portionsgrößen nur konkret verändern.
10. Feinschliff immer konkret und wiederholbar.

MEDIZINISCHER HINWEIS:
Kurzer Hinweis:
"Diese Analyse ersetzt keine ärztliche, ernährungsmedizinische oder therapeutische Untersuchung. Sie dient als strukturierte Orientierung auf Grundlage deiner Angaben."

ANTWORT:
Antworte ausschließlich als gültiges JSON gemäß Schema.
`;
}

const nutritionReportSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    istZustand: {
      type: "object",
      additionalProperties: false,
      properties: {
        kcal: { type: "number" },
        protein: { type: "number" },
        fett: { type: "number" },
        kohlenhydrate: { type: "number" },
        schaetzqualitaet: { type: "string" }
      },
      required: ["kcal", "protein", "fett", "kohlenhydrate", "schaetzqualitaet"]
    },
    sollZustand: {
      type: "object",
      additionalProperties: false,
      properties: {
        kcal: { type: "number" },
        protein: { type: "number" },
        fett: { type: "number" },
        kohlenhydrate: { type: "number" }
      },
      required: ["kcal", "protein", "fett", "kohlenhydrate"]
    },
    differenz: {
      type: "object",
      additionalProperties: false,
      properties: {
        kcal: { type: "number" },
        protein: { type: "number" },
        fett: { type: "number" },
        kohlenhydrate: { type: "number" }
      },
      required: ["kcal", "protein", "fett", "kohlenhydrate"]
    },
    berechnungslogik: {
      type: "object",
      additionalProperties: false,
      properties: {
        ziel: { type: "string" },
        zielCode: { type: "string" },
        ernaehrungsstrategie: { type: "string" },
        grundumsatzFormel: { type: "string" },
        geschlechtFuerFormel: { type: "string" },
        aktivitaetsfaktor: { type: "number" },
        aktivitaetsEinordnung: { type: "string" },
        aktivitaetsEingabe: { type: "string" },
        bmr: { type: "number" },
        tdee: { type: "number" },
        kalorienAnpassung: { type: "number" },
        referenzgewicht: { type: "number" },
        proteinFormel: { type: "string" },
        fettFormel: { type: "string" },
        kohlenhydratFormel: { type: "string" },
        hinweis: { type: "string" }
      },
      required: [
        "ziel",
        "zielCode",
        "ernaehrungsstrategie",
        "grundumsatzFormel",
        "geschlechtFuerFormel",
        "aktivitaetsfaktor",
        "aktivitaetsEinordnung",
        "aktivitaetsEingabe",
        "bmr",
        "tdee",
        "kalorienAnpassung",
        "referenzgewicht",
        "proteinFormel",
        "fettFormel",
        "kohlenhydratFormel",
        "hinweis"
      ]
    },
    schaetzHinweis: { type: "string" },
    ernaehrungsrealitaet: { type: "string" },
    zentralesProblem: { type: "string" },
    problemMuster: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          muster: { type: "string" },
          beobachtung: { type: "string" },
          hebel: { type: "string" }
        },
        required: ["muster", "beobachtung", "hebel"]
      }
    },
    groessteHebel: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "string" }
    },
    zehnSchrittePlan: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: { type: "string" }
    },
    naechsteKonkreteAenderung: { type: "string" },
    zusammenfassung: { type: "string" },
    stabileBausteine: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lebensmittel: { type: "string" },
          begruendung: { type: "string" },
          hinweis: { type: "string" }
        },
        required: ["lebensmittel", "begruendung", "hinweis"]
      }
    },
    lebensmittelAnalyse: {
      type: "array",
      minItems: 5,
      maxItems: 28,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lebensmittel: { type: "string" },
          menge: { type: "string" },
          kcal: { type: "number" },
          protein: { type: "number" },
          fett: { type: "number" },
          kohlenhydrate: { type: "number" },
          bewertung: {
            type: "string",
            enum: ["stabil", "neutral", "problem"]
          },
          einordnung: { type: "string" }
        },
        required: [
          "lebensmittel",
          "menge",
          "kcal",
          "protein",
          "fett",
          "kohlenhydrate",
          "bewertung",
          "einordnung"
        ]
      }
    },
    topKalorienQuellen: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lebensmittel: { type: "string" },
          kcal: { type: "number" },
          anteil: { type: "string" },
          grund: { type: "string" }
        },
        required: ["lebensmittel", "kcal", "anteil", "grund"]
      }
    },
    medizinischerHinweis: { type: "string" }
  },
  required: [
    "istZustand",
    "sollZustand",
    "differenz",
    "berechnungslogik",
    "schaetzHinweis",
    "ernaehrungsrealitaet",
    "zentralesProblem",
    "problemMuster",
    "groessteHebel",
    "zehnSchrittePlan",
    "naechsteKonkreteAenderung",
    "zusammenfassung",
    "stabileBausteine",
    "lebensmittelAnalyse",
    "topKalorienQuellen",
    "medizinischerHinweis"
  ]
};

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data?.output)) {
    for (const outputItem of data.output) {
      if (!Array.isArray(outputItem?.content)) continue;

      for (const contentItem of outputItem.content) {
        if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
          return contentItem.text.trim();
        }
      }
    }
  }

  return "";
}

function parseJsonReport(outputText) {
  try {
    return JSON.parse(outputText);
  } catch (firstError) {
    const firstBrace = outputText.indexOf("{");
    const lastBrace = outputText.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const possibleJson = outputText.slice(firstBrace, lastBrace + 1);
      return JSON.parse(possibleJson);
    }

    throw firstError;
  }
}

export async function POST(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70000);

  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        {
          error: "Konfiguration fehlt",
          details: "OPENAI_API_KEY ist nicht gesetzt."
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const form = normalizeForm(body?.form);
    const days = normalizeDays(body?.days);

    if (!days.length || !hasUsefulNutritionData(days)) {
      return Response.json(
        {
          error: "Keine Ernährungsdaten",
          details: "Bitte fülle mindestens einen Ernährungstag aus."
        },
        { status: 400 }
      );
    }

    const targets = calculateNutritionTargets(form);

    if (targets.error) {
      return Response.json(
        {
          error: "Körperdaten unvollständig",
          details: targets.error
        },
        { status: 400 }
      );
    }

    const userPayload = {
      formular: form,
      siebenTageErnaehrung: days,
      berechneteZielwerte: targets.sollZustand,
      berechnungslogik: targets.berechnungslogik,
      hinweis: "Die Angaben stammen aus Freitextfeldern. Mengen können unvollständig sein. Bitte Ist-Zustand realistisch schätzen und Schätzqualität klar benennen."
    };

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_output_tokens: 7000,
        input: [
          {
            role: "system",
            content: createSystemPrompt(targets)
          },
          {
            role: "user",
            content: JSON.stringify(userPayload)
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "nutrition_report",
            strict: true,
            schema: nutritionReportSchema
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI Fehler:", data);

      return Response.json(
        {
          error: "OpenAI Anfrage fehlgeschlagen",
          details: data?.error?.message || "Unbekannter OpenAI Fehler"
        },
        { status: response.status || 500 }
      );
    }

    const outputText = extractOutputText(data);

    if (!outputText) {
      console.error("Keine OpenAI Textausgabe:", data);

      return Response.json(
        {
          error: "Keine gültige Antwort",
          details: "OpenAI hat keine auswertbare Textantwort zurückgegeben."
        },
        { status: 500 }
      );
    }

    let report = parseJsonReport(outputText);

    report.sollZustand = targets.sollZustand;
    report.berechnungslogik = targets.berechnungslogik;
    report.differenz = calculateDifference(report.istZustand, targets.sollZustand);
    report = sanitizeStableBuildingBlocks(report);

    return Response.json({
      report,
      meta: {
        model: MODEL,
        generatedAt: new Date().toISOString(),
        calculation: targets.berechnungslogik
      }
    });
  } catch (error) {
    console.error("SERVER ERROR:", error);

    const isAbort = error?.name === "AbortError";

    return Response.json(
      {
        error: isAbort ? "Zeitüberschreitung" : "Serverfehler",
        details: isAbort
          ? "Die Analyse hat zu lange gedauert. Bitte versuche es erneut."
          : error.message || "Unbekannter Serverfehler"
      },
      { status: isAbort ? 504 : 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
