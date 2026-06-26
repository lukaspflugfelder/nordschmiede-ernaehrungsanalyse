export const runtime = "nodejs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const SOLVER_VERSION = "v45_release_candidate_quality_gate";

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

const MAX_NUTRITION_FIELD_LENGTH = 900;
const MAX_FORM_FIELD_LENGTH = 350;

function sanitizeUserText(value, maxLength = MAX_NUTRITION_FIELD_LENGTH) {
  let text = String(value || "").replace(/\u0000/g, "").trim();

  if (!text) return "";

  // Schutz gegen versehentlich eingefügten Code, JSON-Blöcke oder riesige Copy/Paste-Inhalte.
  text = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/^[\s]*[{\[]?[\s]*(export const|function |const |let |var |import |class |return |<\/?[A-Za-z])/gm, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length > maxLength) {
    return `${text.slice(0, maxLength).trim()} … [gekürzt]`;
  }

  return text;
}

function normalizeText(value) {
  return sanitizeUserText(value, MAX_FORM_FIELD_LENGTH);
}

function normalizeNutritionText(value) {
  return sanitizeUserText(value, MAX_NUTRITION_FIELD_LENGTH);
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
        breakfast: normalizeNutritionText(day),
        lunch: "",
        dinner: "",
        snacks: "",
        drinks: ""
      };
    }

    const safeDay = day && typeof day === "object" ? day : {};

    return {
      tag: index + 1,
      breakfast: normalizeNutritionText(safeDay.breakfast),
      lunch: normalizeNutritionText(safeDay.lunch),
      dinner: normalizeNutritionText(safeDay.dinner),
      snacks: normalizeNutritionText(safeDay.snacks),
      drinks: normalizeNutritionText(safeDay.drinks)
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

function correctionTargetText(value, unit) {
  const number = Number(value) || 0;
  if (number === 0) return "im Zielbereich halten";
  if (number > 0) return "um ca. " + Math.abs(number) + " " + unit + " reduzieren";
  return "um ca. " + Math.abs(number) + " " + unit + " erhöhen";
}

function signedTargetEffect(value) {
  const number = Number(value) || 0;
  return -number;
}

function formatSigned(value, unit) {
  const number = Number(value) || 0;
  if (number === 0) return "±0 " + unit;
  return (number > 0 ? "+" : "-") + Math.abs(number) + " " + unit;
}

function buildFahrplanZiel(difference) {
  return {
    kcal: correctionTargetText(difference?.kcal, "kcal"),
    protein: correctionTargetText(difference?.protein, "g"),
    fett: correctionTargetText(difference?.fett, "g"),
    kohlenhydrate: correctionTargetText(difference?.kohlenhydrate, "g"),
    hinweis: "Der 10-Schritte-Fahrplan baut deine Woche um und wird am Ende auf den durchschnittlichen Tag zurückgerechnet. Jeder Schritt soll eine gemessene Lücke zwischen Ist- und Soll-Zustand verkleinern."
  };
}

function buildFahrplanWochenziel(difference) {
  const daily = {
    kcal: signedTargetEffect(difference?.kcal),
    protein: signedTargetEffect(difference?.protein),
    fett: signedTargetEffect(difference?.fett),
    kohlenhydrate: signedTargetEffect(difference?.kohlenhydrate)
  };

  const weekly = {
    kcal: daily.kcal * 7,
    protein: daily.protein * 7,
    fett: daily.fett * 7,
    kohlenhydrate: daily.kohlenhydrate * 7
  };

  return {
    tagesziel: daily,
    wochenziel: weekly,
    erklaerung:
      "Deine Ist-/Soll-Differenz ist ein Tagesdurchschnitt. Der Fahrplan verändert aber deine Woche. Deshalb wird die Tageslücke auf sieben Tage hochgerechnet, über konkrete Wochenmuster geschlossen und anschließend wieder auf den durchschnittlichen Tag zurückgerechnet."
  };
}

function macroEnergy(data) {
  const protein = Number(data?.protein) || 0;
  const fett = Number(data?.fett) || 0;
  const kohlenhydrate = Number(data?.kohlenhydrate) || 0;

  return roundTo(protein * 4 + fett * 9 + kohlenhydrate * 4, 10);
}

function buildMacroPlausibility(istZustand, sollZustand) {
  const istKcal = Number(istZustand?.kcal) || 0;
  const sollKcal = Number(sollZustand?.kcal) || 0;
  const istMakroKcal = macroEnergy(istZustand);
  const sollMakroKcal = macroEnergy(sollZustand);
  const istAbweichung = roundTo(istKcal - istMakroKcal, 10);
  const sollAbweichung = roundTo(sollKcal - sollMakroKcal, 10);

  const istStatus = Math.abs(istAbweichung) <= 150 ? "plausibel" : "unscharf";

  return {
    istMakroKalorien: istMakroKcal,
    istKalorien: istKcal,
    istAbweichung,
    sollMakroKalorien: sollMakroKcal,
    sollKalorien: sollKcal,
    sollAbweichung,
    status: istStatus,
    hinweis:
      istStatus === "plausibel"
        ? "Kalorien und Makros liegen rechnerisch ausreichend nah beieinander. Kleine Abweichungen entstehen durch Rundung, Markenprodukte, Saucen, Öl oder ungenaue Mengen."
        : "Kalorien und Makros weichen spürbar voneinander ab. Das spricht für Schätzunschärfe durch unklare Mengen, verarbeitete Lebensmittel, Saucen, Öl oder nicht vollständig zuordenbare Zutaten. Der Fahrplan arbeitet deshalb mit Zielkorridoren statt scheinbarer Exaktheit."
  };
}

function extractLabeledSegment(text, label) {
  if (!text) return "";
  const source = String(text);
  const labels = "Titel|Schrittziel|Ab jetzt|Umbau|Häufigkeit|Haeufigkeit|Fokus|Wirkung pro Ereignis|Wochenwirkung|Tagesdurchschnitt|Schließt|Schliesst|Art|Warum|Rest|Zielbezug|Bilanz|Interne Bilanz";
  const pattern = new RegExp(label + "\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:" + labels + ")\\s*:|$)", "i");
  const match = source.match(pattern);
  return match ? match[1].trim() : "";
}

function parseSignedMetric(segment, metric) {
  if (!segment) return 0;
  const text = String(segment).replace(/,/g, ".");
  const patterns = metric === "kcal"
    ? [/([+-]?\d+(?:\.\d+)?)\s*kcal/i]
    : [
        new RegExp("([+-]?\\d+(?:\\.\\d+)?)\\s*g\\s*(?:" + metric + ")", "i"),
        new RegExp("(?:" + metric + ")\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*g", "i")
      ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1]);
      return Number.isFinite(value) ? value : 0;
    }
  }

  return 0;
}

function parseStepDailyEffect(step) {
  const dailySegment =
    extractLabeledSegment(step, "Tagesdurchschnitt") ||
    extractLabeledSegment(step, "Tageswirkung") ||
    "";

  if (!dailySegment) return null;

  return {
    kcal: parseSignedMetric(dailySegment, "kcal"),
    protein: parseSignedMetric(dailySegment, "protein"),
    fett: parseSignedMetric(dailySegment, "fett"),
    kohlenhydrate: parseSignedMetric(dailySegment, "kohlenhydrate") || parseSignedMetric(dailySegment, "kh")
  };
}

function sumStepDailyEffects(steps) {
  const total = { kcal: 0, protein: 0, fett: 0, kohlenhydrate: 0 };
  let parsed = 0;

  if (!Array.isArray(steps)) return { total, parsed };

  steps.forEach(step => {
    const effect = parseStepDailyEffect(step);
    if (!effect) return;
    parsed += 1;
    total.kcal += effect.kcal || 0;
    total.protein += effect.protein || 0;
    total.fett += effect.fett || 0;
    total.kohlenhydrate += effect.kohlenhydrate || 0;
  });

  return {
    parsed,
    total: {
      kcal: roundTo(total.kcal, 10),
      protein: roundTo(total.protein, 1),
      fett: roundTo(total.fett, 1),
      kohlenhydrate: roundTo(total.kohlenhydrate, 1)
    }
  };
}

function targetCorridor(target, type) {
  const number = Number(target) || 0;
  const abs = Math.abs(number);

  if (abs === 0) return { min: -5, max: 5 };

  if (type === "protein") {
    // Protein soll bei einer Lücke ziemlich zuverlässig geschlossen werden.
    // Leichtes Überschießen ist in der Praxis unkritischer als darunter zu bleiben.
    if (number > 0) {
      return {
        min: roundTo(number * 0.9, 1),
        max: roundTo(number * 1.5, 1)
      };
    }

    return {
      min: roundTo(number * 1.25, 1),
      max: roundTo(number * 0.75, 1)
    };
  }

  if (type === "kohlenhydrate") {
    // Kohlenhydrate sind bei Standardkost eher Feinsteuerung. Nicht unnötig brutal reduzieren.
    if (number < 0) {
      return {
        min: roundTo(number * 1.35, 1),
        max: roundTo(number * 0.45, 1)
      };
    }

    return {
      min: roundTo(number * 0.65, 1),
      max: roundTo(number * 1.35, 1)
    };
  }

  // Kalorien und Fett sollen ungefähr im Zielkorridor landen.
  // Bei Schätzungen ist ein Korridor sinnvoller als Scheingenauigkeit.
  if (number < 0) {
    return {
      min: roundTo(number * 1.15, 1),
      max: roundTo(number * 0.75, 1)
    };
  }

  return {
    min: roundTo(number * 0.75, 1),
    max: roundTo(number * 1.15, 1)
  };
}

function inCorridor(value, corridor) {
  const number = Number(value) || 0;
  return number >= corridor.min && number <= corridor.max;
}

function buildFahrplanWirkung(difference, steps) {
  const zielProTag = {
    kcal: signedTargetEffect(difference?.kcal),
    protein: signedTargetEffect(difference?.protein),
    fett: signedTargetEffect(difference?.fett),
    kohlenhydrate: signedTargetEffect(difference?.kohlenhydrate)
  };

  const zielProWoche = {
    kcal: zielProTag.kcal * 7,
    protein: zielProTag.protein * 7,
    fett: zielProTag.fett * 7,
    kohlenhydrate: zielProTag.kohlenhydrate * 7
  };

  const parsed = sumStepDailyEffects(steps);
  const geplanteTageswirkung = parsed.total;
  const geplanteWochenwirkung = {
    kcal: roundTo(geplanteTageswirkung.kcal * 7, 10),
    protein: roundTo(geplanteTageswirkung.protein * 7, 1),
    fett: roundTo(geplanteTageswirkung.fett * 7, 1),
    kohlenhydrate: roundTo(geplanteTageswirkung.kohlenhydrate * 7, 1)
  };

  const korridor = {
    kcal: targetCorridor(zielProTag.kcal, "kcal"),
    protein: targetCorridor(zielProTag.protein, "protein"),
    fett: targetCorridor(zielProTag.fett, "fett"),
    kohlenhydrate: targetCorridor(zielProTag.kohlenhydrate, "kohlenhydrate")
  };

  const kcalOk = parsed.parsed >= 7 ? inCorridor(geplanteTageswirkung.kcal, korridor.kcal) : false;
  const fettOk = parsed.parsed >= 7 ? inCorridor(geplanteTageswirkung.fett, korridor.fett) : false;
  const proteinOk = parsed.parsed >= 7 ? inCorridor(geplanteTageswirkung.protein, korridor.protein) : false;

  let status = "nicht berechenbar";
  if (parsed.parsed >= 7) {
    status = kcalOk && fettOk && proteinOk ? "im Zielkorridor" : "prüfen";
  }

  return {
    zielProTag,
    zielProWoche,
    geplanteTageswirkung,
    geplanteWochenwirkung,
    korridor,
    ausgewerteteSchritte: parsed.parsed,
    status,
    hinweis:
      parsed.parsed >= 7
        ? "Die angegebenen Tagesdurchschnitts-Wirkungen der Schritte wurden summiert und gegen den Zielkorridor geprüft. Entscheidend ist nicht ein einzelner perfekter Tag, sondern der neue Durchschnitt deiner Woche."
        : "Nicht alle Schritte enthalten eine sauber auslesbare Tagesdurchschnitts-Wirkung. Der Plan bleibt eine qualitative Wochenstruktur, sollte aber im nächsten Test noch genauer bilanziert werden."
  };
}

function buildFahrplanBilanz(difference, wirkung) {
  const dailyParts = [
    "Kalorien " + correctionTargetText(difference?.kcal, "kcal") + " pro Tag",
    "Protein " + correctionTargetText(difference?.protein, "g") + " pro Tag",
    "Fett " + correctionTargetText(difference?.fett, "g") + " pro Tag",
    "Kohlenhydrate " + correctionTargetText(difference?.kohlenhydrate, "g") + " pro Tag"
  ];

  const weekly = wirkung?.zielProWoche;
  const weeklyText = weekly
    ? " Auf die Woche gerechnet entspricht das ungefähr " +
      formatSigned(weekly.kcal, "kcal") + ", " +
      formatSigned(weekly.protein, "g Protein") + ", " +
      formatSigned(weekly.fett, "g Fett") + " und " +
      formatSigned(weekly.kohlenhydrate, "g Kohlenhydrate") + "."
    : "";

  return "Ziel des Fahrplans: " + dailyParts.join(", ") + "." + weeklyText + " Die Schritte bauen deshalb deine Wochenstruktur um und werden auf den durchschnittlichen Tag zurückgerechnet.";
}


function splitStepParts(step) {
  const cleaned = String(step || "").replace(/^Schritt\s*\d+\s*[:.)-]\s*/i, "").trim();
  const labels = "Titel|Schrittziel|Ab jetzt|Umbau|Häufigkeit|Haeufigkeit|Fokus|Wirkung pro Ereignis|Wochenwirkung|Tagesdurchschnitt|Schließt|Schliesst|Art|Warum|Rest|Zielbezug|Bilanz|Interne Bilanz";

  function part(label) {
    const pattern = new RegExp(label + "\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:" + labels + ")\\s*:|$)", "i");
    const match = cleaned.match(pattern);
    return match ? match[1].trim() : "";
  }

  const title = part("Titel") || part("Schrittziel");
  const abJetzt = part("Ab jetzt") || part("Umbau");
  const haeufigkeit = part("Häufigkeit") || part("Haeufigkeit");
  const fokus = part("Fokus") || part("Schließt") || part("Schliesst") || part("Zielbezug");
  const warum = part("Warum");
  const art = part("Art");
  const wirkungProEreignis = part("Wirkung pro Ereignis") || part("Wirkung");
  const wochenwirkung = part("Wochenwirkung");
  const tagesdurchschnitt = part("Tagesdurchschnitt");

  const actionFallback = cleaned
    .split(/\bHäufigkeit\s*:/i)[0]
    .split(/\bHaeufigkeit\s*:/i)[0]
    .split(/\bWirkung pro Ereignis\s*:/i)[0]
    .split(/\bTagesdurchschnitt\s*:/i)[0]
    .split(/\bSchließt\s*:/i)[0]
    .trim();

  const strippedFallback = actionFallback
    .replace(/\b(Titel|Schrittziel|Ab jetzt|Umbau|Fokus|Art|Warum)\s*:/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: title || strippedFallback.split(/[.!?]/)[0].trim() || "Nächsten Hebel umsetzen",
    abJetzt: abJetzt || strippedFallback || "Setze diesen Schritt bei Auftreten des Musters um.",
    haeufigkeit: haeufigkeit || "bei Auftreten",
    fokus: fokus || "Ist-/Soll-Lücke verkleinern",
    warum: warum || "Dieser Schritt verändert ein konkretes Muster aus deiner Woche.",
    art: art || "Umbau",
    wirkungProEreignis,
    wochenwirkung,
    tagesdurchschnitt,
    original: cleaned
  };
}

function normalizeShortTitle(title) {
  const raw = String(title || "").trim().replace(/[.!?]+$/g, "");
  const lower = raw.toLowerCase();
  if (/cola|limonade|saft|eistee/.test(lower)) return "Cola ersetzen";
  if (/schokolade|schokoriegel|süß|suess/.test(lower)) return "Süßes portionieren";
  if (/chips/.test(lower)) return "Chips portionieren";
  if (/nuss|nüsse|nuesse/.test(lower)) return "Nüsse portionieren";
  if (/döner|doener/.test(lower)) return "Döner leichter ersetzen";
  if (/pizza/.test(lower)) return "Pizza leichter lösen";
  if (/sahne|sahnesauce/.test(lower)) return "Sahnesauce ersetzen";
  if (/butter/.test(lower)) return "Butter leichter ersetzen";
  if (/käse|kaese/.test(lower)) return "Käse leichter dosieren";
  if (/wurst|aufschnitt|salami/.test(lower)) return "Brotbelag umbauen";
  if (/brot/.test(lower)) return "Brotmenge steuern";
  if (/pommes/.test(lower)) return "Pommes ersetzen";
  if (/müsli|muesli|frühstück|fruehstueck/.test(lower)) return "Frühstück proteinreicher";
  if (/protein|quark|skyr|joghurt|hüttenkäse|huettenkaese|hähnchen|haehnchen|pute|thunfisch/.test(lower)) return "Proteinbasis stärken";
  return raw.length > 34 ? raw.slice(0, 31).trim() + "…" : (raw || "Nächsten Hebel umsetzen");
}

function stepPatternKey(parts) {
  const text = [parts.title, parts.abJetzt, parts.fokus, parts.why, parts.original]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/cola|limonade|saft|eistee|flüssigkalorien|fluessigkalorien/.test(text)) return "drink_sugar";
  if (/schokolade|schokoriegel|nutella|marmelade|süß|suess|keks|kuchen/.test(text)) return "sweet_snack";
  if (/chips/.test(text)) return "chips";
  if (/nuss|nüsse|nuesse/.test(text)) return "nuts";
  if (/wurst|aufschnitt|salami|brotbelag|käse|kaese/.test(text)) return "bread_topping";
  if (/brotmenge|brotscheiben|brot\b|toast|brötchen|broetchen/.test(text)) return "bread_amount";
  if (/sahne|sahnesauce|rahmsauce/.test(text)) return "cream_sauce";
  if (/döner|doener/.test(text)) return "doener";
  if (/pizza/.test(text)) return "pizza";
  if (/burger/.test(text)) return "burger";
  if (/pommes/.test(text)) return "fries";
  if (/müsli|muesli|frühstück|fruehstueck/.test(text)) return "breakfast";
  if (/quark|skyr|joghurt|hüttenkäse|huettenkaese|hähnchen|haehnchen|pute|thunfisch|eier|protein/.test(text)) return "protein_structure";
  return "structure_" + normalizeShortTitle(parts.title).toLowerCase().replace(/[^a-z0-9äöüß]+/g, "_").slice(0, 28);
}

function parseEffectFromSegment(segment) {
  const source = String(segment || "").replace(/,/g, ".");
  if (!source) return { kcal: 0, protein: 0, fett: 0, kohlenhydrate: 0 };

  const kcalMatch = source.match(/([+-]?\d+(?:\.\d+)?)\s*kcal/i);

  function gramAfter(labelRegex) {
    const patterns = [
      new RegExp("([+-]?\\d+(?:\\.\\d+)?)\\s*g\\s*(?:" + labelRegex + ")", "i"),
      new RegExp("(?:" + labelRegex + ")\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*g", "i")
    ];

    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) return Number(match[1]) || 0;
    }

    return 0;
  }

  return {
    kcal: kcalMatch ? Number(kcalMatch[1]) || 0 : 0,
    protein: gramAfter("protein|eiweiß|eiweiss"),
    fett: gramAfter("fett"),
    kohlenhydrate: gramAfter("kohlenhydrate|kh|carbs")
  };
}

function parseWeeklyEffect(step) {
  const parts = splitStepParts(step);
  const daily = parseStepDailyEffect(step);
  if (daily) return daily;

  const weekly = parseEffectFromSegment(parts.wochenwirkung);
  if (weekly.kcal || weekly.protein || weekly.fett || weekly.kohlenhydrate) {
    return {
      kcal: roundTo(weekly.kcal / 7, 1),
      protein: roundTo(weekly.protein / 7, 1),
      fett: roundTo(weekly.fett / 7, 1),
      kohlenhydrate: roundTo(weekly.kohlenhydrate / 7, 1)
    };
  }

  return parseEffectFromSegment(parts.wirkungProEreignis);
}

function sameDirection(effect, target, metric) {
  const e = Number(effect?.[metric]) || 0;
  const t = Number(target?.[metric]) || 0;
  if (!e || !t) return false;
  return Math.sign(e) === Math.sign(t);
}

function corridorBoundary(target, metric) {
  const corridor = targetCorridor(target, metric);
  return Number(target) < 0 ? corridor.min : corridor.max;
}

function wouldOvershoot(cumulative, effect, target, metric) {
  const t = Number(target?.[metric]) || 0;
  if (!t) return false;
  const current = Number(cumulative?.[metric]) || 0;
  const next = current + (Number(effect?.[metric]) || 0);
  const boundary = corridorBoundary(t, metric);
  return t < 0 ? next < boundary : next > boundary;
}

function scaleEffect(effect, factor) {
  return {
    kcal: roundTo((Number(effect.kcal) || 0) * factor, 1),
    protein: roundTo((Number(effect.protein) || 0) * factor, 1),
    fett: roundTo((Number(effect.fett) || 0) * factor, 1),
    kohlenhydrate: roundTo((Number(effect.kohlenhydrate) || 0) * factor, 1)
  };
}

function calibrateStepEffect(cumulative, effect, target) {
  const base = {
    kcal: Number(effect?.kcal) || 0,
    protein: Number(effect?.protein) || 0,
    fett: Number(effect?.fett) || 0,
    kohlenhydrate: Number(effect?.kohlenhydrate) || 0
  };

  let factor = 1;
  ["kcal", "protein", "fett", "kohlenhydrate"].forEach(metric => {
    const t = Number(target?.[metric]) || 0;
    const e = Number(base?.[metric]) || 0;
    if (!t || !e || Math.sign(e) !== Math.sign(t)) return;

    const current = Number(cumulative?.[metric]) || 0;
    const boundary = corridorBoundary(t, metric);
    const allowed = boundary - current;

    if (t < 0 && current + e < boundary) {
      const metricFactor = allowed / e;
      if (Number.isFinite(metricFactor)) factor = Math.min(factor, Math.max(0, metricFactor));
    }

    if (t > 0 && current + e > boundary) {
      const metricFactor = allowed / e;
      if (Number.isFinite(metricFactor)) factor = Math.min(factor, Math.max(0, metricFactor));
    }
  });

  factor = clamp(factor, 0, 1);
  return { effect: scaleEffect(base, factor), factor };
}

function formatEffectSegment(effect, per) {
  const suffix = per === "week" ? "/Woche" : per === "event" ? "" : "/Tag";
  return "ca. " +
    formatSigned(effect.kcal, "kcal" + suffix) + ", " +
    formatSigned(effect.protein, "g Protein" + suffix) + ", " +
    formatSigned(effect.fett, "g Fett" + suffix) + ", " +
    formatSigned(effect.kohlenhydrate, "g Kohlenhydrate" + suffix);
}

function serializePlanStep(index, parts, effect, options = {}) {
  const title = normalizeShortTitle(options.title || parts.title);
  const action = cleanSentencePart(options.action || parts.abJetzt || "Setze diesen Schritt bei Auftreten des Musters um");
  const frequency = cleanSentencePart(parts.haeufigkeit || "bei Auftreten");
  const focus = cleanSentencePart(options.focus || parts.fokus || "Zielbereich halten");
  const why = cleanSentencePart(options.why || parts.warum || "Dieser Schritt verändert ein konkretes Muster aus deiner Woche");
  const weeklyEffect = {
    kcal: roundTo(effect.kcal * 7, 1),
    protein: roundTo(effect.protein * 7, 1),
    fett: roundTo(effect.fett * 7, 1),
    kohlenhydrate: roundTo(effect.kohlenhydrate * 7, 1)
  };

  return "Schritt " + (index + 1) +
    ": Titel: " + title +
    ". Ab jetzt: " + action +
    ". Häufigkeit: " + frequency +
    ". Fokus: " + focus +
    ". Warum: " + why +
    ". Wirkung pro Ereignis: Orientierung; konkrete Wirkung wurde auf Wochenbasis eingerechnet." +
    " Wochenwirkung: " + formatEffectSegment(weeklyEffect, "week") +
    ". Tagesdurchschnitt: " + formatEffectSegment(effect, "day") +
    ". Art: " + cleanSentencePart(parts.art || "Umbau") + ".";
}

function isMetricInCorridor(cumulative, target, metric) {
  const t = Number(target?.[metric]) || 0;
  if (!t) return true;
  return inCorridor(Number(cumulative?.[metric]) || 0, targetCorridor(t, metric));
}

function isMetricStillOpen(cumulative, target, metric) {
  const t = Number(target?.[metric]) || 0;
  if (!t) return false;
  const current = Number(cumulative?.[metric]) || 0;
  const corridor = targetCorridor(t, metric);

  if (t < 0) return current > corridor.max;
  return current < corridor.min;
}

function needsStabilization(cumulative, target) {
  const kcalOk = isMetricInCorridor(cumulative, target, "kcal");
  const fatOk = isMetricInCorridor(cumulative, target, "fett");
  const proteinOk = isMetricInCorridor(cumulative, target, "protein");
  const carbsRelevant = Math.abs(Number(target.kohlenhydrate) || 0) >= 15;
  const carbsOk = !carbsRelevant || isMetricInCorridor(cumulative, target, "kohlenhydrate");

  return kcalOk && fatOk && proteinOk && carbsOk;
}

function cleanSentencePart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

function hasAnyEffect(effect) {
  return ["kcal", "protein", "fett", "kohlenhydrate"].some(metric => Math.abs(Number(effect?.[metric]) || 0) > 0.2);
}

function fallbackEffectForPattern(key, target) {
  const wantsKcalDown = Number(target.kcal) < 0;
  const wantsFatDown = Number(target.fett) < 0;
  const wantsProteinUp = Number(target.protein) > 0;
  const wantsCarbsDown = Number(target.kohlenhydrate) < 0;

  if (key === "drink_sugar") {
    return {
      kcal: wantsKcalDown ? -100 : 0,
      protein: 0,
      fett: 0,
      kohlenhydrate: wantsCarbsDown ? -25 : -15
    };
  }

  if (key === "sweet_snack") {
    return {
      kcal: wantsKcalDown ? -65 : 0,
      protein: wantsProteinUp ? 2 : 0,
      fett: wantsFatDown ? -3 : 0,
      kohlenhydrate: wantsCarbsDown ? -10 : -5
    };
  }

  if (key === "chips") {
    return { kcal: wantsKcalDown ? -35 : 0, protein: 0, fett: wantsFatDown ? -3 : 0, kohlenhydrate: wantsCarbsDown ? -4 : 0 };
  }

  if (key === "nuts") {
    return { kcal: wantsKcalDown ? -25 : 0, protein: 0, fett: wantsFatDown ? -3 : 0, kohlenhydrate: 0 };
  }

  if (key === "bread_topping") {
    return { kcal: wantsKcalDown ? -90 : 0, protein: wantsProteinUp ? 5 : 0, fett: wantsFatDown ? -9 : 0, kohlenhydrate: 0 };
  }

  if (key === "bread_amount") {
    return { kcal: wantsKcalDown ? -35 : 0, protein: 0, fett: 0, kohlenhydrate: wantsCarbsDown ? -8 : 0 };
  }

  if (key === "cream_sauce") {
    return { kcal: wantsKcalDown ? -35 : 0, protein: 0, fett: wantsFatDown ? -4 : 0, kohlenhydrate: 0 };
  }

  if (["doener", "pizza", "burger", "fries"].includes(key)) {
    return { kcal: wantsKcalDown ? -45 : 0, protein: wantsProteinUp ? 2 : 0, fett: wantsFatDown ? -4 : 0, kohlenhydrate: wantsCarbsDown ? -4 : 0 };
  }

  if (key === "breakfast") {
    return { kcal: wantsKcalDown ? -20 : 0, protein: wantsProteinUp ? 6 : 0, fett: wantsFatDown ? -2 : 0, kohlenhydrate: wantsCarbsDown ? -4 : 0 };
  }

  if (key === "protein_structure") {
    return { kcal: 0, protein: wantsProteinUp ? 8 : 0, fett: wantsFatDown ? -1 : 0, kohlenhydrate: 0 };
  }

  return { kcal: 0, protein: 0, fett: 0, kohlenhydrate: 0 };
}

function normalizeRawEffectForGoal(effect, target, key) {
  const output = {
    kcal: Number(effect?.kcal) || 0,
    protein: Number(effect?.protein) || 0,
    fett: Number(effect?.fett) || 0,
    kohlenhydrate: Number(effect?.kohlenhydrate) || 0
  };

  if (!hasAnyEffect(output)) {
    return fallbackEffectForPattern(key, target);
  }

  // Bei Kalorienüberschuss sollen Protein-Schritte als Ersatz gedacht werden, nicht als extra Kalorien oben drauf.
  if (Number(target.kcal) < 0 && output.kcal > 0) output.kcal = key === "protein_structure" ? 0 : Math.min(output.kcal, 0);
  if (Number(target.fett) < 0 && output.fett > 0) output.fett = 0;
  if (Number(target.kohlenhydrate) < 0 && output.kohlenhydrate > 0) output.kohlenhydrate = 0;
  if (Number(target.protein) > 0 && output.protein < 0) output.protein = 0;

  return output;
}

function calibrateStepEffectForGaps(cumulative, effect, target, key) {
  const base = normalizeRawEffectForGoal(effect, target, key);

  // Protein-Schritte dürfen Protein schließen, auch wenn Kalorien/Fett schon nah am Ziel sind.
  // Die begleitenden Kalorien-/Fett-/KH-Effekte werden dann gekappt, nicht das Protein selbst.
  if (key === "protein_structure" || (base.protein > 0 && isMetricStillOpen(cumulative, target, "protein"))) {
    const result = { ...base };

    ["kcal", "fett", "kohlenhydrate"].forEach(metric => {
      const t = Number(target?.[metric]) || 0;
      const e = Number(result?.[metric]) || 0;
      if (!t || !e || Math.sign(e) !== Math.sign(t)) return;

      const current = Number(cumulative?.[metric]) || 0;
      const corridor = targetCorridor(t, metric);
      const boundary = t < 0 ? corridor.min : corridor.max;
      const next = current + e;

      if (t < 0 && next < boundary) {
        result[metric] = roundTo(boundary - current, 1);
      }

      if (t > 0 && next > boundary) {
        result[metric] = roundTo(boundary - current, 1);
      }
    });

    const proteinTarget = Number(target.protein) || 0;
    if (proteinTarget > 0 && result.protein > 0) {
      const current = Number(cumulative.protein) || 0;
      const corridor = targetCorridor(proteinTarget, "protein");
      const allowed = Math.max(0, corridor.max - current);
      result.protein = roundTo(allowed > 0 ? Math.min(result.protein, allowed) : 0, 1);
    }

    return result;
  }

  return calibrateStepEffect(cumulative, base, target).effect;
}

function addEffect(a, b) {
  return {
    kcal: roundTo((Number(a.kcal) || 0) + (Number(b.kcal) || 0), 1),
    protein: roundTo((Number(a.protein) || 0) + (Number(b.protein) || 0), 1),
    fett: roundTo((Number(a.fett) || 0) + (Number(b.fett) || 0), 1),
    kohlenhydrate: roundTo((Number(a.kohlenhydrate) || 0) + (Number(b.kohlenhydrate) || 0), 1)
  };
}

function subtractEffect(a, b) {
  return {
    kcal: roundTo((Number(a.kcal) || 0) - (Number(b.kcal) || 0), 1),
    protein: roundTo((Number(a.protein) || 0) - (Number(b.protein) || 0), 1),
    fett: roundTo((Number(a.fett) || 0) - (Number(b.fett) || 0), 1),
    kohlenhydrate: roundTo((Number(a.kohlenhydrate) || 0) - (Number(b.kohlenhydrate) || 0), 1)
  };
}

function makeStabilizationAction(parts) {
  return {
    title: normalizeShortTitle(parts.title).replace(/ ersetzen$/i, " absichern"),
    action: "Nutze diesen Schritt als Regel, falls dieses Muster erneut auftaucht. Nicht zusätzlich zu bereits ersetzten oder portionierten Vorkommen addieren.",
    focus: "Struktur halten, keine Doppelzählung",
    why: "Dieser Schritt verhindert Rückfälle, ohne dieselbe Kalorienquelle doppelt zu zählen."
  };
}

function makeProteinCorrectionStep(remainingProtein, target, cumulative) {
  const proteinPerEvent = 15;
  const frequency = clamp(Math.ceil((remainingProtein * 7) / proteinPerEvent), 2, 7);
  const proteinDaily = roundTo((proteinPerEvent * frequency) / 7, 1);

  let kcalDaily = 0;
  let fatDaily = 0;
  let carbDaily = 0;

  if (isMetricStillOpen(cumulative, target, "kcal")) kcalDaily = -20;
  if (isMetricStillOpen(cumulative, target, "fett")) fatDaily = -2;
  if (isMetricStillOpen(cumulative, target, "kohlenhydrate")) carbDaily = -2;

  return {
    parts: {
      title: "Proteinbasis stärken",
      abJetzt: "Ersetze an " + frequency + " Tagen pro Woche eine fett- oder zuckerreiche Snack-/Belagkomponente durch ca. 150 g Magerquark, Skyr oder eine magere Proteinquelle.",
      haeufigkeit: frequency + "x/Woche",
      fokus: "Protein erhöhen" + (fatDaily < 0 ? ", Fett senken" : ""),
      warum: "So schließt du die Proteinlücke, ohne zusätzliche Kalorien einfach oben drauf zu legen.",
      art: "Ersetzen"
    },
    effect: {
      kcal: kcalDaily,
      protein: Math.min(proteinDaily, targetCorridor(target.protein, "protein").max),
      fett: fatDaily,
      kohlenhydrate: carbDaily
    }
  };
}

function makeFatCorrectionStep(remainingFat, target, cumulative) {
  const dailyFat = Math.min(Math.abs(remainingFat) + 2, 20);
  const kcalTarget = Number(target.kcal) || 0;
  const kcalCorridor = targetCorridor(kcalTarget, "kcal");
  const kcalCurrent = Number(cumulative.kcal) || 0;
  const kcalStillOpen = kcalTarget < 0 && kcalCurrent > kcalCorridor.max + 20;
  const maxKcalReduction = kcalStillOpen ? Math.max(0, kcalCurrent - kcalCorridor.max) : 0;
  const kcalReduction = kcalStillOpen ? -Math.min(dailyFat * 9, maxKcalReduction) : 0;

  return {
    parts: {
      title: "Fettquelle dosieren",
      abJetzt: "Reduziere eine portionssensible Fettquelle wie Käse, Butter, Sauce oder Nüsse an den betroffenen Tagen um eine kleine Portion.",
      haeufigkeit: "bei Auftreten",
      fokus: "Fett senken",
      warum: "So wird die Fettlücke geschlossen, ohne die gesamte Mahlzeit radikal zu verändern.",
      art: "Portionieren"
    },
    effect: {
      kcal: roundTo(kcalReduction, 1),
      protein: 0,
      fett: -dailyFat,
      kohlenhydrate: 0
    }
  };
}

function makeKcalCorrectionStep(remainingKcal, target, cumulative) {
  const dailyKcal = Math.min(Math.abs(remainingKcal), 90);
  return {
    parts: {
      title: "Portion leicht senken",
      abJetzt: "Reduziere an den stärksten Snack- oder Brot-Tagen eine kleine Portion, statt eine zusätzliche neue Regel einzubauen.",
      haeufigkeit: "bei Auftreten",
      fokus: "Kalorien senken",
      warum: "So wird der Durchschnittstag in den Zielbereich geführt, ohne zu hart zu kürzen.",
      art: "Portionieren"
    },
    effect: {
      kcal: -dailyKcal,
      protein: 0,
      fett: isMetricStillOpen(cumulative, target, "fett") ? -3 : 0,
      kohlenhydrate: isMetricStillOpen(cumulative, target, "kohlenhydrate") ? -8 : 0
    }
  };
}

function chooseReplacementIndex(normalizedMeta, preferredPatterns = []) {
  for (let i = normalizedMeta.length - 1; i >= 0; i -= 1) {
    if (Math.abs(normalizedMeta[i].effect.kcal || 0) < 1 && Math.abs(normalizedMeta[i].effect.protein || 0) < 1 && Math.abs(normalizedMeta[i].effect.fett || 0) < 1) {
      return i;
    }
  }

  for (let i = normalizedMeta.length - 1; i >= 0; i -= 1) {
    if (preferredPatterns.includes(normalizedMeta[i].key)) return i;
  }

  return Math.max(0, normalizedMeta.length - 1);
}

function replaceMetaStep(normalizedMeta, index, replacement) {
  const old = normalizedMeta[index];
  normalizedMeta[index] = {
    key: "server_balance_" + index,
    parts: replacement.parts,
    effect: replacement.effect,
    serialized: serializePlanStep(index, replacement.parts, replacement.effect)
  };
  return old?.effect || { kcal: 0, protein: 0, fett: 0, kohlenhydrate: 0 };
}

function trimOvershoot(normalizedMeta, cumulative, target) {
  const metrics = ["kcal", "fett", "kohlenhydrate", "protein"];

  metrics.forEach(metric => {
    const t = Number(target?.[metric]) || 0;
    if (!t) return;

    const corridor = targetCorridor(t, metric);
    const tooMuch = t < 0
      ? (Number(cumulative[metric]) || 0) < corridor.min
      : (Number(cumulative[metric]) || 0) > corridor.max;

    if (!tooMuch) return;

    for (let i = normalizedMeta.length - 1; i >= 0; i -= 1) {
      const effect = normalizedMeta[i].effect;
      const e = Number(effect?.[metric]) || 0;
      if (!e || Math.sign(e) !== Math.sign(t)) continue;

      const desiredBoundary = t < 0 ? corridor.min : corridor.max;
      const currentWithout = subtractEffect(cumulative, effect);
      const allowed = desiredBoundary - (Number(currentWithout[metric]) || 0);
      const factor = e ? clamp(allowed / e, 0, 1) : 0;
      const newEffect = scaleEffect(effect, factor);

      cumulative.kcal = roundTo((Number(currentWithout.kcal) || 0) + newEffect.kcal, 1);
      cumulative.protein = roundTo((Number(currentWithout.protein) || 0) + newEffect.protein, 1);
      cumulative.fett = roundTo((Number(currentWithout.fett) || 0) + newEffect.fett, 1);
      cumulative.kohlenhydrate = roundTo((Number(currentWithout.kohlenhydrate) || 0) + newEffect.kohlenhydrate, 1);

      if (!hasAnyEffect(newEffect)) {
        const stable = makeStabilizationAction(normalizedMeta[i].parts);
        normalizedMeta[i].parts = { ...normalizedMeta[i].parts, ...stable };
      }

      normalizedMeta[i].effect = newEffect;
      normalizedMeta[i].serialized = serializePlanStep(i, normalizedMeta[i].parts, newEffect);
      break;
    }
  });

  return cumulative;
}

function finalizePlanToTargetCorridor(normalizedMeta, target) {
  let cumulative = normalizedMeta.reduce((sum, item) => addEffect(sum, item.effect), {
    kcal: 0,
    protein: 0,
    fett: 0,
    kohlenhydrate: 0
  });

  const proteinTarget = Number(target.protein) || 0;
  if (proteinTarget > 0 && isMetricStillOpen(cumulative, target, "protein")) {
    const proteinNeed = targetCorridor(proteinTarget, "protein").min - cumulative.protein;
    if (proteinNeed > 1) {
      const replacement = makeProteinCorrectionStep(proteinNeed, target, cumulative);
      const index = chooseReplacementIndex(normalizedMeta, ["protein_structure", "breakfast"]);
      const oldEffect = replaceMetaStep(normalizedMeta, index, replacement);
      cumulative = addEffect(subtractEffect(cumulative, oldEffect), replacement.effect);
    }
  }

  const fatTarget = Number(target.fett) || 0;
  if (fatTarget < 0 && isMetricStillOpen(cumulative, target, "fett")) {
    const fatNeed = Math.abs(targetCorridor(fatTarget, "fett").max - cumulative.fett);
    if (fatNeed > 1) {
      const replacement = makeFatCorrectionStep(fatNeed, target, cumulative);
      const index = chooseReplacementIndex(normalizedMeta, ["bread_topping", "nuts", "cream_sauce"]);
      const oldEffect = replaceMetaStep(normalizedMeta, index, replacement);
      cumulative = addEffect(subtractEffect(cumulative, oldEffect), replacement.effect);
    }
  }

  const kcalTarget = Number(target.kcal) || 0;
  if (kcalTarget < 0 && isMetricStillOpen(cumulative, target, "kcal")) {
    const kcalNeed = Math.abs(targetCorridor(kcalTarget, "kcal").max - cumulative.kcal);
    if (kcalNeed > 10) {
      const replacement = makeKcalCorrectionStep(kcalNeed, target, cumulative);
      const index = chooseReplacementIndex(normalizedMeta, ["sweet_snack", "bread_amount", "drink_sugar"]);
      const oldEffect = replaceMetaStep(normalizedMeta, index, replacement);
      cumulative = addEffect(subtractEffect(cumulative, oldEffect), replacement.effect);
    }
  }

  cumulative = trimOvershoot(normalizedMeta, cumulative, target);
  return normalizedMeta;
}

function normalizePlanWithWeeklySimulation(report) {
  if (!report || !Array.isArray(report.zehnSchrittePlan)) return report;

  const target = {
    kcal: signedTargetEffect(report.differenz?.kcal),
    protein: signedTargetEffect(report.differenz?.protein),
    fett: signedTargetEffect(report.differenz?.fett),
    kohlenhydrate: signedTargetEffect(report.differenz?.kohlenhydrate)
  };

  const cumulative = { kcal: 0, protein: 0, fett: 0, kohlenhydrate: 0 };
  const usedKeys = new Set();
  const normalizedMeta = [];

  report.zehnSchrittePlan.slice(0, 10).forEach((step, index) => {
    const parts = splitStepParts(step);
    const key = stepPatternKey(parts);
    const parsedEffect = parseWeeklyEffect(step);
    const rawEffect = normalizeRawEffectForGoal(parsedEffect, target, key);

    let effect = rawEffect;
    let nextParts = { ...parts };

    const duplicate = usedKeys.has(key) && !key.startsWith("structure_") && key !== "protein_structure";
    const fullyStabilized = needsStabilization(cumulative, target);

    if (duplicate) {
      effect = { kcal: 0, protein: 0, fett: 0, kohlenhydrate: 0 };
      nextParts = { ...nextParts, ...makeStabilizationAction(parts) };
    } else if (fullyStabilized && sameDirection(rawEffect, target, "kcal") && Math.abs(rawEffect.kcal || 0) >= 20) {
      effect = { kcal: 0, protein: 0, fett: 0, kohlenhydrate: 0 };
      nextParts = {
        ...nextParts,
        title: normalizeShortTitle(parts.title).replace(/ ersetzen$/i, " als Reserve"),
        abJetzt: "Nutze diese Variante als Reserve, wenn das Muster erneut auftaucht. Nicht zusätzlich weiter kürzen, wenn die vorherigen Schritte sitzen.",
        fokus: "Zielbereich halten",
        warum: "Die Hauptlücke ist rechnerisch bereits weitgehend geschlossen; dieser Schritt dient der Absicherung."
      };
    } else {
      effect = calibrateStepEffectForGaps(cumulative, rawEffect, target, key);
    }

    cumulative.kcal = roundTo(cumulative.kcal + (effect.kcal || 0), 1);
    cumulative.protein = roundTo(cumulative.protein + (effect.protein || 0), 1);
    cumulative.fett = roundTo(cumulative.fett + (effect.fett || 0), 1);
    cumulative.kohlenhydrate = roundTo(cumulative.kohlenhydrate + (effect.kohlenhydrate || 0), 1);

    usedKeys.add(key);

    normalizedMeta.push({
      key,
      parts: nextParts,
      effect,
      serialized: serializePlanStep(index, nextParts, effect)
    });
  });

  while (normalizedMeta.length < 10) {
    const index = normalizedMeta.length;
    const parts = {
      title: "Struktur absichern",
      abJetzt: "Halte die bereits gewählten Ersatz- und Portionsregeln für die nächste Woche konstant.",
      haeufigkeit: "täglich",
      fokus: "Zielbereich halten",
      warum: "Konstanz ist wichtiger als weitere zusätzliche Kürzungen.",
      art: "Strukturieren"
    };
    const effect = { kcal: 0, protein: 0, fett: 0, kohlenhydrate: 0 };
    normalizedMeta.push({
      key: "structure_fill_" + index,
      parts,
      effect,
      serialized: serializePlanStep(index, parts, effect)
    });
  }

  const balancedMeta = finalizePlanToTargetCorridor(normalizedMeta.slice(0, 10), target);
  report.zehnSchrittePlan = balancedMeta.map((item, index) => serializePlanStep(index, item.parts, item.effect));
  return report;
}


function lowerPlain(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function dayFullText(day) {
  return [day?.breakfast, day?.lunch, day?.dinner, day?.snacks, day?.drinks]
    .filter(Boolean)
    .join(" ");
}

function dayMealText(day, fields) {
  return fields.map(field => day?.[field]).filter(Boolean).join(" ");
}

function hasKeyword(text, keywords) {
  const haystack = lowerPlain(text);
  return keywords.some(keyword => haystack.includes(lowerPlain(keyword)));
}

function isZeroDrinkContext(text) {
  const lower = lowerPlain(text);
  return /zero|light|diet|cola\s*zero|zuckerfrei|ohne\s*zucker/.test(lower);
}

function parseAmountCandidates(text) {
  const source = String(text || "").replace(/,/g, ".");
  const candidates = [];
  let rangeMatch;
  const rangeRegex = /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\b/gi;
  while ((rangeMatch = rangeRegex.exec(source))) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    const unit = rangeMatch[3].toLowerCase();
    if (Number.isFinite(a) && Number.isFinite(b)) {
      candidates.push({ index: rangeMatch.index, value: (a + b) / 2, unit });
    }
  }

  let singleMatch;
  const singleRegex = /(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\b/gi;
  while ((singleMatch = singleRegex.exec(source))) {
    const value = Number(singleMatch[1]);
    const unit = singleMatch[2].toLowerCase();
    if (Number.isFinite(value)) {
      candidates.push({ index: singleMatch.index, value, unit });
    }
  }

  return candidates;
}

function amountNearKeyword(text, keywords, expectedUnit, fallback) {
  const source = String(text || "");
  const lower = lowerPlain(source);
  const keywordPositions = keywords
    .map(keyword => lower.indexOf(lowerPlain(keyword)))
    .filter(index => index >= 0);

  if (!keywordPositions.length) return fallback;

  const amounts = parseAmountCandidates(source);
  if (!amounts.length) return fallback;

  let best = null;
  for (const amount of amounts) {
    for (const position of keywordPositions) {
      const distance = Math.abs(amount.index - position);
      if (distance <= 70 && (!best || distance < best.distance)) {
        best = { ...amount, distance };
      }
    }
  }

  if (!best) return fallback;

  let value = best.value;
  if (expectedUnit === "ml" && best.unit === "l") value *= 1000;
  if (expectedUnit === "g" && best.unit === "kg") value *= 1000;

  if (expectedUnit === "ml" && best.unit === "g") return fallback;
  if (expectedUnit === "g" && best.unit === "ml") return fallback;

  return Math.max(0, value);
}

function uniqueNumbers(values) {
  return Array.from(new Set(values.filter(value => Number.isFinite(value)))).sort((a, b) => a - b);
}

function formatTagList(days) {
  const list = uniqueNumbers(days);
  if (!list.length) return "in deiner Woche";
  if (list.length === 1) return "an Tag " + list[0];
  if (list.length === 2) return "an Tag " + list[0] + " und Tag " + list[1];
  return "an Tag " + list.slice(0, -1).join(", Tag ") + " und Tag " + list[list.length - 1];
}

function formatFrequency(daysOrNumber) {
  const count = Array.isArray(daysOrNumber) ? uniqueNumbers(daysOrNumber).length : Number(daysOrNumber) || 0;
  if (count <= 0) return "als Regel";
  if (count === 7) return "täglich";
  return count + "x/Woche";
}

function capitalizeFirst(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function makeEffect(kcal = 0, protein = 0, fett = 0, kohlenhydrate = 0) {
  return {
    kcal: roundTo(kcal, 1),
    protein: roundTo(protein, 1),
    fett: roundTo(fett, 1),
    kohlenhydrate: roundTo(kohlenhydrate, 1)
  };
}

function weeklyToDaily(effect) {
  return makeEffect(
    (Number(effect?.kcal) || 0) / 7,
    (Number(effect?.protein) || 0) / 7,
    (Number(effect?.fett) || 0) / 7,
    (Number(effect?.kohlenhydrate) || 0) / 7
  );
}

function dailyToWeekly(effect) {
  return makeEffect(
    (Number(effect?.kcal) || 0) * 7,
    (Number(effect?.protein) || 0) * 7,
    (Number(effect?.fett) || 0) * 7,
    (Number(effect?.kohlenhydrate) || 0) * 7
  );
}


function createCandidate(key, title, action, frequency, focus, why, weeklyEffect, days = [], priority = 50, type = "Umbau") {
  return {
    key,
    title,
    action,
    frequency,
    focus,
    why,
    weeklyEffect: makeEffect(
      weeklyEffect?.kcal,
      weeklyEffect?.protein,
      weeklyEffect?.fett,
      weeklyEffect?.kohlenhydrate
    ),
    dailyEffect: weeklyToDaily(weeklyEffect),
    days: uniqueNumbers(days),
    priority,
    type
  };
}

function gatherOccurrenceDays(occurrences) {
  return uniqueNumbers(occurrences.map(item => item.day));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function normalizeItemText(value) {
  return lowerPlain(value || "");
}

function gramsFromOccurrence(item, fallback = 50) {
  const amount = Number(item?.amount) || fallback;
  return amount > 0 ? amount : fallback;
}

function makeSourceId(type, day, index = 0) {
  return type + "_tag" + (Number(day) || 0) + "_" + index;
}

function createCandidateV34(config) {
  const weeklyEffect = makeEffect(
    config.weeklyEffect?.kcal || 0,
    config.weeklyEffect?.protein || 0,
    config.weeklyEffect?.fett || 0,
    config.weeklyEffect?.kohlenhydrate || 0
  );

  return {
    key: config.key,
    group: config.group || config.key,
    title: cleanSentencePart(config.title),
    action: cleanSentencePart(config.action),
    frequency: cleanSentencePart(config.frequency),
    focus: cleanSentencePart(config.focus),
    why: cleanSentencePart(config.why),
    type: cleanSentencePart(config.type || "Umbau"),
    days: uniqueNumbers(config.days || []),
    sourceIds: Array.from(new Set(config.sourceIds || [config.key])),
    weeklyEffect,
    dailyEffect: weeklyToDaily(weeklyEffect),
    priority: Number(config.priority) || 50,
    countsAsEffect: config.countsAsEffect !== false
  };
}

function totalWeeklyEffectOf(entries, mapper) {
  return entries.reduce((effect, item, index) => {
    const next = mapper(item, index) || {};
    return makeEffect(
      effect.kcal + (Number(next.kcal) || 0),
      effect.protein + (Number(next.protein) || 0),
      effect.fett + (Number(next.fett) || 0),
      effect.kohlenhydrate + (Number(next.kohlenhydrate) || 0)
    );
  }, makeEffect(0, 0, 0, 0));
}

function reportedSourceArray(report) {
  const sources = [];
  if (Array.isArray(report?.topKalorienQuellen)) {
    report.topKalorienQuellen.forEach((item, index) => {
      sources.push({
        source: "top",
        index,
        name: String(item?.lebensmittel || ""),
        role: String(item?.rolle || ""),
        reason: String(item?.grund || ""),
        kcal: Number(item?.kcal) || 0,
        amountText: ""
      });
    });
  }
  if (Array.isArray(report?.lebensmittelAnalyse)) {
    report.lebensmittelAnalyse.forEach((item, index) => {
      sources.push({
        source: "analyse",
        index,
        name: String(item?.lebensmittel || ""),
        role: String(item?.bewertung || ""),
        reason: String(item?.einordnung || ""),
        kcal: Number(item?.kcal) || 0,
        protein: Number(item?.protein) || 0,
        fett: Number(item?.fett) || 0,
        kohlenhydrate: Number(item?.kohlenhydrate) || 0,
        amountText: String(item?.menge || "")
      });
    });
  }
  return sources;
}

function findReportedSources(report, keywords) {
  return reportedSourceArray(report).filter(item => {
    const text = normalizeItemText([item.name, item.role, item.reason, item.amountText].join(" "));
    return keywords.some(keyword => text.includes(normalizeItemText(keyword)));
  });
}

function weeklyKcalFromReported(report, keywords, fallback = 0) {
  const matches = findReportedSources(report, keywords);
  const total = sum(matches.map(item => item.kcal));
  return total > 0 ? total : fallback;
}

function frequencyFromReportText(report, keywords, fallback = 1) {
  const text = normalizeItemText([
    report?.ernaehrungsrealitaet,
    report?.zentralesProblem,
    ...(Array.isArray(report?.problemMuster) ? report.problemMuster.map(item => [item?.muster, item?.beobachtung, item?.hebel].join(" ")) : []),
    ...(Array.isArray(report?.topKalorienQuellen) ? report.topKalorienQuellen.map(item => [item?.lebensmittel, item?.grund, item?.rolle].join(" ")) : [])
  ].join(" "));

  const relevant = keywords.some(keyword => text.includes(normalizeItemText(keyword)));
  if (!relevant) return fallback;
  if (/taeglich|jeden\s+tag|7x|sieben\s+tage/.test(text)) return 7;
  const freqMatch = text.match(/(\d+)\s*x\s*(?:pro\s*)?(?:woche|woechentlich)/);
  if (freqMatch) return clamp(Number(freqMatch[1]) || fallback, 1, 7);
  if (/mehrmals|regelmaessig|wiederholt/.test(text)) return Math.max(fallback, 3);
  return fallback;
}

function aggregateFallbackCandidate(report, existingGroups) {
  const candidates = [];

  const addIfMissing = (group, keywords, title, action, focus, why, type, priority, effectBuilder, fallbackFrequency = 1) => {
    if (existingGroups.has(group)) return;
    const matches = findReportedSources(report, keywords);
    const kcal = sum(matches.map(item => item.kcal));
    if (!matches.length && kcal <= 0) return;
    const frequency = frequencyFromReportText(report, keywords, fallbackFrequency);
    const weeklyEffect = effectBuilder(kcal || 0, frequency, matches);
    if (!hasAnyEffect(weeklyEffect)) return;
    candidates.push(createCandidateV34({
      key: group + "_reported",
      group,
      title,
      action,
      frequency: formatFrequency(frequency),
      focus,
      why,
      type,
      days: Array.from({ length: frequency }, (_, index) => index + 1),
      sourceIds: [group + "_reported"],
      weeklyEffect,
      priority
    }));
  };

  addIfMissing(
    "drink_sugar",
    ["cola", "limonade", "saft", "eistee", "zuckergetraenk", "zuckergetränk"],
    "Cola ersetzen",
    "Alle Cola- oder Zuckergetränke aus deiner 7-Tage-Woche ersetzt du durch Wasser, ungesüßten Tee oder eine kalorienfreie Variante.",
    "Kalorien und Kohlenhydrate senken",
    "Flüssige Kalorien sättigen kaum und lassen sich leicht ersetzen.",
    "Ersetzen",
    1,
    (kcal, frequency) => makeEffect(-(kcal || frequency * 120), 0, 0, -Math.round((kcal || frequency * 120) / 4)),
    3
  );

  addIfMissing(
    "sweet_snack",
    ["schokolade", "schokoriegel", "nutella", "keks", "süß", "suess"],
    "Süßes portionieren",
    "Die süßen Snacks aus deiner 7-Tage-Woche begrenzt du auf eine kleine Portion von ca. 20 g.",
    "Kalorien senken",
    "Du behältst eine kleine Portion, reduzierst aber den größten Kalorienhebel.",
    "Portionieren",
    10,
    (kcal) => makeEffect(-Math.max(120, kcal * 0.6), 0, -Math.max(5, kcal * 0.6 * 0.30 / 9), -Math.max(12, kcal * 0.6 * 0.55 / 4)),
    2
  );

  addIfMissing(
    "chips",
    ["chips"],
    "Chips portionieren",
    "Die Chips aus deiner 7-Tage-Woche begrenzt du auf eine kleine Portion von ca. 20 g.",
    "Kalorien und Fett senken",
    "Eine kleinere Portion senkt Fett und Kalorien, ohne ein Verbot daraus zu machen.",
    "Portionieren",
    12,
    (kcal) => makeEffect(-Math.max(120, kcal * 0.65), 0, -Math.max(8, kcal * 0.65 * 0.34 / 9), -Math.max(10, kcal * 0.65 * 0.50 / 4)),
    1
  );

  addIfMissing(
    "nuts",
    ["nüsse", "nuesse", "nuss", "mandeln", "cashew", "erdnüsse", "erdnuesse"],
    "Nüsse portionieren",
    "Die Nussportionen aus deiner 7-Tage-Woche reduzierst du auf ca. 15 g.",
    "Fett senken",
    "Nüsse können hochwertig sein, sind aber sehr portionssensibel.",
    "Portionieren",
    30,
    (kcal) => makeEffect(-Math.max(90, kcal * 0.5), 0, -Math.max(7, kcal * 0.5 * 0.50 / 9), 0),
    2
  );

  addIfMissing(
    "cream_sauce",
    ["sahnesauce", "sahne", "rahmsauce"],
    "Sahnesauce ersetzen",
    "Die Sahnesauce aus deiner 7-Tage-Woche ersetzt du durch Tomatensauce, Gemüsebrühe oder eine leichte Joghurtsauce.",
    "Fett und Kalorien senken",
    "Bei Saucen lässt sich Fett oft reduzieren, ohne die ganze Mahlzeit zu streichen.",
    "Ersetzen",
    25,
    (kcal) => makeEffect(-Math.max(150, kcal * 0.75), 0, -Math.max(12, kcal * 0.75 / 9 * 0.75), 0),
    1
  );

  addIfMissing(
    "bread_topping",
    ["käse", "kaese", "wurst", "salami", "aufschnitt"],
    "Brotbelag umbauen",
    "Die Käse-/Wurstbeläge aus deiner 7-Tage-Woche ersetzt du durch Putenbrust, mageren Aufschnitt oder fettarmen Frischkäse.",
    "Fett senken, Protein erhöhen",
    "Der Belag bleibt sättigend, aber Fett- und Kaloriendichte sinken.",
    "Ersetzen",
    18,
    (kcal, frequency) => makeEffect(-Math.max(180, (kcal || frequency * 160) * 0.45), Math.max(12, frequency * 6), -Math.max(18, frequency * 7), -Math.max(0, frequency * 2)),
    3
  );

  addIfMissing(
    "butter",
    ["butter"],
    "Butter dosieren",
    "Die Butterportionen aus deiner 7-Tage-Woche reduzierst du auf ca. 5 g oder ersetzt sie durch fettarmen Frischkäse.",
    "Fett senken",
    "Butter ist sehr energiedicht; kleine Mengenänderungen wirken schnell.",
    "Portionieren",
    20,
    (kcal, frequency) => makeEffect(-Math.max(80, (kcal || frequency * 80) * 0.65), 0, -Math.max(8, frequency * 7), 0),
    2
  );

  addIfMissing(
    "fries",
    ["pommes", "fritten"],
    "Pommes ersetzen",
    "Die Pommes aus deiner 7-Tage-Woche ersetzt du durch Ofengemüse, Salat oder Kartoffeln aus dem Ofen mit wenig Öl.",
    "Kalorien und Fett senken",
    "Die Beilage bleibt sättigend, aber Fett- und Kaloriendichte sinken.",
    "Ersetzen",
    35,
    (kcal, frequency) => makeEffect(-Math.max(180, (kcal || frequency * 350) * 0.55), 0, -Math.max(12, frequency * 10), -Math.max(15, frequency * 15)),
    1
  );

  addIfMissing(
    "doener",
    ["döner", "doener"],
    "Döner leichter wählen",
    "Den Döner aus deiner 7-Tage-Woche wählst du als leichtere Variante mit viel Fleisch und Salat, wenig Sauce und ohne Extra-Fettquelle.",
    "Kalorien und Fett senken",
    "Du veränderst die energiedichtesten Bestandteile, ohne das ganze Gericht zu verbieten.",
    "Umbauen",
    38,
    (kcal, frequency) => makeEffect(-Math.max(220, (kcal || frequency * 800) * 0.30), Math.max(6, frequency * 8), -Math.max(10, frequency * 12), -Math.max(12, frequency * 16)),
    1
  );

  addIfMissing(
    "burger_reported",
    ["burger"],
    "Burger leichter wählen",
    "Den Burger aus deiner 7-Tage-Woche wählst du kleiner, mit weniger Sauce/Käse und ohne zusätzliche Fettbeilage.",
    "Kalorien und Fett senken",
    "Größe, Käse, Sauce und Beilage bestimmen hier den größten Teil der Wirkung.",
    "Umbauen",
    40,
    (kcal, frequency) => makeEffect(-Math.max(180, (kcal || frequency * 700) * 0.25), Math.max(0, frequency * 3), -Math.max(8, frequency * 10), -Math.max(8, frequency * 12)),
    1
  );

  addIfMissing(
    "pizza_reported",
    ["pizza"],
    "Pizza leichter wählen",
    "Die Pizza aus deiner 7-Tage-Woche wählst du kleiner, mit proteinreicherem Belag und weniger Extra-Käse.",
    "Kalorien und Fett senken",
    "Größe, Käsemenge und Belag bestimmen hier den größten Teil der Wirkung.",
    "Umbauen",
    41,
    (kcal, frequency) => makeEffect(-Math.max(180, (kcal || frequency * 700) * 0.25), Math.max(0, frequency * 5), -Math.max(8, frequency * 10), -Math.max(10, frequency * 14)),
    1
  );

  addIfMissing(
    "bread_amount",
    ["brot", "toast", "brötchen", "broetchen"],
    "Brotmenge steuern",
    "Die größten Brot-/Toastportionen aus deiner 7-Tage-Woche reduzierst du um ca. ein Drittel.",
    "Kalorien und Kohlenhydrate senken",
    "So bleibt Brot möglich, aber die Portionsgröße passt besser zum Ziel.",
    "Portionieren",
    45,
    (kcal, frequency) => makeEffect(-Math.max(120, (kcal || frequency * 250) * 0.25), 0, -Math.max(0, frequency * 1), -Math.max(18, frequency * 22)),
    3
  );

  addIfMissing(
    "oil_cooking",
    ["öl", "oel", "olivenöl", "olivenoel", "bratöl", "bratoel", "kochöl", "kochoel"],
    "Ölmenge dosieren",
    "Die Ölmenge aus deiner 7-Tage-Woche reduzierst du auf eine bewusst dosierte Menge von ca. 1 TL pro Portion.",
    "Fett und Kalorien senken",
    "Öl ist hochwertig, aber extrem energiedicht; eine kleinere Menge trifft die Fettlücke direkt.",
    "Portionieren",
    21,
    (kcal, frequency) => makeEffect(-Math.max(120, (kcal || frequency * 120) * 0.65), 0, -Math.max(10, frequency * 9), 0),
    2
  );

  addIfMissing(
    "mayo_dressing",
    ["mayo", "mayonnaise", "aioli", "dressing", "remoulade"],
    "Dressing leichter wählen",
    "Mayonnaise-, Aioli- oder Dressingmengen aus deiner 7-Tage-Woche ersetzt du durch Joghurt-Dressing, Essig/Öl dosiert oder eine leichtere Sauce.",
    "Fett und Kalorien senken",
    "Saucen und Dressings liefern oft viel Fett, ohne die Mahlzeit deutlich sättigender zu machen.",
    "Ersetzen",
    24,
    (kcal, frequency) => makeEffect(-Math.max(120, (kcal || frequency * 150) * 0.60), Math.max(0, frequency * 2), -Math.max(8, frequency * 9), -Math.max(0, frequency * 2)),
    2
  );

  addIfMissing(
    "alcohol",
    ["alkohol", "bier", "wein", "sekt", "cocktail", "longdrink", "gin", "vodka"],
    "Alkohol reduzieren",
    "Die Alkoholmenge aus deiner 7-Tage-Woche reduzierst du auf eine bewusst geplante Portion oder ersetzt sie durch eine alkoholfreie Variante.",
    "Kalorien senken",
    "Alkohol liefert zusätzliche Kalorien und erschwert häufig die Sättigungs- und Essenssteuerung.",
    "Reduzieren",
    33,
    (kcal, frequency) => makeEffect(-Math.max(120, (kcal || frequency * 180) * 0.70), 0, 0, -Math.max(8, frequency * 10)),
    1
  );

  addIfMissing(
    "juice_smoothie",
    ["saft", "smoothie", "apfelsaft", "orangensaft", "fruchtsaft"],
    "Saft ersetzen",
    "Saft oder Smoothie aus deiner 7-Tage-Woche ersetzt du durch Wasser, Tee oder ganze Früchte in klarer Portion.",
    "Kalorien und Kohlenhydrate senken",
    "Flüssige Kohlenhydrate sättigen weniger als feste Lebensmittel.",
    "Ersetzen",
    6,
    (kcal, frequency) => makeEffect(-Math.max(100, (kcal || frequency * 120) * 0.75), 0, 0, -Math.max(20, (kcal || frequency * 120) * 0.75 / 4)),
    2
  );

  addIfMissing(
    "coffee_drink",
    ["latte", "cappuccino", "milchkaffee", "frapp", "eiskaffee", "kaffee mit milch", "sirup"],
    "Kaffeegetränk leichter wählen",
    "Milchkaffee-, Latte- oder Sirupgetränke aus deiner 7-Tage-Woche wählst du kleiner, ungesüßt oder mit weniger Milch/Sirup.",
    "Kalorien und Kohlenhydrate senken",
    "Kaffeegetränke werden schnell zu Flüssigkalorien, obwohl sie oft nicht als Mahlzeit zählen.",
    "Umbauen",
    8,
    (kcal, frequency) => makeEffect(-Math.max(80, (kcal || frequency * 140) * 0.60), Math.max(0, frequency * 2), -Math.max(0, frequency * 2), -Math.max(10, frequency * 14)),
    2
  );

  addIfMissing(
    "bakery_pastry",
    ["croissant", "gebäck", "gebaeck", "teilchen", "muffin", "donut", "plunder", "brezel"],
    "Gebäck ersetzen",
    "Gebäck oder süße Backwaren aus deiner 7-Tage-Woche ersetzt du durch eine proteinreichere Frühstücks- oder Snackvariante.",
    "Kalorien und Fett senken, Protein erhöhen",
    "Gebäck kombiniert oft Fett und Kohlenhydrate, ohne lange zu sättigen.",
    "Ersetzen",
    32,
    (kcal, frequency) => makeEffect(-Math.max(140, (kcal || frequency * 300) * 0.45), Math.max(8, frequency * 10), -Math.max(8, frequency * 8), -Math.max(10, frequency * 12)),
    1
  );

  addIfMissing(
    "fried_food",
    ["frittiert", "panade", "paniert", "schnitzel", "chicken nuggets", "nuggets"],
    "Frittiertes umbauen",
    "Frittierte oder panierte Lebensmittel aus deiner 7-Tage-Woche wählst du gegrillt, aus dem Ofen oder mit leichterer Zubereitung.",
    "Kalorien und Fett senken",
    "Die Zubereitung verändert hier oft mehr als das Lebensmittel selbst.",
    "Umbauen",
    34,
    (kcal, frequency) => makeEffect(-Math.max(160, (kcal || frequency * 450) * 0.35), Math.max(0, frequency * 4), -Math.max(10, frequency * 12), -Math.max(0, frequency * 8)),
    1
  );

  addIfMissing(
    "restaurant_canteen",
    ["kantine", "restaurant", "essen gehen", "auswärts", "auswaerts", "imbiss"],
    "Auswärtsmahlzeit steuern",
    "Bei der Auswärts- oder Kantinenmahlzeit wählst du zuerst Protein und Gemüse/Salat und reduzierst Sauce, Käse oder frittierte Beilage.",
    "Kalorien und Fett senken, Protein halten",
    "Auswärts entstehen Überschüsse oft über Sauce, Beilage und Portionsgröße.",
    "Umbauen",
    37,
    (kcal, frequency) => makeEffect(-Math.max(150, (kcal || frequency * 550) * 0.30), Math.max(5, frequency * 6), -Math.max(8, frequency * 10), -Math.max(8, frequency * 10)),
    1
  );

  addIfMissing(
    "carb_side_portion",
    ["nudeln", "pasta", "reis", "kartoffeln", "couscous", "bulgur"],
    "Beilagenportion steuern",
    "Die größte Reis-, Nudel- oder Kartoffelportion aus deiner 7-Tage-Woche reduzierst du leicht und ergänzt dafür mehr Protein oder Gemüse.",
    "Kalorien und Kohlenhydrate steuern",
    "So bleibt die Beilage drin, aber der Durchschnittstag rückt näher ans Ziel.",
    "Portionieren",
    49,
    (kcal, frequency) => makeEffect(-Math.max(100, (kcal || frequency * 250) * 0.25), Math.max(0, frequency * 4), 0, -Math.max(18, frequency * 22)),
    2
  );

  addIfMissing(
    "muesli_cereal",
    ["müsli", "muesli", "cornflakes", "cerealien", "granola", "haferflocken"],
    "Müsli proteinreicher machen",
    "Die Müsli-/Cerealienportion aus deiner 7-Tage-Woche kombinierst du mit Skyr/Magerquark und reduzierst den süßen oder sehr großen Anteil leicht.",
    "Protein erhöhen, Kohlenhydrate steuern",
    "Das Frühstück bleibt ähnlich, sättigt aber besser und trifft die Proteinlücke direkter.",
    "Umbauen",
    30,
    (kcal, frequency) => makeEffect(-Math.max(40, (kcal || frequency * 250) * 0.15), Math.max(10, frequency * 12), -Math.max(0, frequency * 2), -Math.max(8, frequency * 12)),
    2
  );



  return candidates;
}

function buildRuleBasedCandidates(days, report) {
  const candidates = [];
  const allDays = Array.isArray(days) ? days : [];

  const cola = [];
  const sweet = [];
  const chips = [];
  const nuts = [];
  const creamSauce = [];
  const butter = [];
  const breadTopping = [];
  const breadAmount = [];
  const fries = [];
  const doener = [];
  const burger = [];
  const pizza = [];
  const breakfastProtein = [];

  allDays.forEach(day => {
    const tag = Number(day?.tag) || 0;
    const allText = dayFullText(day);
    const drinkText = dayMealText(day, ["drinks"]);
    const snackText = dayMealText(day, ["snacks"]);
    const mealText = dayMealText(day, ["breakfast", "lunch", "dinner"]);
    const breakfastText = dayMealText(day, ["breakfast"]);

    if (hasKeyword(drinkText || allText, ["cola", "limonade", "saft", "eistee"]) && !isZeroDrinkContext(drinkText || allText)) {
      cola.push({ day: tag, amount: amountNearKeyword(drinkText || allText, ["cola", "limonade", "saft", "eistee"], "ml", 300), sourceId: makeSourceId("drink_sugar", tag) });
    }

    if (hasKeyword(snackText || allText, ["schokolade", "schokoriegel", "nutella", "keks", "kuchen"])) {
      sweet.push({ day: tag, amount: amountNearKeyword(snackText || allText, ["schokolade", "schokoriegel", "nutella", "keks", "kuchen"], "g", 50), sourceId: makeSourceId("sweet_snack", tag) });
    }

    if (hasKeyword(snackText || allText, ["chips"])) {
      chips.push({ day: tag, amount: amountNearKeyword(snackText || allText, ["chips"], "g", 60), sourceId: makeSourceId("chips", tag) });
    }

    if (hasKeyword(snackText || allText, ["nüsse", "nuesse", "nuss", "mandeln", "cashew", "erdnüsse", "erdnuesse"])) {
      nuts.push({ day: tag, amount: amountNearKeyword(snackText || allText, ["nüsse", "nuesse", "nuss", "mandeln", "cashew", "erdnüsse", "erdnuesse"], "g", 30), sourceId: makeSourceId("nuts", tag) });
    }

    if (hasKeyword(allText, ["sahnesauce", "sahne sauce", "rahmsauce", "sahne"])) {
      creamSauce.push({ day: tag, amount: amountNearKeyword(allText, ["sahnesauce", "rahmsauce", "sahne"], "g", 150), sourceId: makeSourceId("cream_sauce", tag) });
    }

    if (hasKeyword(mealText || allText, ["butter"])) {
      butter.push({ day: tag, amount: amountNearKeyword(mealText || allText, ["butter"], "g", 15), sourceId: makeSourceId("butter", tag) });
    }

    if (hasKeyword(mealText || allText, ["wurst", "salami", "aufschnitt", "käse", "kaese"])) {
      breadTopping.push({ day: tag, amount: amountNearKeyword(mealText || allText, ["wurst", "salami", "aufschnitt", "käse", "kaese"], "g", 50), sourceId: makeSourceId("bread_topping", tag) });
    }

    if (hasKeyword(mealText || allText, ["brot", "toast", "brötchen", "broetchen"])) {
      breadAmount.push({ day: tag, amount: amountNearKeyword(mealText || allText, ["brot", "toast", "brötchen", "broetchen"], "g", 100), sourceId: makeSourceId("bread_amount", tag) });
    }

    if (hasKeyword(allText, ["pommes"])) {
      fries.push({ day: tag, amount: amountNearKeyword(allText, ["pommes"], "g", 150), sourceId: makeSourceId("fries", tag) });
    }

    if (hasKeyword(allText, ["döner", "doener"])) {
      doener.push({ day: tag, amount: amountNearKeyword(allText, ["döner", "doener"], "g", 450), sourceId: makeSourceId("doener", tag) });
    }

    if (hasKeyword(allText, ["burger"])) {
      burger.push({ day: tag, amount: amountNearKeyword(allText, ["burger"], "g", 250), sourceId: makeSourceId("burger", tag) });
    }

    if (hasKeyword(allText, ["pizza"])) {
      pizza.push({ day: tag, amount: amountNearKeyword(allText, ["pizza"], "g", 300), sourceId: makeSourceId("pizza", tag) });
    }

    if (hasKeyword(breakfastText, ["müsli", "muesli", "cornflakes", "haferflocken", "milch", "nutella", "marmelade"])) {
      breakfastProtein.push({ day: tag, sourceId: makeSourceId("breakfast_protein", tag) });
    }
  });

  if (cola.length) {
    const ml = sum(cola.map(item => item.amount));
    candidates.push(createCandidateV34({
      key: "drink_sugar",
      group: "drink_sugar",
      title: "Cola ersetzen",
      action: "Die Cola- oder Zuckergetränk-Mengen " + formatTagList(gatherOccurrenceDays(cola)) + " ersetzt du durch Wasser, ungesüßten Tee oder eine kalorienfreie Variante.",
      frequency: formatFrequency(gatherOccurrenceDays(cola)),
      focus: "Kalorien und Kohlenhydrate senken",
      why: "Flüssige Kalorien sättigen kaum und lassen sich leicht ersetzen.",
      type: "Ersetzen",
      days: gatherOccurrenceDays(cola),
      sourceIds: cola.map(item => item.sourceId),
      weeklyEffect: makeEffect(-ml * 0.42, 0, 0, -ml * 0.106),
      priority: 1
    }));
  }

  if (sweet.length) {
    const reduction = sum(sweet.map(item => Math.max(0, item.amount - 20)));
    if (reduction > 0) {
      candidates.push(createCandidateV34({
        key: "sweet_snack",
        group: "sweet_snack",
        title: "Süßes portionieren",
        action: "Die Schokolade-/Nutella-Mengen " + formatTagList(gatherOccurrenceDays(sweet)) + " reduzierst du jeweils auf ca. 20 g.",
        frequency: formatFrequency(gatherOccurrenceDays(sweet)),
        focus: "Kalorien senken",
        why: "Du behältst eine kleine Portion, reduzierst aber den größten Kalorien- und Zuckerhebel.",
        type: "Portionieren",
        days: gatherOccurrenceDays(sweet),
        sourceIds: sweet.map(item => item.sourceId),
        weeklyEffect: makeEffect(-reduction * 5.3, 0, -reduction * 0.30, -reduction * 0.55),
        priority: 10
      }));
    }
  }

  if (chips.length) {
    const reduction = sum(chips.map(item => Math.max(0, item.amount - 20)));
    if (reduction > 0) {
      candidates.push(createCandidateV34({
        key: "chips",
        group: "chips",
        title: "Chips portionieren",
        action: "Die Chips-Mengen " + formatTagList(gatherOccurrenceDays(chips)) + " reduzierst du jeweils auf ca. 20 g.",
        frequency: formatFrequency(gatherOccurrenceDays(chips)),
        focus: "Kalorien und Fett senken",
        why: "Eine kleinere Portion senkt Fett und Kalorien, ohne ein Verbot daraus zu machen.",
        type: "Portionieren",
        days: gatherOccurrenceDays(chips),
        sourceIds: chips.map(item => item.sourceId),
        weeklyEffect: makeEffect(-reduction * 5.4, 0, -reduction * 0.34, -reduction * 0.50),
        priority: 12
      }));
    }
  }

  if (breadTopping.length) {
    const count = gatherOccurrenceDays(breadTopping).length;
    candidates.push(createCandidateV34({
      key: "bread_topping",
      group: "bread_topping",
      title: "Brotbelag umbauen",
      action: "Die Wurst-/Käse-Beläge " + formatTagList(gatherOccurrenceDays(breadTopping)) + " ersetzt du durch Putenbrust, mageren Aufschnitt oder fettarmen Frischkäse.",
      frequency: formatFrequency(gatherOccurrenceDays(breadTopping)),
      focus: "Fett senken, Protein erhöhen",
      why: "Der Belag bleibt sättigend, aber Fett- und Kaloriendichte sinken.",
      type: "Ersetzen",
      days: gatherOccurrenceDays(breadTopping),
      sourceIds: breadTopping.map(item => item.sourceId),
      weeklyEffect: makeEffect(-90 * count, 8 * count, -10 * count, -2 * count),
      priority: 18
    }));
  }

  if (butter.length) {
    const reduction = sum(butter.map(item => Math.max(0, item.amount - 5)));
    if (reduction > 0) {
      candidates.push(createCandidateV34({
        key: "butter",
        group: "butter",
        title: "Butter dosieren",
        action: "Die Butterportionen " + formatTagList(gatherOccurrenceDays(butter)) + " reduzierst du jeweils auf ca. 5 g oder ersetzt sie durch fettarmen Frischkäse.",
        frequency: formatFrequency(gatherOccurrenceDays(butter)),
        focus: "Fett senken",
        why: "Butter ist sehr energiedicht; kleine Mengenänderungen wirken schnell.",
        type: "Portionieren",
        days: gatherOccurrenceDays(butter),
        sourceIds: butter.map(item => item.sourceId),
        weeklyEffect: makeEffect(-reduction * 7.2, 0, -reduction * 0.80, 0),
        priority: 20
      }));
    }
  }

  if (creamSauce.length) {
    const amount = sum(creamSauce.map(item => item.amount));
    candidates.push(createCandidateV34({
      key: "cream_sauce",
      group: "cream_sauce",
      title: "Sahnesauce ersetzen",
      action: "Die Sahnesauce " + formatTagList(gatherOccurrenceDays(creamSauce)) + " ersetzt du durch Tomatensauce, Gemüsebrühe oder eine leichte Joghurtsauce.",
      frequency: formatFrequency(gatherOccurrenceDays(creamSauce)),
      focus: "Fett und Kalorien senken",
      why: "Bei Saucen lässt sich Fett oft reduzieren, ohne die ganze Mahlzeit zu streichen.",
      type: "Ersetzen",
      days: gatherOccurrenceDays(creamSauce),
      sourceIds: creamSauce.map(item => item.sourceId),
      weeklyEffect: makeEffect(-amount * 1.25, 0, -amount * 0.12, 0),
      priority: 22
    }));
  }

  if (nuts.length) {
    const reduction = sum(nuts.map(item => Math.max(0, item.amount - 15)));
    if (reduction > 0) {
      candidates.push(createCandidateV34({
        key: "nuts",
        group: "nuts",
        title: "Nüsse portionieren",
        action: "Die Nussportionen " + formatTagList(gatherOccurrenceDays(nuts)) + " reduzierst du jeweils auf ca. 15 g.",
        frequency: formatFrequency(gatherOccurrenceDays(nuts)),
        focus: "Fett senken",
        why: "Nüsse können hochwertig sein, sind aber sehr portionssensibel.",
        type: "Portionieren",
        days: gatherOccurrenceDays(nuts),
        sourceIds: nuts.map(item => item.sourceId),
        weeklyEffect: makeEffect(-reduction * 6.0, 0, -reduction * 0.50, 0),
        priority: 25
      }));
    }
  }

  if (breadAmount.length) {
    const relevant = breadAmount.filter(item => item.amount >= 90).slice(0, 4);
    const reduction = sum(relevant.map(item => Math.min(40, Math.max(20, item.amount * 0.30))));
    if (reduction > 0) {
      candidates.push(createCandidateV34({
        key: "bread_amount",
        group: "bread_amount",
        title: "Brotmenge steuern",
        action: "Die größten Brot-/Toastportionen " + formatTagList(gatherOccurrenceDays(relevant)) + " reduzierst du um ca. ein Drittel.",
        frequency: formatFrequency(gatherOccurrenceDays(relevant)),
        focus: "Kalorien und Kohlenhydrate senken",
        why: "So bleibt Brot möglich, aber die Portionsgröße passt besser zum Ziel.",
        type: "Portionieren",
        days: gatherOccurrenceDays(relevant),
        sourceIds: relevant.map(item => item.sourceId),
        weeklyEffect: makeEffect(-reduction * 2.5, 0, -reduction * 0.02, -reduction * 0.48),
        priority: 45
      }));
    }
  }

  if (fries.length) {
    const amount = sum(fries.map(item => item.amount));
    candidates.push(createCandidateV34({
      key: "fries",
      group: "fast_food_side",
      title: "Pommes ersetzen",
      action: "Die Pommes " + formatTagList(gatherOccurrenceDays(fries)) + " ersetzt du durch Ofengemüse, Salat oder Kartoffeln aus dem Ofen mit wenig Öl.",
      frequency: formatFrequency(gatherOccurrenceDays(fries)),
      focus: "Kalorien und Fett senken",
      why: "Die Beilage bleibt sättigend, aber Fett- und Kaloriendichte sinken.",
      type: "Ersetzen",
      days: gatherOccurrenceDays(fries),
      sourceIds: fries.map(item => item.sourceId),
      weeklyEffect: makeEffect(-amount * 1.8, 0, -amount * 0.12, -amount * 0.20),
      priority: 35
    }));
  }

  if (doener.length) {
    const count = gatherOccurrenceDays(doener).length;
    candidates.push(createCandidateV34({
      key: "doener",
      group: "fast_food_main",
      title: "Döner leichter wählen",
      action: "Den Döner " + formatTagList(gatherOccurrenceDays(doener)) + " wählst du als leichtere Variante mit viel Fleisch und Salat, wenig Sauce und ohne Extra-Fettquelle.",
      frequency: formatFrequency(gatherOccurrenceDays(doener)),
      focus: "Kalorien und Fett senken",
      why: "Du veränderst die energiedichtesten Bestandteile, ohne das ganze Gericht verbieten zu müssen.",
      type: "Umbauen",
      days: gatherOccurrenceDays(doener),
      sourceIds: doener.map(item => item.sourceId),
      weeklyEffect: makeEffect(-250 * count, 8 * count, -14 * count, -18 * count),
      priority: 38
    }));
  }

  if (burger.length) {
    const count = gatherOccurrenceDays(burger).length;
    candidates.push(createCandidateV34({
      key: "burger",
      group: "fast_food_main",
      title: "Burger leichter wählen",
      action: "Den Burger " + formatTagList(gatherOccurrenceDays(burger)) + " reduzierst du auf eine kleinere Variante oder kombinierst ihn ohne zusätzliche Fettbeilage.",
      frequency: formatFrequency(gatherOccurrenceDays(burger)),
      focus: "Kalorien und Fett senken",
      why: "Fast-Food-Mahlzeiten werden über Größe und Beilage steuerbar.",
      type: "Umbauen",
      days: gatherOccurrenceDays(burger),
      sourceIds: burger.map(item => item.sourceId),
      weeklyEffect: makeEffect(-180 * count, 0, -10 * count, -15 * count),
      priority: 40
    }));
  }

  if (pizza.length) {
    const count = gatherOccurrenceDays(pizza).length;
    candidates.push(createCandidateV34({
      key: "pizza",
      group: "fast_food_main",
      title: "Pizza leichter wählen",
      action: "Die Pizza " + formatTagList(gatherOccurrenceDays(pizza)) + " wählst du kleiner oder mit proteinreicherem Belag und weniger Extra-Käse.",
      frequency: formatFrequency(gatherOccurrenceDays(pizza)),
      focus: "Kalorien und Fett senken",
      why: "Größe und Käsemenge bestimmen den größten Teil der Wirkung.",
      type: "Umbauen",
      days: gatherOccurrenceDays(pizza),
      sourceIds: pizza.map(item => item.sourceId),
      weeklyEffect: makeEffect(-220 * count, 8 * count, -12 * count, -20 * count),
      priority: 42
    }));
  }

  if (breakfastProtein.length) {
    const relevant = gatherOccurrenceDays(breakfastProtein).slice(0, 5);
    candidates.push(createCandidateV34({
      key: "breakfast_protein",
      group: "protein_breakfast",
      title: "Frühstück proteinreicher",
      action: "Das Frühstück " + formatTagList(relevant) + " ergänzt du mit 150 g Skyr, Joghurt oder Magerquark und ersetzt dafür einen Teil von Milch, Müsli oder süßem Anteil.",
      frequency: formatFrequency(relevant),
      focus: "Protein erhöhen",
      why: "So steigt Protein, ohne das Frühstück einfach größer zu machen.",
      type: "Ersetzen",
      days: relevant,
      sourceIds: relevant.map(day => makeSourceId("breakfast_protein", day)),
      weeklyEffect: makeEffect(-10 * relevant.length, 15 * relevant.length, -2 * relevant.length, -5 * relevant.length),
      priority: 28
    }));
  }

  const existingGroups = new Set(candidates.map(candidate => candidate.group));
  candidates.push(...aggregateFallbackCandidate(report, existingGroups));

  return candidates
    .filter(candidate => hasAnyEffect(candidate.weeklyEffect))
    .sort((a, b) => a.priority - b.priority);
}

function normalizedMetricPenalty(value, target, metric) {
  const t = Number(target?.[metric]) || 0;
  if (!t) return 0;
  const corridor = targetCorridor(t, metric);
  if (inCorridor(value, corridor)) return 0;

  let diff = 0;
  if (value < corridor.min) diff = corridor.min - value;
  if (value > corridor.max) diff = value - corridor.max;

  const weights = {
    kcal: 1.25,
    protein: 1.45,
    fett: 1.35,
    kohlenhydrate: 0.45
  };

  const scale = Math.max(5, Math.abs(t));
  return Math.pow(diff / scale, 2) * (weights[metric] || 1);
}

function planDistance(effect, target) {
  return ["kcal", "protein", "fett", "kohlenhydrate"].reduce((total, metric) => {
    return total + normalizedMetricPenalty(Number(effect?.[metric]) || 0, target, metric);
  }, 0);
}

function addEffectsDaily(a, b) {
  return makeEffect(
    (Number(a?.kcal) || 0) + (Number(b?.kcal) || 0),
    (Number(a?.protein) || 0) + (Number(b?.protein) || 0),
    (Number(a?.fett) || 0) + (Number(b?.fett) || 0),
    (Number(a?.kohlenhydrate) || 0) + (Number(b?.kohlenhydrate) || 0)
  );
}

function inCoreTargetCorridor(cumulative, target) {
  const kcalOk = !target.kcal || inCorridor(cumulative.kcal, targetCorridor(target.kcal, "kcal"));
  const proteinOk = !target.protein || inCorridor(cumulative.protein, targetCorridor(target.protein, "protein"));
  const fatOk = !target.fett || inCorridor(cumulative.fett, targetCorridor(target.fett, "fett"));
  return kcalOk && proteinOk && fatOk;
}

function conflictsWithUsed(candidate, usedSources, usedGroups) {
  const sourceConflict = (candidate.sourceIds || []).some(source => usedSources.has(source));
  if (sourceConflict) return true;

  // Fast-Food-Hauptmahlzeiten und Getränke/Snacks dürfen je Gruppe nur einmal als rechnerischer Haupthebel zählen.
  const singleUseGroups = new Set([
    "drink_sugar",
    "sweet_snack",
    "chips",
    "nuts",
    "cream_sauce",
    "butter",
    "bread_topping",
    "bread_amount",
    "protein_fix",
    "fat_fix",
    "kcal_fix",
    "fast_food_main",
    "fast_food_side",
    "protein_breakfast"
  ]);

  return singleUseGroups.has(candidate.group) && usedGroups.has(candidate.group);
}

function candidateCreatesSevereOvershoot(candidate, cumulative, target) {
  if (!candidate?.countsAsEffect) return false;
  const next = addEffectsDaily(cumulative, candidate.dailyEffect);

  return ["kcal", "protein", "fett"].some(metric => {
    const t = Number(target?.[metric]) || 0;
    const e = Number(candidate.dailyEffect?.[metric]) || 0;
    if (!t || !e || Math.sign(e) !== Math.sign(t)) return false;

    const corridor = targetCorridor(t, metric);
    const current = Number(cumulative?.[metric]) || 0;
    const value = Number(next?.[metric]) || 0;

    // Wenn die Kennzahl schon passt, darf ein neuer Bilanzschritt sie nicht stark wieder herausziehen.
    if (inCorridor(current, corridor)) {
      const tolerance = metric === "kcal" ? 90 : metric === "protein" ? 12 : 8;
      return t < 0 ? value < corridor.min - tolerance : value > corridor.max + tolerance;
    }

    // Solange die Kennzahl noch offen ist, blockieren wir nur wirklich grobe Überkorrekturen.
    const tolerance = metric === "kcal" ? 180 : metric === "protein" ? 20 : 14;
    return t < 0 ? value < corridor.min - tolerance : value > corridor.max + tolerance;
  });
}

function candidateScore(candidate, cumulative, target) {
  if (!candidate?.countsAsEffect) return 0;
  const before = planDistance(cumulative, target);
  const next = addEffectsDaily(cumulative, candidate.dailyEffect);
  const after = planDistance(next, target);
  let score = before - after;

  // Sichtbare, einfache Hebel leicht priorisieren, ohne die Bilanz zu zerstören.
  const priorityBoost = Math.max(0, (80 - (Number(candidate.priority) || 50)) / 1000);
  score += priorityBoost;

  return score;
}

function markCandidateUsed(candidate, usedSources, usedGroups) {
  (candidate.sourceIds || []).forEach(source => usedSources.add(source));
  if (candidate.group) usedGroups.add(candidate.group);
}

function chooseBestCandidate(candidates, selected, cumulative, target, usedSources, usedGroups) {
  let best = null;
  let bestScore = 0;

  candidates.forEach(candidate => {
    if (!candidate || selected.includes(candidate)) return;
    if (conflictsWithUsed(candidate, usedSources, usedGroups)) return;
    if (candidateCreatesSevereOvershoot(candidate, cumulative, target)) return;

    const score = candidateScore(candidate, cumulative, target);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return bestScore > 0.001 ? best : null;
}

function gapToCorridorValue(value, corridor) {
  const number = Number(value) || 0;
  if (number < corridor.min) return corridor.min - number;
  if (number > corridor.max) return number - corridor.max;
  return 0;
}

function coreMetricImprovementScore(candidate, cumulative, target) {
  if (!candidate?.countsAsEffect) return 0;
  const next = addEffectsDaily(cumulative, candidate.dailyEffect);
  const weights = { kcal: 1.35, protein: 1.25, fett: 1.45 };

  return ["kcal", "protein", "fett"].reduce((total, metric) => {
    const t = Number(target?.[metric]) || 0;
    if (!t) return total;
    const corridor = targetCorridor(t, metric);
    const beforeGap = gapToCorridorValue(Number(cumulative?.[metric]) || 0, corridor);
    if (beforeGap <= 0) return total;
    const afterGap = gapToCorridorValue(Number(next?.[metric]) || 0, corridor);
    const improvement = beforeGap - afterGap;
    const scale = Math.max(5, Math.abs(t));
    return total + (improvement / scale) * (weights[metric] || 1);
  }, 0);
}

function candidateCreatesUnacceptableCoreOvershoot(candidate, cumulative, target) {
  if (!candidate?.countsAsEffect) return false;
  const next = addEffectsDaily(cumulative, candidate.dailyEffect);

  return ["kcal", "protein", "fett"].some(metric => {
    const t = Number(target?.[metric]) || 0;
    const value = Number(next?.[metric]) || 0;
    if (!t) return false;

    if (t < 0) {
      const hardFloor = t * (metric === "kcal" ? 1.55 : 1.65);
      return value < hardFloor;
    }

    const hardCeiling = t * (metric === "protein" ? 1.9 : 1.55);
    return value > hardCeiling;
  });
}

function chooseBestCoreCandidate(candidates, selected, cumulative, target, usedSources, usedGroups) {
  let best = null;
  let bestScore = 0;

  candidates.forEach(candidate => {
    if (!candidate || selected.includes(candidate)) return;
    if (conflictsWithUsed(candidate, usedSources, usedGroups)) return;
    if (candidateCreatesUnacceptableCoreOvershoot(candidate, cumulative, target)) return;

    const score = coreMetricImprovementScore(candidate, cumulative, target);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return bestScore > 0.005 ? best : null;
}

function dayPoolFromCandidates(candidates) {
  const days = [];
  candidates.forEach(candidate => {
    if (Array.isArray(candidate.days)) days.push(...candidate.days);
  });
  const unique = uniqueNumbers(days);
  return unique.length ? unique : [1, 2, 3, 4, 5, 6, 7];
}


function buildConcreteProteinCandidatesV39(baseCandidates, target) {
  const proteinTarget = Math.max(0, Number(target?.protein) || 0);
  if (proteinTarget <= 0) return [];

  const proteinCandidates = [];
  const hasConcreteBreakfastProteinBase = (baseCandidates || []).some(item => {
    const group = String(item?.group || "").toLowerCase();
    return group === "protein_breakfast" || group === "muesli_cereal";
  });
  const addProteinCandidate = (base, index, config) => {
    const sourceIds = Array.from(new Set(base?.sourceIds || []));
    const days = uniqueNumbers(base?.days || sourceIds.map(extractDayFromSourceIdV38).filter(Boolean));
    if (!sourceIds.length || !days.length) return;

    const frequencyLabel = formatFrequency(days);
    proteinCandidates.push(createCandidateV34({
      key: config.key + "_" + index,
      group: config.group,
      title: config.title,
      action: config.action(days),
      frequency: frequencyLabel,
      focus: config.focus,
      why: config.why,
      type: "Ersetzen",
      days,
      sourceIds,
      weeklyEffect: makeEffect(
        config.effect.kcal * days.length,
        config.effect.protein * days.length,
        config.effect.fett * days.length,
        config.effect.kohlenhydrate * days.length
      ),
      priority: config.priority
    }));
  };

  (baseCandidates || []).forEach((base, index) => {
    const group = String(base?.group || "").toLowerCase();

    if (group === "sweet_snack") {
      addProteinCandidate(base, index, {
        key: "protein_sweet_snack",
        group: "protein_snack",
        title: "Süßen Snack ersetzen",
        action: days => "Den süßen Snack " + formatTagList(days) + " ersetzt du durch 150 g Skyr, Magerquark oder Joghurt natur.",
        focus: "Protein erhöhen, Kalorien senken",
        why: "Das schließt Protein über einen konkreten Snack-Umbau und zählt nicht doppelt mit der Snack-Portionierung.",
        effect: { kcal: -70, protein: 18, fett: -5, kohlenhydrate: -16 },
        priority: 27
      });
    }

    if (group === "chips") {
      addProteinCandidate(base, index, {
        key: "protein_chips_snack",
        group: "protein_snack",
        title: "Chips-Snack ersetzen",
        action: days => "Den Chips-Snack " + formatTagList(days) + " ersetzt du durch 150 g Skyr, Magerquark, Hüttenkäse oder eine magere Proteinportion.",
        focus: "Protein erhöhen, Fett senken",
        why: "Der Snack wird nicht nur kleiner, sondern durch eine sättigendere Proteinoption ersetzt.",
        effect: { kcal: -90, protein: 18, fett: -8, kohlenhydrate: -8 },
        priority: 29
      });
    }

    if (group === "bread_topping") {
      addProteinCandidate(base, index, {
        key: "protein_bread_topping",
        group: "protein_belag",
        title: "Belag proteinreicher wählen",
        action: days => "Bei der Brotmahlzeit " + formatTagList(days) + " ersetzt du Wurst/Käse gezielt durch Putenbrust, mageren Aufschnitt oder körnigen Frischkäse.",
        focus: "Protein erhöhen, Fett senken",
        why: "Das ist derselbe konkrete Brotbelag-Hebel, aber stärker auf Protein statt nur Fett ausgerichtet.",
        effect: { kcal: -55, protein: 12, fett: -7, kohlenhydrate: -1 },
        priority: 19
      });
    }

    if (group === "bread_amount" && !hasConcreteBreakfastProteinBase) {
      addProteinCandidate(base, index, {
        key: "protein_bread_amount",
        group: "protein_fruehstueck",
        title: "Brotanteil durch Protein ersetzen",
        action: days => "Bei der großen Brot-/Toastportion " + formatTagList(days) + " ersetzt du einen Teil des Brots durch 150 g Skyr, Magerquark oder eine magere Proteinportion.",
        focus: "Protein erhöhen, Kohlenhydrate steuern",
        why: "Der Schritt erhöht Protein, ohne die Mahlzeit einfach größer zu machen.",
        effect: { kcal: -35, protein: 17, fett: -1, kohlenhydrate: -18 },
        priority: 31
      });
    }
  });

  return proteinCandidates;
}

function makeConcreteProteinCandidate(remainingDailyProtein, selected, allCandidates, target, cumulative) {
  // v39: Kein generischer Protein-Fallback mehr; Fettlücke wird vor KH-Reduktion priorisiert. Protein muss aus konkreten, benannten Umbauten entstehen.
  return null;
}

function makeConcreteFatCandidate(remainingDailyFat, selected, allCandidates, target, cumulative) {
  // v36: Keine erfundenen generischen Fett-Schritte mehr.
  // Wenn kein konkretes Vorkommen wie Butter, Käse, Sauce oder Nüsse erkannt wurde,
  // darf die App keinen Pseudo-Bilanzschritt erzeugen.
  return null;
}

function makeConcreteKcalCandidate(remainingDailyKcal, selected, allCandidates, target, cumulative) {
  // v36: Keine unkonkreten Restkalorien-Schritte mehr.
  // Restkalorien werden nur über echte Kandidaten aus der Woche verändert.
  return null;
}

function makeStabilityCandidate(index, selected, candidates) {
  const usedKeys = new Set(selected.map(item => item.key));
  const candidateGroups = new Set((candidates || []).map(item => item.group));
  const days = dayPoolFromCandidates(selected.length ? selected : candidates).slice(0, 4);
  const dayText = formatTagList(days);

  const templates = [
    {
      key: "stable_drinks_prepare",
      title: "Getränke sichern",
      action: "Stelle Wasser, ungesüßten Tee oder eine kalorienfreie Variante sichtbar bereit, damit der Getränkeschritt automatisch wird.",
      frequency: "täglich vorbereiten",
      focus: "Kalorien stabilisieren",
      why: "Dieser Schritt zählt nicht zusätzlich zur Rechnung, sondern sichert den bereits geplanten Getränkeaustausch.",
      requires: "drink_sugar"
    },
    {
      key: "stable_bread_topping",
      title: "Belagstandard sichern",
      action: "Nutze bei Brotmahlzeiten weiterhin die im Plan gewählte magere Belagvariante als Standard.",
      frequency: "bei Brotmahlzeiten",
      focus: "Fett stabilisieren",
      why: "Dieser Schritt verhindert, dass der alte Fettüberschuss über den Belag zurückkommt.",
      requires: "bread_topping"
    },
    {
      key: "stable_snack_portions",
      title: "Snackportion sichern",
      action: "Halte dich an die konkret geplante Snackportion aus dem Fahrplan und ändere sie nicht zusätzlich.",
      frequency: "vor Snackmomenten",
      focus: "Portionen halten",
      why: "Dieser Schritt sichert die neue Portionsgröße und zählt nicht erneut als Kalorienreduktion.",
      requires: null
    },
    {
      key: "stable_protein_use",
      title: "Proteinportion nutzen",
      action: "Nutze die Proteinportionen aus dem Plan genau an den geplanten Tagen und nicht zusätzlich obendrauf.",
      frequency: "an den geplanten Tagen",
      focus: "Protein halten",
      why: "Das sichert den Proteinumbau, ohne die Kalorienbilanz erneut zu verändern.",
      requires: null
    },
    {
      key: "stable_volume",
      title: "Sättigung sichern",
      action: "Ergänze " + dayText + " eine Portion Gemüse oder Salat zu Mittag- oder Abendessen.",
      frequency: formatFrequency(days),
      focus: "Sättigung halten",
      why: "Mehr Volumen hilft, den neuen Durchschnittstag leichter einzuhalten.",
      requires: null
    },
    {
      key: "stable_sauce_rule",
      title: "Sauce sichern",
      action: "Wähle bei Saucen zuerst Tomatensauce, Gemüsebrühe oder eine leichte Joghurtvariante.",
      frequency: "bei Saucen",
      focus: "Fett stabilisieren",
      why: "Dieser Schritt hält den Saucenumbau reproduzierbar.",
      requires: "cream_sauce"
    },
    {
      key: "stable_nuts_rule",
      title: "Nussportion sichern",
      action: "Portioniere Nüsse direkt auf die geplante Menge und iss nicht aus der Packung.",
      frequency: "bei Nüssen",
      focus: "Fett stabilisieren",
      why: "Nüsse bleiben möglich, aber die Portion bleibt kontrolliert.",
      requires: "nuts"
    },
    {
      key: "stable_fast_food_rule",
      title: "Auswärtsregel sichern",
      action: "Wähle bei Döner, Burger oder Pizza zuerst die im Plan definierte leichtere Variante.",
      frequency: "bei Auswärtsessen",
      focus: "Kalorien stabilisieren",
      why: "So bleibt die neue Wochenstruktur auch außerhalb von Zuhause steuerbar.",
      requires: "fast_food_main"
    },
    {
      key: "stable_week_review",
      title: "Woche prüfen",
      action: "Prüfe am Ende der Woche, welche zwei Schritte am leichtesten waren und welche du in der nächsten Woche beibehältst.",
      frequency: "1x/Woche",
      focus: "Struktur halten",
      why: "Der Plan soll reproduzierbar werden, nicht nur einmal funktionieren.",
      requires: null
    },
    {
      key: "stable_shopping_list",
      title: "Einkauf sichern",
      action: "Kaufe nur die Lebensmittel nach, die zu den bereits geplanten Umbauschritten gehören.",
      frequency: "1x/Woche",
      focus: "Umsetzung sichern",
      why: "Einkauf zählt nicht als Makro-Korrektur, macht die geplanten Schritte aber alltagstauglich.",
      requires: null
    }
  ];

  const template = templates.find(template => {
    if (usedKeys.has(template.key)) return false;
    if (template.requires && !candidateGroups.has(template.requires)) return false;
    return true;
  });

  if (!template) return null;

  return createCandidateV34({
    key: template.key,
    group: template.key,
    title: template.title,
    action: template.action,
    frequency: template.frequency,
    focus: template.focus,
    why: template.why,
    type: "Absichern",
    days: [],
    sourceIds: [template.key],
    weeklyEffect: makeEffect(0, 0, 0, 0),
    priority: 100 + index,
    countsAsEffect: false
  });
}

function openMetricAmount(cumulative, target, metric) {
  const t = Number(target?.[metric]) || 0;
  if (!t) return 0;
  const corridor = targetCorridor(t, metric);
  const c = Number(cumulative?.[metric]) || 0;
  if (t > 0 && c < corridor.min) return corridor.min - c;
  if (t < 0 && c > corridor.max) return corridor.max - c;
  return 0;
}

function hasRemainingRealCandidate(candidates, selected, cumulative, target, usedSources, usedGroups) {
  return Boolean(chooseBestCandidate(candidates, selected, cumulative, target, usedSources, usedGroups));
}

function selectRuleBasedCandidates(candidates, target) {
  const selected = [];
  const usedSources = new Set();
  const usedGroups = new Set();
  let cumulative = makeEffect(0, 0, 0, 0);

  const addSelected = (candidate, options = {}) => {
    if (!candidate || selected.length >= 10) return false;
    if (conflictsWithUsed(candidate, usedSources, usedGroups)) return false;
    if (!options.forceCore && candidate.countsAsEffect !== false && candidateCreatesSevereOvershoot(candidate, cumulative, target)) return false;
    if (options.forceCore && candidate.countsAsEffect !== false && candidateCreatesUnacceptableCoreOvershoot(candidate, cumulative, target)) return false;
    selected.push(candidate);
    markCandidateUsed(candidate, usedSources, usedGroups);
    cumulative = addEffectsDaily(cumulative, candidate.dailyEffect);
    return true;
  };

  // v37_bilanz_vor_sicherung: Erst konkrete Bilanzschritte, dann erst Sicherung.
  // 1) Flüssigkalorien sind ein früher Hebel, wenn sie die Lücke verkleinern.
  const drink = candidates.find(candidate => candidate.group === "drink_sugar");
  if (drink && candidateScore(drink, cumulative, target) > 0.005) {
    addSelected(drink);
  }

  // 2) Normale Solver-Auswahl: nimmt Kandidaten, die die Gesamtbilanz verbessern.
  let guard = 0;
  while (selected.length < 10 && guard < 40) {
    guard += 1;
    const best = chooseBestCandidate(candidates, selected, cumulative, target, usedSources, usedGroups);
    if (!best) break;
    if (!addSelected(best)) break;
    if (inCoreTargetCorridor(cumulative, target)) break;
  }

  // 3) Protein bleibt Pflicht: offene Proteinlücke wird durch echten Essensumbau geschlossen.
  if (selected.length < 10 && !inCorridor(cumulative.protein, targetCorridor(target.protein, "protein"))) {
    const proteinNeed = openMetricAmount(cumulative, target, "protein");
    if (proteinNeed > 1) {
      const proteinFix = makeConcreteProteinCandidate(proteinNeed, selected, candidates, target, cumulative);
      addSelected(proteinFix, { forceCore: true });
    }
  }

  // 4) Harte Akzeptanzregel: Solange Kalorien/Protein/Fett nicht im Korridor sind,
  // darf die App keine Sicherungsschritte als Ersatz nehmen. Sie versucht weitere
  // konkrete Kandidaten, die wenigstens eine offene Kernkennzahl kleiner machen.
  guard = 0;
  while (selected.length < 10 && !inCoreTargetCorridor(cumulative, target) && guard < 20) {
    guard += 1;
    const coreBest = chooseBestCoreCandidate(candidates, selected, cumulative, target, usedSources, usedGroups);
    if (!coreBest) break;
    if (!addSelected(coreBest, { forceCore: true })) break;
  }

  // 5) Erst wenn die Kernbilanz passt ODER keine konkreten Bilanzkandidaten mehr vorhanden sind,
  // wird mit Sicherung aufgefüllt. Sicherung zählt mit Null-Wirkung und wird nicht doppelt gerechnet.
  while (selected.length < 10) {
    const stable = makeStabilityCandidate(selected.length, selected, candidates);
    if (!stable) break;
    if (!addSelected(stable)) break;
  }

  return selected.slice(0, 10);
}

function candidateToPotential(candidate) {
  const weekly = candidate?.weeklyEffect || makeEffect(0, 0, 0, 0);
  const kcal = Math.abs(Math.round(Number(weekly.kcal) || 0));
  const title = cleanSentencePart(candidate?.title || "Hebel");
  const focus = cleanSentencePart(candidate?.focus || "Zielhebel");
  const role = focus.toLowerCase().includes("protein") ? "Proteinhebel" :
    focus.toLowerCase().includes("fett") ? "Fett-/Kalorienhebel" :
    focus.toLowerCase().includes("kohlenhydrate") ? "Flüssigkalorien" :
    "Kalorienhebel";

  return {
    lebensmittel: title,
    rolle: role,
    kcal: kcal,
    anteil: kcal >= 400 ? "hoch" : kcal >= 180 ? "moderat" : "ergänzend",
    grund: cleanSentencePart(candidate?.why || "Dieser Schritt ist Teil des berechneten Wochenumbaus.")
  };
}


// v45_release_candidate_quality_gate: robuste JSON-Extraktion, ein Retry bei ungültiger KI-JSON-Antwort und Schutz gegen versehentliche Code-/Riesentext-Eingaben.
// v45_release_candidate_quality_gate: 10 kumulative Umbauten, breitere Bibliothek, aber ohne doppelte Frühstücks-/Protein- und unkonkrete Dressing-Schritte.
// v41_breitere_umbau_bibliothek: 10 echte, kumulative Umbauten. Jeder Schritt wird 3x bestätigt, bleibt danach aktiv, keine Sicherungs-/Füllschritte.
function extractDayFromSourceIdV38(sourceId) {
  const match = String(sourceId || "").match(/tag(\d+)/i);
  return match ? Number(match[1]) || 0 : 0;
}

function scaleEffectV38(effect, ratio) {
  return makeEffect(
    (Number(effect?.kcal) || 0) * ratio,
    (Number(effect?.protein) || 0) * ratio,
    (Number(effect?.fett) || 0) * ratio,
    (Number(effect?.kohlenhydrate) || 0) * ratio
  );
}

function shortDayLabelV38(days) {
  const list = uniqueNumbers(days);
  if (!list.length) return "";
  if (list.length === 1) return "Tag " + list[0];
  if (list.length === 2) return "Tag " + list[0] + "/" + list[1];
  return "Tag " + list.join("/");
}

function titleForCumulativeCandidateV38(base, days, index, total) {
  const label = shortDayLabelV38(days);
  const baseTitle = cleanSentencePart(base?.title || "Umbau");
  const group = String(base?.group || base?.key || "").toLowerCase();
  if (group.includes("drink_sugar") && total > 1) return "Cola schrittweise ersetzen";
  if (!label || total <= 1) return baseTitle;
  return baseTitle + " · " + label;
}

function actionForCumulativeCandidateV38(base, days) {
  const group = String(base?.group || base?.key || "").toLowerCase();
  const dayText = formatTagList(days);

  if (group.includes("drink_sugar")) {
    return "Die konkrete Cola-/Zuckergetränk-Portion " + dayText + " ersetzt du ab jetzt durch Wasser, ungesüßten Tee oder eine kalorienfreie Variante.";
  }

  if (group.includes("sweet_snack")) {
    return "Das Süßigkeiten-/Nutella-Muster " + dayText + " begrenzt du ab jetzt auf ca. 20 g oder ersetzt den süßen Anteil durch eine proteinreichere Alternative.";
  }

  if (group.includes("chips")) {
    return "Das Chips-Muster " + dayText + " begrenzt du ab jetzt auf ca. 20 g oder ersetzt es durch eine kalorienärmere Knabber-/Gemüsevariante.";
  }

  if (group.includes("nuts")) {
    return "Das Nuss-Muster " + dayText + " begrenzt du ab jetzt auf ca. 15 g.";
  }

  if (group.includes("bread_topping")) {
    return "Die Brotmahlzeit " + dayText + " baust du ab jetzt mit Putenbrust, magerem Aufschnitt oder fettarmem Frischkäse statt Wurst/Käse.";
  }

  if (group.includes("bread_amount")) {
    return "Die größte Brot-/Toastportion " + dayText + " reduzierst du ab jetzt um ca. ein Drittel.";
  }

  if (group.includes("butter")) {
    return "Die Butterportion " + dayText + " reduzierst du ab jetzt auf ca. 5 g oder ersetzt sie durch fettarmen Frischkäse.";
  }

  if (group.includes("cream_sauce")) {
    return "Die Sahnesauce " + dayText + " ersetzt du ab jetzt durch Tomatensauce, Gemüsebrühe oder eine leichte Joghurtsauce.";
  }

  if (group.includes("fast_food_side") || group.includes("fries")) {
    return "Die Pommes-Beilage " + dayText + " ersetzt du ab jetzt durch Ofengemüse, Salat oder Kartoffeln aus dem Ofen mit wenig Öl.";
  }

  if (group.includes("fast_food_main") && String(base?.key || "").includes("doener")) {
    return "Den Döner " + dayText + " wählst du ab jetzt als leichtere Variante mit viel Fleisch und Salat, wenig Sauce und ohne Extra-Fettquelle.";
  }

  if (group.includes("fast_food_main") && String(base?.key || "").includes("burger")) {
    return "Den Burger " + dayText + " wählst du ab jetzt kleiner oder ohne zusätzliche Fettbeilage.";
  }

  if (group.includes("fast_food_main") && String(base?.key || "").includes("pizza")) {
    return "Die Pizza " + dayText + " wählst du ab jetzt kleiner oder mit proteinreicherem Belag und weniger Extra-Käse.";
  }

  if (group.includes("protein_breakfast")) {
    return "Das Frühstücksmuster " + dayText + " machst du ab jetzt proteinreicher: 150 g Skyr, Joghurt oder Magerquark und dafür weniger Milch, Müsli oder süßer Anteil.";
  }

  if (group.includes("protein_snack")) {
    return "Den konkreten Snack " + dayText + " ersetzt du ab jetzt durch 150 g Skyr, Magerquark, Joghurt natur oder eine magere Proteinportion.";
  }

  if (group.includes("protein_belag")) {
    return "Die konkrete Brotmahlzeit " + dayText + " baust du ab jetzt proteinreicher: Putenbrust, magerer Aufschnitt oder körniger/fettarmer Frischkäse statt Wurst/Käse.";
  }

  if (group.includes("protein_fruehstueck")) {
    return "Bei der konkreten Brot-/Frühstücksportion " + dayText + " ersetzt du einen Teil des Brots, Müslis oder süßen Anteils durch 150 g Skyr oder Magerquark.";
  }

  if (group.includes("protein_fix")) {
    return "Das Muster " + dayText + " ersetzt du ab jetzt durch eine klare Proteinportion: 150 g Skyr, Magerquark, Putenbrust, Thunfisch, Eier oder mageres Fleisch – nicht zusätzlich obendrauf.";
  }

  return cleanSentencePart(base?.action || "Diesen Ernährungsbaustein setzt du ab jetzt als festen Umbau um.");
}

function splitCandidateIntoCumulativeStepsV38(candidate) {
  if (!candidate || candidate.countsAsEffect === false || !hasAnyEffect(candidate.weeklyEffect)) return [];

  const sources = Array.from(new Set(candidate.sourceIds || [candidate.key]));
  const days = uniqueNumbers(candidate.days || []);
  const group = String(candidate.group || candidate.key || "").toLowerCase();

  if (sources.length <= 1) {
    return [createCandidateV34({
      key: String(candidate.key || "candidate") + "_v38_0",
      group: candidate.group,
      title: cleanSentencePart(candidate.title),
      action: cleanSentencePart(candidate.action),
      frequency: cleanSentencePart(candidate.frequency),
      focus: cleanSentencePart(candidate.focus),
      why: cleanSentencePart(candidate.why),
      type: "30-Tage-Aufbau",
      days: days,
      sourceIds: sources,
      weeklyEffect: candidate.weeklyEffect,
      priority: Number(candidate.priority) || 50,
      countsAsEffect: true
    })];
  }

  // v44: Flüssigkalorien dürfen nicht als "nur Tag 1 ist schlecht" erscheinen.
  // Wenn der komplette Cola-Umbau rechnerisch zu stark wäre, erzeugen wir eine
  // aggregierte Startstufe über das wiederkehrende Muster, nicht einen einzelnen Tag-X-Schritt.
  if (group.includes("drink_sugar")) {
    const ratio = 1 / sources.length;
    return [createCandidateV34({
      key: String(candidate.key || "candidate") + "_v38_startstufe",
      group: candidate.group,
      title: "Cola schrittweise ersetzen",
      action: "Die wiederkehrenden Cola-/Zuckergetränk-Portionen aus deiner Woche reduzierst du schrittweise: Starte mit der nächsten konkreten Cola-Portion und ersetze sie durch Wasser, ungesüßten Tee oder eine kalorienfreie Variante. Nach 3 erfolgreichen Bestätigungen gilt diese Stufe als stabil.",
      frequency: "Startstufe: 3 erfolgreiche Cola-Ersatz-Bestätigungen",
      focus: cleanSentencePart(candidate.focus || "Kalorien und Kohlenhydrate senken"),
      why: cleanSentencePart(candidate.why || "Flüssige Kalorien sättigen kaum und lassen sich leicht ersetzen."),
      type: "30-Tage-Aufbau",
      days: days,
      sourceIds: sources,
      weeklyEffect: scaleEffectV38(candidate.weeklyEffect, ratio),
      priority: Math.max(1, (Number(candidate.priority) || 50) - 1),
      countsAsEffect: true
    })];
  }

  return sources.map((source, index) => {
    const day = days[index] || extractDayFromSourceIdV38(source) || days[0] || index + 1;
    const sourceDays = uniqueNumbers([day]);
    const ratio = 1 / sources.length;
    return createCandidateV34({
      key: String(candidate.key || "candidate") + "_v38_" + index,
      group: candidate.group,
      title: titleForCumulativeCandidateV38(candidate, sourceDays, index, sources.length),
      action: actionForCumulativeCandidateV38(candidate, sourceDays),
      frequency: "immer, wenn dieses Muster wieder vorkommt",
      focus: cleanSentencePart(candidate.focus),
      why: cleanSentencePart(candidate.why),
      type: "30-Tage-Aufbau",
      days: sourceDays,
      sourceIds: [source],
      weeklyEffect: scaleEffectV38(candidate.weeklyEffect, ratio),
      priority: (Number(candidate.priority) || 50) + index / 10,
      countsAsEffect: true
    });
  });
}

function normalizedTitleV38(candidate) {
  return lowerPlain(String(candidate?.title || "").replace(/\s*·\s*Tag.*$/i, "").trim());
}

function filterReportedDuplicatesV38(candidates) {
  const concreteTitles = new Set(
    (candidates || [])
      .filter(candidate => !String(candidate?.key || "").includes("_reported"))
      .map(candidate => normalizedTitleV38(candidate))
      .filter(Boolean)
  );

  return (candidates || []).filter(candidate => {
    const key = String(candidate?.key || "");
    if (!key.includes("_reported")) return true;
    return !concreteTitles.has(normalizedTitleV38(candidate));
  });
}


function candidateHygieneKeyV42(candidate) {
  const group = String(candidate?.group || candidate?.key || "").toLowerCase();
  const days = uniqueNumbers(candidate?.days || []);
  const dayKey = days.length ? days.join("_") : "all";

  if (group.includes("protein_breakfast") || group.includes("protein_fruehstueck") || group.includes("muesli_cereal")) {
    return "protein_breakfast::" + dayKey;
  }
  if (group.includes("protein_snack") || group.includes("sweet_snack") || group.includes("chips")) {
    return "snack::" + dayKey;
  }
  if (group.includes("mayo_dressing") && !String(candidate?.key || "").includes("_reported")) {
    return "dressing::" + dayKey;
  }
  return "";
}

function filterCandidateHygieneV42(candidates) {
  const seen = new Set();
  return (candidates || []).filter(candidate => {
    const group = String(candidate?.group || "").toLowerCase();
    const key = String(candidate?.key || "").toLowerCase();

    // Dressing/Mayo nur zulassen, wenn wirklich ein konkretes Dressing-/Mayo-Muster erkannt wurde.
    // Reine Sahnesauce wird über cream_sauce gelöst und darf nicht zusätzlich Dressing erzeugen.
    if (group === "mayo_dressing") {
      const text = lowerPlain([candidate.title, candidate.action, candidate.why, key].join(" "));
      if (!/mayo|mayonnaise|aioli|dressing|remoulade/.test(text)) return false;
    }

    const hygieneKey = candidateHygieneKeyV42(candidate);
    if (!hygieneKey) return true;
    if (seen.has(hygieneKey)) return false;
    seen.add(hygieneKey);
    return true;
  });
}

function buildCumulativeCandidatesV38(days, report, target) {
  let baseCandidates = buildRuleBasedCandidates(days, report)
    .filter(candidate => candidate && candidate.countsAsEffect !== false && hasAnyEffect(candidate.weeklyEffect));

  baseCandidates = filterReportedDuplicatesV38(baseCandidates);

  if ((Number(target?.protein) || 0) > 0) {
    baseCandidates.push(...buildConcreteProteinCandidatesV39(baseCandidates, target));
  }

  const splitVariants = [];
  baseCandidates.forEach(candidate => {
    const sourceCount = Array.from(new Set(candidate.sourceIds || [])).length;
    // Split-Varianten sind Reserveoptionen, falls ein Gesamtumbau zu stark wäre.
    // Die echten Hauptkandidaten bleiben im Pool, damit ein Schritt eine vollständige kumulative Regel sein kann.
    const group = String(candidate?.group || "").toLowerCase();
    const noSplitGroups = /protein_|protein|muesli_cereal|bakery_pastry/.test(group);
    if (sourceCount >= 2 && !noSplitGroups) {
      splitVariants.push(...splitCandidateIntoCumulativeStepsV38(candidate));
    }
  });

  const all = filterCandidateHygieneV42([...baseCandidates, ...splitVariants]);
  const seen = new Set();
  return all
    .filter(candidate => candidate && hasAnyEffect(candidate.weeklyEffect))
    .filter(candidate => allowCandidateForMacroNeedV40(candidate, target))
    .filter(candidate => {
      const id = (candidate.sourceIds || []).join("|") + "::" + candidate.key;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => {
      const ap = Number(a.priority) || 50;
      const bp = Number(b.priority) || 50;
      if (ap !== bp) return ap - bp;
      // Volle Habit-Kandidaten leicht vor Split-Varianten, solange die Bilanz passt.
      const as = String(a.key || "").includes("_v38_") ? 1 : 0;
      const bs = String(b.key || "").includes("_v38_") ? 1 : 0;
      if (as !== bs) return as - bs;
      return Math.abs(Number(b.dailyEffect?.kcal) || 0) - Math.abs(Number(a.dailyEffect?.kcal) || 0);
    })
    .slice(0, 80);
}

function groupNameV40(candidate) {
  return String(candidate?.group || candidate?.key || "").toLowerCase();
}

function allowCandidateForMacroNeedV40(candidate, target) {
  const group = groupNameV40(candidate);
  const carbTargetAbs = Math.abs(Number(target?.kohlenhydrate) || 0);
  const fatTarget = Number(target?.fett) || 0;
  const kcalTarget = Number(target?.kcal) || 0;

  // Wenn Kohlenhydrate nur leicht über Ziel sind, sollen Brot-/Toast-Reduktionen nicht die letzten Schritte füllen,
  // solange Fett das eigentliche offene Problem ist.
  if (group.includes("bread_amount") && fatTarget < 0 && carbTargetAbs <= 35) {
    return false;
  }

  // Cola bleibt erlaubt, weil Flüssigkalorien ein sehr einfacher Hebel sind.
  // Weitere stark KH-lastige Reduktionen sind bei kleiner KH-Lücke nicht nötig.
  if (group.includes("protein_fruehstueck_brot") && fatTarget < 0 && carbTargetAbs <= 25 && kcalTarget < 0) {
    return false;
  }

  return true;
}

function metricPenaltyV38(value, targetValue, metric) {
  const targetNumber = Number(targetValue) || 0;
  const current = Number(value) || 0;
  if (!targetNumber) return Math.pow(current / 10, 2) * 0.2;

  const weights = {
    kcal: 1.35,
    protein: 1.25,
    fett: 2.85,
    kohlenhydrate: 0.95
  };

  const scale = Math.max(metric === "kcal" ? 60 : 5, Math.abs(targetNumber));
  const diff = current - targetNumber;
  let penalty = Math.pow(diff / scale, 2) * (weights[metric] || 1);

  // Falsche Richtung ist deutlich schlechter als eine kleine Abweichung.
  if (Math.sign(current) !== Math.sign(targetNumber) && Math.abs(current) > 0.5) {
    penalty += 3;
  }

  // Zu starke Reduktion von KH oder Kalorien wird sichtbar bestraft.
  if (targetNumber < 0 && current < targetNumber * 1.45) {
    penalty += Math.pow((Math.abs(current) - Math.abs(targetNumber) * 1.45) / scale, 2) * 2;
  }

  // v40: Wenn Fett das Kernproblem ist, darf der Solver die Lösung nicht primär über Brot/KH lösen.
  // Eine offene Fettlücke ist stärker zu bestrafen als eine kleine Kalorienabweichung.
  if (metric === "fett" && targetNumber < 0 && current > targetNumber * 0.85) {
    penalty += Math.pow((current - targetNumber * 0.85) / scale, 2) * 4.5;
  }

  return penalty;
}

function scoreCumulativeEffectV38(effect, target) {
  return ["kcal", "protein", "fett", "kohlenhydrate"].reduce((total, metric) => {
    return total + metricPenaltyV38(Number(effect?.[metric]) || 0, Number(target?.[metric]) || 0, metric);
  }, 0);
}

function candidateFamilyKeysV42(candidate) {
  const group = String(candidate?.group || candidate?.key || "").toLowerCase();
  const days = uniqueNumbers(candidate?.days || []);
  const keys = [];

  const addDayFamily = (family) => {
    if (!days.length) keys.push(family + "::all");
    days.forEach(day => keys.push(family + "::tag" + day));
  };

  if (group.includes("protein_breakfast") || group.includes("protein_fruehstueck") || group.includes("muesli_cereal")) {
    addDayFamily("breakfast_protein");
  }
  if (group.includes("protein_snack") || group.includes("sweet_snack") || group.includes("chips")) {
    addDayFamily("snack_source");
  }
  if (group.includes("bread_topping") || group.includes("protein_belag")) {
    addDayFamily("bread_topping");
  }
  if (group.includes("mayo_dressing") || group.includes("cream_sauce")) {
    addDayFamily("sauce_source");
  }
  return keys;
}

function sourceConflictV38(candidate, usedSources, usedFamilies = new Set()) {
  const sourceConflict = (candidate.sourceIds || []).some(source => usedSources.has(source));
  if (sourceConflict) return true;
  return candidateFamilyKeysV42(candidate).some(key => usedFamilies.has(key));
}

function addCandidateToStateV38(state, candidate) {
  const usedSources = new Set(state.usedSources);
  (candidate.sourceIds || []).forEach(source => usedSources.add(source));
  const usedFamilies = new Set(state.usedFamilies || []);
  candidateFamilyKeysV42(candidate).forEach(key => usedFamilies.add(key));
  return {
    selected: [...state.selected, candidate],
    effect: addEffectsDaily(state.effect, candidate.dailyEffect),
    usedSources,
    usedFamilies
  };
}

function selectionQualityPenaltyV40(state, target) {
  const selected = Array.isArray(state?.selected) ? state.selected : [];
  const groups = selected.map(groupNameV40);
  const effect = state?.effect || makeEffect(0, 0, 0, 0);
  const fatTarget = Number(target?.fett) || 0;
  const carbTarget = Number(target?.kohlenhydrate) || 0;

  let penalty = 0;
  const fatOpen = fatTarget < 0 && Number(effect.fett || 0) > fatTarget * 0.85;
  const carbsAlreadyEnough = carbTarget < 0 && Number(effect.kohlenhydrate || 0) <= carbTarget * 0.9;

  if (fatOpen && carbsAlreadyEnough) {
    penalty += groups.filter(group => group.includes("bread_amount")).length * 3.0;
    penalty += groups.filter(group => group.includes("protein_fruehstueck_brot")).length * 1.5;
  }

  // Präzisere Fettkandidaten sind besser als weitere KH-Kandidaten, wenn Fett noch offen ist.
  if (fatOpen) {
    const preciseFat = groups.filter(group =>
      group.includes("butter") ||
      group.includes("nuts") ||
      group.includes("cream_sauce") ||
      group.includes("chips") ||
      group.includes("bread_topping") ||
      group.includes("fast_food") ||
      group.includes("oil_cooking") ||
      group.includes("mayo_dressing") ||
      group.includes("fried_food") ||
      group.includes("restaurant_canteen")
    ).length;
    const carbHeavy = groups.filter(group =>
      group.includes("bread_amount") ||
      group.includes("protein_fruehstueck_brot")
    ).length;
    penalty += Math.max(0, carbHeavy - preciseFat) * 0.4;
  }

  return penalty;
}

function stateSortScoreV38(state, target) {
  const base = scoreCumulativeEffectV38(state.effect, target);
  const count = state.selected.length;
  const countPenalty = Math.pow((10 - count) / 10, 2) * 0.15;
  return base + countPenalty + selectionQualityPenaltyV40(state, target);
}

function pruneStatesV38(states, target, limit = 160) {
  return states
    .sort((a, b) => stateSortScoreV38(a, target) - stateSortScoreV38(b, target))
    .slice(0, limit);
}

function selectBestTenCumulativeCandidatesV38(candidates, target) {
  const usable = (candidates || []).filter(candidate => candidate && candidate.countsAsEffect !== false && hasAnyEffect(candidate.weeklyEffect));
  const buckets = Array.from({ length: 11 }, () => []);
  buckets[0] = [{ selected: [], effect: makeEffect(0, 0, 0, 0), usedSources: new Set(), usedFamilies: new Set() }];

  usable.forEach(candidate => {
    for (let count = 9; count >= 0; count -= 1) {
      const states = buckets[count] || [];
      states.forEach(state => {
        if (sourceConflictV38(candidate, state.usedSources, state.usedFamilies)) return;
        const next = addCandidateToStateV38(state, candidate);
        buckets[count + 1].push(next);
      });
    }

    for (let count = 0; count <= 10; count += 1) {
      buckets[count] = pruneStatesV38(buckets[count], target, 160);
    }
  });

  const exact = pruneStatesV38(buckets[10] || [], target, 1)[0];
  if (exact) return exact.selected;

  // Falls bei sehr wenigen Eingaben keine 10 echten Umbauten möglich sind: nimm die beste nicht-künstliche Kombination.
  for (let count = 9; count >= 1; count -= 1) {
    const fallback = pruneStatesV38(buckets[count] || [], target, 1)[0];
    if (fallback) return fallback.selected;
  }

  return [];
}

function implementationPriorityV38(candidate) {
  const group = String(candidate?.group || "").toLowerCase();
  if (group.includes("drink_sugar")) return 1;
  if (group.includes("bread_topping")) return 2;
  if (group.includes("protein_breakfast") || group.includes("protein_snack") || group.includes("protein_belag") || group.includes("protein_fruehstueck") || group.includes("protein_fix")) return 3;
  if (group.includes("cream_sauce")) return 4;
  if (group.includes("butter")) return 5;
  if (group.includes("nuts")) return 6;
  if (group.includes("sweet_snack")) return 7;
  if (group.includes("chips")) return 8;
  if (group.includes("oil_cooking") || group.includes("mayo_dressing")) return 6;
  if (group.includes("juice_smoothie") || group.includes("coffee_drink") || group.includes("alcohol")) return 7;
  if (group.includes("bakery_pastry") || group.includes("muesli_cereal")) return 8;
  if (group.includes("fast_food") || group.includes("fried_food") || group.includes("restaurant_canteen")) return 9;
  if (group.includes("bread_amount") || group.includes("carb_side_portion")) return 10;
  return 20;
}

function sortCumulativeImplementationOrderV38(selected) {
  return [...selected].sort((a, b) => {
    const ap = implementationPriorityV38(a);
    const bp = implementationPriorityV38(b);
    if (ap !== bp) return ap - bp;
    return (Number(a.priority) || 50) - (Number(b.priority) || 50);
  });
}

function candidateToPotentialV38(candidate) {
  const weekly = candidate?.weeklyEffect || makeEffect(0, 0, 0, 0);
  const kcal = Math.abs(Math.round(Number(weekly.kcal) || 0));
  const group = String(candidate?.group || "").toLowerCase();
  const focus = cleanSentencePart(candidate?.focus || "Zielhebel");
  let name = cleanSentencePart(candidate?.title || "Hebel").replace(/\s*·\s*Tag.*$/i, "");
  let role = "Kalorienhebel";

  if (group.includes("drink_sugar")) { name = "Cola / Zuckergetränke"; role = "Flüssigkalorien"; }
  else if (group.includes("sweet_snack")) { name = "Süßes / Nutella"; role = "Snack-Treiber"; }
  else if (group.includes("chips")) { name = "Chips"; role = "Snack-Treiber"; }
  else if (group.includes("nuts")) { name = "Nüsse"; role = "Fett-/Portionshebel"; }
  else if (group.includes("bread_topping")) { name = "Wurst-/Käsebelag"; role = "Fett-/Proteinhebel"; }
  else if (group.includes("butter")) { name = "Butter"; role = "Fett-/Portionshebel"; }
  else if (group.includes("cream_sauce")) { name = "Sahnesauce"; role = "Fett-/Kalorienhebel"; }
  else if (group.includes("protein")) { name = "Proteinfrühstück"; role = "Proteinhebel"; }
  else if (group.includes("oil_cooking")) { name = "Ölmenge"; role = "Fett-/Portionshebel"; }
  else if (group.includes("mayo_dressing")) { name = "Dressing / Mayonnaise"; role = "Fett-/Saucenhebel"; }
  else if (group.includes("alcohol")) { name = "Alkohol"; role = "Flüssigkalorien"; }
  else if (group.includes("juice_smoothie")) { name = "Saft / Smoothie"; role = "Flüssigkalorien"; }
  else if (group.includes("coffee_drink")) { name = "Kaffeegetränk"; role = "Flüssigkalorien"; }
  else if (group.includes("bakery_pastry")) { name = "Gebäck"; role = "Snack-/Frühstückshebel"; }
  else if (group.includes("fried_food")) { name = "Frittiertes"; role = "Fett-/Kalorienhebel"; }
  else if (group.includes("restaurant_canteen")) { name = "Auswärtsmahlzeit"; role = "Mahlzeitenstruktur"; }
  else if (group.includes("carb_side_portion")) { name = "Beilagenportion"; role = "Mahlzeitenstruktur"; }
  else if (group.includes("muesli_cereal")) { name = "Müsli / Cerealien"; role = "Frühstückshebel"; }
  else if (group.includes("fast_food")) { role = "Kalorientreiber"; }

  return {
    lebensmittel: name,
    rolle: role,
    kcal,
    anteil: kcal >= 400 ? "hoch" : kcal >= 180 ? "moderat" : "ergänzend",
    grund: cleanSentencePart(candidate?.why || focus)
  };
}

function buildPotentialsFromSelectedV38(selected) {
  const byGroup = new Map();
  (selected || []).forEach(candidate => {
    const key = candidate.group || candidate.key;
    if (!byGroup.has(key)) {
      byGroup.set(key, { ...candidate, weeklyEffect: makeEffect(0, 0, 0, 0) });
    }
    const entry = byGroup.get(key);
    entry.weeklyEffect = makeEffect(
      entry.weeklyEffect.kcal + (Number(candidate.weeklyEffect?.kcal) || 0),
      entry.weeklyEffect.protein + (Number(candidate.weeklyEffect?.protein) || 0),
      entry.weeklyEffect.fett + (Number(candidate.weeklyEffect?.fett) || 0),
      entry.weeklyEffect.kohlenhydrate + (Number(candidate.weeklyEffect?.kohlenhydrate) || 0)
    );
  });

  return Array.from(byGroup.values())
    .sort((a, b) => Math.abs(Number(b.weeklyEffect?.kcal) || 0) - Math.abs(Number(a.weeklyEffect?.kcal) || 0))
    .slice(0, 5)
    .map(candidate => candidateToPotentialV38(candidate));
}

function daysReferenceV45(candidate) {
  const days = uniqueNumbers(candidate?.days || []);
  if (!days.length) return "";
  return "abgeleitet aus " + days.map(day => "Tag " + day).join(", ");
}

function patternLabelV45(candidate) {
  const group = String(candidate?.group || candidate?.key || "").toLowerCase();
  const title = lowerPlain(candidate?.title || "");

  if (group.includes("drink_sugar")) return "Cola-/Zuckergetränk-Muster";
  if (group.includes("juice_smoothie")) return "Saft-/Smoothie-Muster";
  if (group.includes("coffee_drink")) return "Kaffeegetränk-Muster";
  if (group.includes("alcohol")) return "Alkohol-Muster";
  if (group.includes("bread_topping") || group.includes("protein_belag")) return "Brotbelag-Muster";
  if (group.includes("protein_breakfast") || group.includes("protein_fruehstueck") || group.includes("muesli_cereal")) return "Frühstücksmuster";
  if (group.includes("cream_sauce")) return "Saucen-Muster";
  if (group.includes("mayo_dressing")) return "Dressing-/Mayo-Muster";
  if (group.includes("oil_cooking")) return "Öl-/Kochfett-Muster";
  if (group.includes("butter")) return "Butter-Muster";
  if (group.includes("nuts")) return "Nuss-Snack-Muster";
  if (group.includes("sweet_snack")) return "Süßigkeiten-Muster";
  if (group.includes("chips")) return "Chips-Snack-Muster";
  if (group.includes("fried_food")) return "Frittiert-/Panade-Muster";
  if (group.includes("restaurant_canteen")) return "Auswärts-/Kantinen-Muster";
  if (group.includes("fast_food") || title.includes("döner") || title.includes("burger") || title.includes("pizza") || title.includes("pommes")) return "Fast-Food-/Auswärts-Muster";
  if (group.includes("bread_amount")) return "Brot-/Toastmengen-Muster";
  if (group.includes("carb_side_portion")) return "Beilagen-Muster";
  return "Ernährungsmuster";
}

function confirmationFrequencyV45(candidate) {
  const original = cleanSentencePart(candidate?.frequency || "");
  const group = String(candidate?.group || candidate?.key || "").toLowerCase();
  const days = uniqueNumbers(candidate?.days || []);
  const countText = days.length ? "In deiner Testwoche kam dieses Muster ca. " + days.length + "x vor." : (original ? "Ausgangshäufigkeit: " + original + "." : "");

  if (group.includes("drink_sugar") && original.toLowerCase().includes("startstufe")) {
    return "3 passende Cola-/Zuckergetränk-Situationen bestätigen; danach dauerhaft bei diesem Muster. " + countText;
  }

  return "3 passende Situationen bestätigen; danach dauerhaft bei diesem Muster. " + countText;
}

function coachingActionV45(candidate) {
  const raw = cleanSentencePart(candidate?.action || "");
  const group = String(candidate?.group || candidate?.key || "").toLowerCase();
  const ref = daysReferenceV45(candidate);
  const refText = ref ? " (" + ref + ")" : "";

  if (group.includes("drink_sugar")) {
    return "Bei deinem wiederkehrenden Cola-/Zuckergetränk-Muster" + refText + " ersetzt du die nächsten passenden Portionen schrittweise durch Wasser, ungesüßten Tee oder eine kalorienfreie Variante.";
  }
  if (group.includes("juice_smoothie")) {
    return "Bei deinem Saft-/Smoothie-Muster" + refText + " ersetzt du die nächsten passenden Portionen durch Wasser, ungesüßten Tee oder ganze Früchte plus Wasser.";
  }
  if (group.includes("coffee_drink")) {
    return "Bei deinem Kaffeegetränk-Muster" + refText + " wählst du die nächste passende Variante ohne Sirup/Zucker und mit weniger Milch oder einer leichteren Alternative.";
  }
  if (group.includes("alcohol")) {
    return "Bei deinem Alkohol-Muster" + refText + " ersetzt du die nächste passende Portion durch eine alkoholfreie oder deutlich kleinere Variante.";
  }
  if (group.includes("bread_topping") || group.includes("protein_belag")) {
    return "Bei deinen wiederkehrenden Brotbelag-Mahlzeiten" + refText + " ersetzt du Wurst-/Käse-Beläge durch Putenbrust, mageren Aufschnitt oder fettarmen Frischkäse.";
  }
  if (group.includes("protein_breakfast") || group.includes("protein_fruehstueck")) {
    return "Bei deinen wiederkehrenden Frühstücksmustern" + refText + " ergänzt du 150 g Skyr, Joghurt oder Magerquark und reduzierst dafür Milch, Müsli, Brot oder süßen Anteil.";
  }
  if (group.includes("cream_sauce")) {
    return "Bei deinem Saucen-Muster" + refText + " ersetzt du Sahnesauce durch Tomatensauce, Gemüsebrühe oder eine leichte Joghurtsauce.";
  }
  if (group.includes("mayo_dressing")) {
    return "Bei deinem Dressing-/Mayo-Muster" + refText + " ersetzt du Mayo, Aioli oder schwere Dressings durch Joghurt-Dressing, Essig/Öl klar dosiert oder eine leichtere Sauce.";
  }
  if (group.includes("oil_cooking")) {
    return "Bei deinem Öl-/Kochfett-Muster" + refText + " dosierst du Öl sichtbar mit Teelöffel/Sprühöl und reduzierst die Menge pro passender Mahlzeit.";
  }
  if (group.includes("butter")) {
    return "Bei deinem Butter-Muster" + refText + " reduzierst du die Butterportion auf ca. 5 g oder ersetzt sie durch fettarmen Frischkäse.";
  }
  if (group.includes("nuts")) {
    return "Bei deinem Nuss-Snack-Muster" + refText + " reduzierst du die Portion auf ca. 15 g.";
  }
  if (group.includes("sweet_snack")) {
    return "Bei deinem Süßigkeiten-Muster" + refText + " reduzierst du Schokolade-/Nutella-Mengen auf ca. 20 g oder ersetzt eine passende Portion durch eine proteinreichere Alternative.";
  }
  if (group.includes("chips")) {
    return "Bei deinem Chips-Snack-Muster" + refText + " reduzierst du die Portion auf ca. 20 g oder ersetzt die nächste passende Portion durch Skyr, Magerquark, Hüttenkäse oder eine magere Proteinportion.";
  }
  if (group.includes("fried_food")) {
    return "Bei deinem Frittiert-/Panade-Muster" + refText + " wählst du die nächste passende Variante gegrillt, aus dem Ofen oder ohne Panade.";
  }
  if (group.includes("restaurant_canteen")) {
    return "Bei deinem Auswärts-/Kantinen-Muster" + refText + " wählst du proteinreicher, mit weniger Sauce/Extra-Fett und klarer Beilagenportion.";
  }
  if (group.includes("fast_food")) {
    if (/döner|doener|doner/.test(lowerPlain(candidate?.title || ""))) return "Bei deinem Döner-/Imbiss-Muster" + refText + " wählst du viel Fleisch und Salat, wenig Sauce und keine Extra-Fettquelle.";
    if (/burger/.test(lowerPlain(candidate?.title || ""))) return "Bei deinem Burger-Muster" + refText + " wählst du eine kleinere Variante, weniger Sauce/Käse und keine zusätzliche Fettbeilage.";
    if (/pizza/.test(lowerPlain(candidate?.title || ""))) return "Bei deinem Pizza-Muster" + refText + " wählst du kleiner, mit proteinreicherem Belag und weniger Extra-Käse.";
    if (/pommes/.test(lowerPlain(candidate?.title || ""))) return "Bei deinem Pommes-Muster" + refText + " ersetzt du Pommes durch Ofengemüse, Salat oder Kartoffeln aus dem Ofen mit wenig Öl.";
  }

  return raw;
}

function coachingWhyV45(candidate) {
  const raw = cleanSentencePart(candidate?.why || "");
  const label = patternLabelV45(candidate);
  if (!raw) return "Dieser Schritt übersetzt ein erkanntes " + label + " in eine wiederholbare Standardregel.";
  return raw + " Der Schritt gilt als Standardregel für dieses " + label + ", nicht als einmalige Korrektur eines einzelnen Tages.";
}

function buildPlanQualityGateV45(selected, target, report, days) {
  const effect = planEffectFromCandidatesV43(selected || []);
  const missingCount = 10 - (Array.isArray(selected) ? selected.length : 0);
  const groups = (selected || []).map(candidate => String(candidate?.group || candidate?.key || "").toLowerCase());
  const text = reportAndDayTextV43(report, days);

  return {
    version: "v45_release_candidate_quality_gate",
    zehnEchteUmbauten: missingCount <= 0,
    keineSicherungsschritte: true,
    dreiBestaetigungenProSchritt: true,
    kumulativeBilanz: true,
    geplanteTageswirkung: effect,
    zielTageswirkung: target,
    colaErkannt: /cola|zuckergetraenk|zuckergetränk|fluessigkalorien|flüssigkalorien/.test(text),
    colaImPlan: groups.some(group => group.includes("drink_sugar")),
    score: Number(scoreCumulativeEffectV38(effect, target).toFixed(3)),
    hinweis: "Feature-Freeze: Ab jetzt nur echte Bugs, keine kosmetischen Solver-Umbauten."
  };
}

function sentencePartV45(value) {
  return cleanSentencePart(value || "").replace(/[.!?]+$/g, "").trim();
}

function candidateToStep(index, candidate) {
  const daily = weeklyToDaily(candidate.weeklyEffect);
  const weekly = candidate.weeklyEffect;
  return "Schritt " + (index + 1) +
    ": Titel: " + sentencePartV45(candidate.title).replace(/\s*·\s*Tag\s*\d+\s*$/i, "") +
    ". Ab jetzt: " + sentencePartV45(coachingActionV45(candidate)) +
    ". Häufigkeit: " + sentencePartV45(confirmationFrequencyV45(candidate)) +
    ". Fokus: " + sentencePartV45(candidate.focus) +
    ". Warum: " + sentencePartV45(coachingWhyV45(candidate)) +
    ". Wirkung pro Ereignis: intern berechnet" +
    ". Wochenwirkung: " + formatEffectSegment(weekly, "week") +
    ". Tagesdurchschnitt: " + formatEffectSegment(daily, "day") +
    ". Art: 30-Tage-Aufbau.";
}

function planEffectFromCandidatesV43(selected) {
  return (selected || []).reduce((total, candidate) => addEffectsDaily(total, candidate?.dailyEffect || makeEffect(0, 0, 0, 0)), makeEffect(0, 0, 0, 0));
}

function planScoreWithQualityV43(selected, target) {
  const effect = planEffectFromCandidatesV43(selected);
  return scoreCumulativeEffectV38(effect, target) + selectionQualityPenaltyV40({ selected: selected || [], effect }, target);
}

function groupMatchesV43(candidate, regex) {
  const group = String(candidate?.group || candidate?.key || "").toLowerCase();
  const title = lowerPlain(candidate?.title || "");
  return regex.test(group) || regex.test(title);
}

function planHasGroupV43(selected, regex) {
  return (selected || []).some(candidate => groupMatchesV43(candidate, regex));
}

function reportAndDayTextV43(report, days) {
  const reportParts = [
    report?.kernproblem,
    report?.fahrplanBilanz,
    ...(Array.isArray(report?.problemMuster) ? report.problemMuster.map(item => [item?.titel, item?.beschreibung, item?.hebel].join(" ")) : []),
    ...(Array.isArray(report?.topKalorienQuellen) ? report.topKalorienQuellen.map(item => [item?.lebensmittel, item?.rolle, item?.grund].join(" ")) : []),
    ...(Array.isArray(report?.lebensmittelAnalyse) ? report.lebensmittelAnalyse.map(item => [item?.lebensmittel, item?.menge, item?.bewertung, item?.einordnung].join(" ")) : [])
  ];
  const dayParts = (Array.isArray(days) ? days : []).map(day => dayFullText(day));
  return lowerPlain([...reportParts, ...dayParts].filter(Boolean).join(" "));
}

function requiredPotentialGroupsV43(report, days, candidates) {
  const text = reportAndDayTextV43(report, days);
  const availableGroups = new Set((candidates || []).map(candidate => String(candidate?.group || candidate?.key || "").toLowerCase()));
  const hasAvailable = regex => Array.from(availableGroups).some(group => regex.test(group));
  const groups = [];

  const add = (key, regex, priority, required, tolerance = 0.65) => {
    if (!required || !hasAvailable(regex)) return;
    groups.push({ key, regex, priority, tolerance });
  };

  add("drink_sugar", /drink_sugar/, 1, /cola|limonade|eistee|zuckergetraenk|zuckergetränk|fluessigkalorien|flüssigkalorien/.test(text), 0.85);
  add("juice_smoothie", /juice_smoothie/, 2, /saft|smoothie|fruchtsaft/.test(text), 0.65);
  add("coffee_drink", /coffee_drink/, 3, /latte|milchkaffee|eiskaffee|frapp|sirupgetraenk|sirupgetränk/.test(text), 0.55);
  add("alcohol", /alcohol/, 4, /alkohol|bier|wein|cocktail|longdrink/.test(text), 0.55);
  add("oil_cooking", /oil_cooking/, 5, /(oel|öl|olivenoel|olivenöl|bratoel|bratöl|kochoel|kochöl)/.test(text), 0.45);
  add("mayo_dressing", /mayo_dressing/, 6, /mayo|mayonnaise|aioli|dressing|remoulade/.test(text), 0.45);

  return groups.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

function hasCandidateConflictWithPlanV43(candidate, selected) {
  const usedSources = new Set();
  const usedFamilies = new Set();
  (selected || []).forEach(item => {
    (item?.sourceIds || []).forEach(source => usedSources.add(source));
    candidateFamilyKeysV42(item).forEach(key => usedFamilies.add(key));
  });
  return sourceConflictV38(candidate, usedSources, usedFamilies);
}

function replacementAllowedForPotentialV43(candidate) {
  const group = String(candidate?.group || candidate?.key || "").toLowerCase();
  // Diese Basishebel bleiben möglichst geschützt, weil sie in den meisten Zielvektoren Kernkorrekturen sind.
  if (group.includes("bread_topping")) return false;
  if (group.includes("protein_breakfast")) return false;
  if (group.includes("cream_sauce")) return false;
  if (group.includes("butter")) return false;
  if (group.includes("nuts")) return false;
  return true;
}

function bestPlanWithRequiredGroupV43(selected, candidates, target, requirement) {
  const current = (selected || []).slice(0, 10);
  if (planHasGroupV43(current, requirement.regex)) return current;

  const currentScore = planScoreWithQualityV43(current, target);
  let best = null;
  const options = (candidates || [])
    .filter(candidate => candidate && candidate.countsAsEffect !== false && hasAnyEffect(candidate.weeklyEffect))
    .filter(candidate => groupMatchesV43(candidate, requirement.regex))
    .filter(candidate => !current.includes(candidate))
    .sort((a, b) => {
      const aSplit = String(a.key || "").includes("_v38_") ? 0 : 1;
      const bSplit = String(b.key || "").includes("_v38_") ? 0 : 1;
      if (requirement.key === "drink_sugar" && aSplit !== bSplit) return aSplit - bSplit;
      return (Number(a.priority) || 50) - (Number(b.priority) || 50);
    });

  options.forEach(option => {
    if (current.length < 10 && !hasCandidateConflictWithPlanV43(option, current)) {
      const plan = [...current, option].slice(0, 10);
      const score = planScoreWithQualityV43(plan, target);
      if (!best || score < best.score) best = { plan, score };
    }

    current.forEach((oldCandidate, index) => {
      if (groupMatchesV43(oldCandidate, requirement.regex)) return;
      if (!replacementAllowedForPotentialV43(oldCandidate)) return;
      const without = current.filter((_, idx) => idx !== index);
      if (hasCandidateConflictWithPlanV43(option, without)) return;
      const plan = [...without, option];
      const score = planScoreWithQualityV43(plan, target);
      if (!best || score < best.score) best = { plan, score };
    });
  });

  const targetScoreLimit = Math.max(0.75, currentScore + (Number(requirement.tolerance) || 0.45));
  if (best && best.score <= targetScoreLimit) return best.plan;
  return current;
}

function enforceRequiredPotentialCandidatesV43(selected, candidates, target, report, days) {
  let plan = (selected || []).slice(0, 10);
  const requirements = requiredPotentialGroupsV43(report, days, candidates);
  requirements.forEach(requirement => {
    plan = bestPlanWithRequiredGroupV43(plan, candidates, target, requirement).slice(0, 10);
  });
  return plan;
}

function buildDeterministicTenStepPlan(report, days) {
  if (!report?.differenz) return report;

  const target = {
    kcal: signedTargetEffect(report.differenz?.kcal),
    protein: signedTargetEffect(report.differenz?.protein),
    fett: signedTargetEffect(report.differenz?.fett),
    kohlenhydrate: signedTargetEffect(report.differenz?.kohlenhydrate)
  };

  const candidates = buildCumulativeCandidatesV38(days, report, target);
  const selectedRawInitial = selectBestTenCumulativeCandidatesV38(candidates, target);
  const selectedRaw = enforceRequiredPotentialCandidatesV43(selectedRawInitial, candidates, target, report, days);
  const selected = sortCumulativeImplementationOrderV38(selectedRaw).slice(0, 10);
  const cumulativeDaily = selected.reduce((total, candidate) => addEffectsDaily(total, candidate.dailyEffect), makeEffect(0, 0, 0, 0));
  const cumulativeWeekly = makeEffect(cumulativeDaily.kcal * 7, cumulativeDaily.protein * 7, cumulativeDaily.fett * 7, cumulativeDaily.kohlenhydrate * 7);
  const zielWeekly = makeEffect(target.kcal * 7, target.protein * 7, target.fett * 7, target.kohlenhydrate * 7);

  report.fahrplanSolverStatus = {
    modus: "v45_release_candidate_quality_gate",
    zielTageswirkung: target,
    geplanteTageswirkung: cumulativeDaily,
    zielWochenwirkung: zielWeekly,
    geplanteWochenwirkung: cumulativeWeekly,
    abweichungTageswirkung: makeEffect(
      cumulativeDaily.kcal - target.kcal,
      cumulativeDaily.protein - target.protein,
      cumulativeDaily.fett - target.fett,
      cumulativeDaily.kohlenhydrate - target.kohlenhydrate
    ),
    zielkorridorErreicht: scoreCumulativeEffectV38(cumulativeDaily, target) <= 0.75,
    echteBilanzschritte: selected.length,
    sicherungsschritte: 0,
    bestaetigungenProSchritt: 3,
    aufbauLogik: "Jeder Schritt wird 3x bestätigt, bleibt danach aktiv und der nächste Schritt wird freigeschaltet. Nach Schritt 10 zählt die kumulierte Wirkung.",
    potenzialPflichtPruefung: "Erkannte starke Potenziale – besonders Flüssigkalorien – werden als echte Umbaukandidaten gegen die Bilanz geprüft und bei tragfähiger Zielwirkung in den Plan aufgenommen."
  };

  report.fahrplanSolverStatus.qualitaetsGate = buildPlanQualityGateV45(selected, target, report, days);

  report.zehnSchrittePlan = selected.map((candidate, index) => candidateToStep(index, candidate));

  const first = selected[0];
  if (first) {
    report.naechsteKonkreteAenderung = first.title + ": " + coachingActionV45(first);
  }

  report.fahrplanBilanz = "Die 10 Schritte sind ein kumulativer 30-Tage-Aufbauplan: Jeder Schritt wird 3x an passenden Alltagssituationen bestätigt, bleibt danach aktiv und schaltet den nächsten Schritt frei. Nach Schritt 10 soll die Summe aller Umbauten deinen durchschnittlichen Tag in Richtung Sollzustand bringen.";
  report.groessteHebel = selected.slice(0, 5).map(candidate => candidate.title + " – " + candidate.focus);
  report.topKalorienQuellen = buildPotentialsFromSelectedV38(selected);

  return report;
}


function derivePotentialRole(item) {
  const text = [item?.lebensmittel, item?.grund, item?.rolle].filter(Boolean).join(" ").toLowerCase();

  if (/cola|saft|limonade|eistee|alkohol|bier|wein|gesüß|gesues|latte|frapp/.test(text)) return "Flüssigkalorien";
  if (/schokolade|schokoriegel|chips|snack|keks|kuchen|süß|suess|bonbon/.test(text)) return "Snack-Treiber";
  if (/protein|eiweiß|eiweiss|quark|skyr|hähnchen|haehnchen|pute|thunfisch|eier/.test(text) && /lücke|luecke|zu wenig|unter/.test(text)) return "Proteinlücke";
  if (/pizza|döner|doener|burger|pommes|frittiert|fast food|fastfood/.test(text)) return "Kalorientreiber";
  if (/butter|sahne|käse|kaese|mayo|mayonnaise|öl|oel|nüsse|nuesse|nuss|fett/.test(text)) return "Fett-/Portionshebel";
  if (/brot|toast|brötchen|broetchen|müsli|muesli|haferflocken|nudeln|reis|kartoffel/.test(text)) return "Mahlzeitenstruktur";
  return "Zielhebel";
}

function cleanPotentialName(name) {
  const raw = String(name || "").trim();
  const lower = raw.toLowerCase();

  // Keine unklare Vermischung von grundsätzlich nutzbaren Lebensmitteln mit klaren Snack-/Problemquellen.
  if ((lower.includes("nüsse") || lower.includes("nuesse") || lower.includes("nuss")) && lower.includes("chips")) return "Chips";
  if ((lower.includes("joghurt") || lower.includes("quark") || lower.includes("skyr")) && (lower.includes("schokolade") || lower.includes("schokoriegel"))) return lower.includes("schokoriegel") ? "Schokoriegel" : "Schokolade";
  if ((lower.includes("wasser") || lower.includes("tee")) && lower.includes("cola")) return "Cola";

  return raw;
}

function sanitizePotentialItems(report) {
  const input = Array.isArray(report?.topKalorienQuellen) ? report.topKalorienQuellen : [];
  const seen = new Set();

  const cleaned = input
    .map(item => {
      const lebensmittel = cleanPotentialName(item?.lebensmittel);
      const role = item?.rolle || derivePotentialRole({ ...item, lebensmittel });
      const grund = String(item?.grund || "").trim();

      return {
        ...item,
        lebensmittel,
        rolle: role,
        grund: grund || "Hier liegt aktuell ein relevanter Hebel für Kalorien, Sättigung, Struktur oder Zielabweichung."
      };
    })
    .filter(item => {
      const key = String(item?.lebensmittel || "").toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  report.topKalorienQuellen = cleaned;
  return report;
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
    "problem",
    "brot",
    "toast",
    "brötchen",
    "broetchen"
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

DEIN GRÖSSTES POTENZIAL / topKalorienQuellen:
Die Ausgabe topKalorienQuellen wird in der App als "Dein größtes Potenzial" angezeigt.
Gemeint sind NICHT automatisch schlechte oder verbotene Lebensmittel. Gemeint sind die Punkte, bei denen aktuell der größte Hebel für Veränderung liegt.
Wähle Punkte aus, die besonders stark auf eines dieser Themen einzahlen:
- Kalorienüberschuss oder Zielabweichung
- fehlende Sättigung
- zu wenig Protein
- Flüssigkalorien
- wiederholte Snacks/Süßigkeiten
- hohe Energiedichte
- fehlende Mahlzeitenstruktur
- stark portionssensible Fett- oder Kohlenhydratquellen

Pflicht für jedes topKalorienQuellen-Item:
- lebensmittel = ein klarer einzelner Punkt oder ein sehr eng zusammengehöriges Muster.
- rolle = kurze Einordnung, z. B. "Kalorientreiber", "Snack-Treiber", "Flüssigkalorien", "Proteinlücke", "Fett-/Portionshebel", "Mahlzeitenstruktur" oder "Zielhebel".
- grund = immer mit neutraler Einordnung: nicht verboten, aber aktueller Hebel.

Vermeide unklare Mischungen:
- Nicht: "Nüsse und Chips". Besser: "Chips" als Snack-Treiber und Nüsse höchstens als portionssensibler Baustein oder neutral.
- Nicht: "Wasser und Cola". Besser: "Cola" als Flüssigkalorien.
- Nicht: "Joghurt und Schokolade". Besser getrennt einordnen.
- Brot/Toast/Brötchen nur dann nennen, wenn Menge, Belag, Häufigkeit oder Mahlzeitenstruktur wirklich der Hebel ist. Dann im Grund klar erklären, dass Brot nicht verboten ist, sondern aktuell über Menge/Kontext relevant wird.

DEINE STABILE GRUNDLAGE / stabileBausteine:
Die Ausgabe stabileBausteine wird in der App als "Deine stabile Grundlage" angezeigt.
Gemeint sind Lebensmittel oder Gewohnheiten, auf denen der Nutzer aufbauen kann: Struktur, Protein, Flüssigkeit, Volumen oder Sättigung.
Nicht alles dort ist perfekt oder unbegrenzt. Portionssensible Lebensmittel müssen als solche benannt werden.

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

STABILE GRUNDLAGE:
Stabile Grundlage sind Lebensmittel und Gewohnheiten, die der Nutzer eher beibehalten, strukturieren oder gezielt ausbauen kann.
Gute Kandidaten:
- Hähnchen, Pute, Thunfisch, Eier
- Quark, Joghurt, Skyr
- Gemüse, Salat, Beeren
- Wasser, Tee
- Reis und Kartoffeln nur bei Standard-/Mischkost; bei Low Carb/Keto nur wenn zur Strategie passend
- Käse kann stabil oder neutral sein, aber nur in kontrollierter Menge und nicht als Fett-Treiber
- Brot nur dann als Grundlage nennen, wenn Menge und Belag ausdrücklich als kontrolliert eingeordnet werden; sonst nicht als stabile Grundlage ausgeben

Dürfen NICHT als stabile Grundlage ausgegeben werden:
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
Der finale 10-Schritte-Fahrplan wird NICHT von dir formuliert.
Der Code der App baut ihn regelbasiert aus den 7 Ernährungstagen, der Ist-/Soll-Differenz und den erkannten Lebensmitteln.

Deine Aufgabe für den Plan:
- Gib bei zehnSchrittePlan ein leeres Array [] aus.
- Erfinde keine Schritte.
- Keine Platzhaltertexte.
- Konzentriere dich auf Ist-Schätzung, Muster, Lebensmittelanalyse, topKalorienQuellen und stabileBausteine.

WICHTIG FÜR DIE LEBENSMITTELANALYSE:
Damit der Code konkrete Umbauten bauen kann, müssen lebensmittelAnalyse und topKalorienQuellen möglichst klar sein:
- einzelne Lebensmittel/Muster statt Mischgruppen
- Mengen nennen, wenn erkennbar
- kcal und Makros realistisch schätzen
- klare Begriffe verwenden: Cola, Saft, Smoothie, Latte/Milchkaffee, Alkohol, Schokolade, Nutella, Chips, Nüsse, Butter, Öl, Mayonnaise, Dressing, Sahnesauce, Käse, Wurst, Brot, Müsli, Nudeln/Reis/Kartoffeln, Gebäck/Croissant, Pommes, Döner, Burger, Pizza, Frittiertes, Kantine/Restaurant, Skyr, Magerquark, Hähnchen, Pute, Eier.

MAKRO-KALORIEN-PLAUSIBILITÄT:
Prüfe intern, ob Ist-Kalorien ungefähr zu Protein×4 + Fett×9 + Kohlenhydrate×4 passen.
Wenn die Abweichung größer als ca. 150 kcal ist, erkläre in schaetzHinweis, dass ein Teil der Kalorien/Makros wegen Saucen, Ölen, verarbeiteten Lebensmitteln oder ungenauen Mengen nur grob zugeordnet werden kann.
Der Soll-Zustand darf trotzdem nicht verändert werden.

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
      minItems: 0,
      maxItems: 0,
      items: { type: "string" }
    },
    zehnSchrittePlan: {
      type: "array",
      minItems: 0,
      maxItems: 0,
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
          rolle: { type: "string" },
          kcal: { type: "number" },
          anteil: { type: "string" },
          grund: { type: "string" }
        },
        required: ["lebensmittel", "rolle", "kcal", "anteil", "grund"]
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

function stripJsonCandidate(outputText) {
  const text = String(outputText || "").trim().replace(/^\uFEFF/, "");
  if (!text) return "";

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1]?.trim() || text;

  const firstBrace = source.indexOf("{");
  if (firstBrace < 0) return source;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < source.length; i += 1) {
    const char = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      return source.slice(firstBrace, i + 1).trim();
    }
  }

  const lastBrace = source.lastIndexOf("}");
  return lastBrace > firstBrace ? source.slice(firstBrace, lastBrace + 1).trim() : source.slice(firstBrace).trim();
}

function repairLikelyJsonText(text) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/}\s*{/g, "},{")
    .replace(/]\s*{/g, "],{")
    .replace(/}\s*\[/g, "},[")
    .trim();
}

function parseJsonReport(outputText) {
  const variants = [];
  const raw = String(outputText || "").trim();
  const extracted = stripJsonCandidate(raw);

  for (const variant of [raw, extracted, repairLikelyJsonText(extracted), repairLikelyJsonText(raw)]) {
    if (variant && !variants.includes(variant)) variants.push(variant);
  }

  let lastError = null;

  for (const candidate of variants) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  const preview = extracted.slice(0, 400);
  const error = new Error(
    `Die KI-Antwort war kein gültiges JSON. ${lastError?.message || "Unbekannter JSON-Fehler"}`
  );
  error.preview = preview;
  error.originalMessage = lastError?.message || "";
  throw error;
}

async function requestOpenAIReport({ targets, userPayload, controller, retry = false }) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: retry ? 0 : 0.1,
      max_output_tokens: retry ? 6500 : 5200,
      input: [
        {
          role: "system",
          content: `${createSystemPrompt(targets)}\n\nWICHTIG: Antworte ausschließlich als gültiges JSON gemäß Schema. Keine Markdown-Blöcke, keine Kommentare, keine zusätzlichen Erklärungen. Alle Arrays müssen syntaktisch korrekt sein.`
        },
        {
          role: "user",
          content: JSON.stringify({
            ...userPayload,
            parserHinweis: retry
              ? "Vorherige Antwort war syntaktisch ungültig. Erzeuge die Analyse erneut, aber kurz, sauber und ausschließlich als gültiges JSON."
              : "Erzeuge ausschließlich gültiges JSON."
          })
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
    const apiError = new Error(data?.error?.message || "Unbekannter OpenAI Fehler");
    apiError.status = response.status || 500;
    apiError.data = data;
    throw apiError;
  }

  const outputText = extractOutputText(data);

  if (!outputText) {
    const emptyError = new Error("OpenAI hat keine auswertbare Textantwort zurückgegeben.");
    emptyError.status = 500;
    emptyError.data = data;
    throw emptyError;
  }

  return { data, outputText };
}

export async function POST(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

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
    const consent = body?.consent || {};

    if (!consent.aiAccepted || !consent.privacyAccepted) {
      return Response.json(
        {
          error: "Einwilligung fehlt",
          details: "Bitte bestätige die KI- und Datenschutzhinweise, bevor du die Analyse startest."
        },
        { status: 400 }
      );
    }

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

    let report;

    try {
      const { outputText } = await requestOpenAIReport({ targets, userPayload, controller, retry: false });
      report = parseJsonReport(outputText);
    } catch (firstError) {
      const isJsonParseError =
        firstError?.message?.includes("gültiges JSON") ||
        firstError?.message?.includes("JSON") ||
        firstError instanceof SyntaxError;

      if (!isJsonParseError || firstError?.status) {
        console.error("OpenAI Fehler:", firstError?.data || firstError);

        return Response.json(
          {
            error: firstError?.status ? "OpenAI Anfrage fehlgeschlagen" : "Keine gültige Antwort",
            details: firstError?.message || "Unbekannter OpenAI Fehler"
          },
          { status: firstError?.status || 500 }
        );
      }

      console.warn("JSON Parse Fehler, starte einmaligen Retry:", firstError?.message, firstError?.preview || "");

      const { outputText: retryOutputText } = await requestOpenAIReport({
        targets,
        userPayload,
        controller,
        retry: true
      });

      report = parseJsonReport(retryOutputText);
    }

    report.sollZustand = targets.sollZustand;
    report.berechnungslogik = targets.berechnungslogik;
    report.differenz = calculateDifference(report.istZustand, targets.sollZustand);
    report.makroPlausibilitaet = buildMacroPlausibility(report.istZustand, targets.sollZustand);
    if (report.makroPlausibilitaet?.status === "unscharf") {
      report.schaetzHinweis = [report.schaetzHinweis, report.makroPlausibilitaet.hinweis]
        .filter(Boolean)
        .join(" ");
    }
    report.fahrplanZiel = buildFahrplanZiel(report.differenz);
    report.fahrplanWochenziel = buildFahrplanWochenziel(report.differenz);
    report = buildDeterministicTenStepPlan(report, days);
    report.fahrplanWirkung = buildFahrplanWirkung(report.differenz, report.zehnSchrittePlan);
    report.fahrplanBilanz = buildFahrplanBilanz(report.differenz, report.fahrplanWirkung);
    report = sanitizePotentialItems(report);
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
