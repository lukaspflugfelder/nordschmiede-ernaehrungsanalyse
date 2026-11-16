const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { test, before } = require("node:test");

let rules, ledgerRules, verifiedPlan;
const routeSource = readFileSync("app/api/analyze/route.js", "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
function loadRoute(fetchImpl) {
  const context = vm.createContext({
    process: { env: { OPENAI_API_KEY: "mock-key-not-real" } }, console,
    profileRules: rules, ledgerRules, verifiedPlan, structuredClone, Response, AbortController, setTimeout, clearTimeout,
    fetch: fetchImpl || (() => { throw new Error("Unexpected network call"); })
  });
  vm.runInContext(routeSource, context);
  return context;
}
before(async () => {
 rules = await import("../app/api/analyze/user-profile.mjs");
 ledgerRules = await import("../app/api/analyze/nutrition-ledger.mjs");
 verifiedPlan = await import("../app/api/analyze/verified-plan.mjs");
});

const form = {
  age: "70", height: "178", weight: "68", targetWeight: "70", gender: "m",
  goal: "Muskelaufbau", activityLevel: "1.5", dietType: "Keto",
  intolerances: "keine", dislikes: "keine", cookingTime: "maximal 15 Minuten pro Mahlzeit"
};
function profileFor(overrides = {}) {
  const input = { ...form, ...overrides };
  const targets = loadRoute().calculateNutritionTargets(input);
  assert.equal(targets.error, undefined);
  return { ...rules.buildUserProfile(input, targets), targets, input };
}

test("profile combines body, equation sex, goal, keto, allergies and preparation limit", () => {
  const { profile, errors } = profileFor({ intolerances: "Milcheiweißallergie und Erdnüsse", dislikes: "Tomaten, Pilze", cookingTime: "max. 10–15 Minuten" });
  assert.deepEqual(errors, []);
  assert.equal(profile.body.age, 70);
  assert.equal(profile.body.weightKg, 68);
  assert.equal(profile.body.sexForEquation, "männlich");
  assert.equal(profile.goal, "zunehmen");
  assert.equal(profile.dietStrategy, "keto");
  assert.equal(profile.maxPrepMinutes, 15);
  assert.ok(profile.allergens.includes("milk"));
  assert.ok(profile.allergens.includes("peanuts"));
  assert.ok(profile.excludedTags.includes("tomato"));
  assert.ok(profile.excludedTags.includes("mushrooms"));
  assert.equal(profile.targets.protein, 120);
});

test("milk protein allergy and lactose intolerance have different exclusions", () => {
  const milk = profileFor({ intolerances: "Milcheiweißallergie" }).profile;
  const lactose = profileFor({ intolerances: "Laktoseintoleranz" }).profile;
  const regular = rules.FOOD_CATALOG.find(food => food.id === "skyr");
  const lactoseFree = rules.FOOD_CATALOG.find(food => food.id === "skyr_lf");
  assert.equal(rules.foodIsAllowed(regular, milk), false);
  assert.equal(rules.foodIsAllowed(lactoseFree, milk), false);
  assert.equal(rules.foodIsAllowed(regular, lactose), false);
  assert.equal(rules.foodIsAllowed(lactoseFree, lactose), true);
});

test("unknown medical restrictions remain an explicit validation error", () => {
  const { errors } = profileFor({ intolerances: "Milchallergie, Histaminintoleranz" });
  assert.ok(errors.length > 0);
  assert.match(errors.join(" "), /histamin/i);
  assert.deepEqual(profileFor({ intolerances: "keine Allergien außer Soja" }).profile.allergens, ["soy"]);
  assert.deepEqual(profileFor({ intolerances: "keine Milchallergie" }).profile.allergens, []);
});

test("common compound allergen names are recognized without leaving unmatched fragments", () => {
  for (const [input, tag] of [["Haselnussallergie", "nuts"], ["Walnüsse", "nuts"], ["Erdnüsse", "peanuts"], ["Tintenfisch", "molluscs"], ["Hühnerei", "eggs"], ["Zöliakie", "gluten"], ["Sesam", "sesame"]]) {
    const { profile, errors } = profileFor({ intolerances: input });
    assert.deepEqual(errors, [], input);
    assert.ok(profile.allergens.includes(tag), input);
  }
});

test("time parser handles ranges and hours and rejects ambiguous budgets", () => {
  for (const [input, expected] of [["0", 0], ["10-20 Minuten", 20], ["0,5 Stunden", 30], ["eine halbe Stunde", 30], ["maximal 5 min pro Mahlzeit", 5]]) {
    assert.equal(rules.parseCookingTime(input).minutes, expected, input);
  }
  for (const input of ["schnell", "10 morgens 20 abends", "10 15 Minuten", "-5 min", "300 Minuten"]) {
    assert.ok(rules.parseCookingTime(input).error, input);
  }
});

test("diet restrictions and specific dislikes constrain foods independently", () => {
  const vegan = profileFor({ dietType: "vegan Keto", intolerances: "Sojaallergie" }).profile;
  assert.equal(rules.allowedProteinFoods(vegan).length, 0);
  const glutenFree = profileFor({ dietType: "glutenfrei und laktosefrei" }).profile;
  assert.ok(glutenFree.excludedTags.includes("gluten"));
  assert.ok(glutenFree.excludedTags.includes("lactose"));
  const noSkyr = profileFor({ dislikes: "Ich mag keinen Skyr" }).profile;
  assert.equal(rules.foodIsAllowed(rules.FOOD_CATALOG.find(food => food.id === "skyr"), noSkyr), false);
  assert.equal(rules.foodIsAllowed(rules.FOOD_CATALOG.find(food => food.id === "tofu"), noSkyr), true);
  const noTofu = profileFor({ dislikes: "keine Tofuprodukte" }).profile;
  assert.equal(rules.foodIsAllowed(rules.FOOD_CATALOG.find(food => food.id === "tofu"), noTofu), false);
});

test("explicit constraints in other text fields are not lost", () => {
  const { profile, errors } = profileFor({ dietType: "vegan, Sojaallergie", goal: "Muskelaufbau mit Keto" });
  assert.deepEqual(errors, []);
  assert.equal(profile.dietStrategy, "keto");
  assert.equal(profile.dietaryPattern, "vegan");
  assert.ok(profile.allergens.includes("soy"));
  assert.equal(rules.allowedProteinFoods(profile).length, 0);
  const noAnimals = profileFor({ dislikes: "keine tierischen Produkte" }).profile;
  assert.ok(rules.allowedProteinFoods(noAnimals).every(food => !food.tags.includes("fish") && !food.tags.includes("milk")));
  assert.ok(profileFor({ dietType: "Histaminintoleranz" }).errors.length);
  assert.ok(profileFor({ dietType: "kein Keto", goal: "Muskelaufbau mit Keto" }).errors.length);
  assert.ok(profileFor({ dietType: "Keto", goal: "Muskelaufbau ohne Keto" }).errors.length);
});

test("candidate validation rejects missing metadata, unknown foods and excessive preparation times", () => {
  const profile = profileFor({ cookingTime: "1 Minute" }).profile;
  assert.equal(rules.candidateFitsProfile({ action: "Iss Quark" }, profile), false);
  assert.equal(rules.candidateFitsProfile({ targetFoodIds: ["imaginary_food"], prepMinutes: 1 }, profile), false);
  assert.equal(rules.candidateFitsProfile({ targetFoodIds: ["tofu"], prepMinutes: 3 }, profile), false);
  assert.equal(rules.candidateFitsProfile({ targetFoodIds: ["skyr"], prepMinutes: 1 }, profile), true);
});

test("model receives the shared profile; returned recommendation text is constrained before publication", async () => {
  let captured;
  const modelReport = {
    ernaehrungsrealitaet: "Eine wiederkehrende Woche.",
    istZustand: { kcal: 2500, protein: 60, fett: 150, kohlenhydrate: 100 },
    problemMuster: [{ muster: "Snack", beobachtung: "Schokolade wurde protokolliert.", hebel: "Iss Skyr" }],
    lebensmittelAnalyse: [{ lebensmittel: "Schokolade", bewertung: "stabil", einordnung: "Iss mehr davon" }],
    topKalorienQuellen: [], stabileBausteine: [{ lebensmittel: "Skyr natur", begruendung: "Iss Milchprodukte", hinweis: "" }],
    naechsteKonkreteAenderung: "Iss Skyr", zusammenfassung: "Defizit 1050 kcal", schaetzHinweis: "Mengen geschätzt."
  };
  const context = loadRoute(async (_url, options) => {
    captured = JSON.parse(options.body);
    return Response.json({ output_text: JSON.stringify(modelReport) });
  });
  const response = await context.POST({ json: async () => ({
    form: { ...form, intolerances: "Milchallergie", cookingTime: "3 Minuten" },
    days: Array.from({ length: 7 }, () => ({ snacks: "50 g Schokolade" })), consent: { aiAccepted: true, privacyAccepted: true }
  }) });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const payload = JSON.parse(captured.input[1].content);
  assert.deepEqual(payload.nutzerprofil.allergens, ["milk"]);
  assert.equal(payload.nutzerprofil.maxPrepMinutes, 3);
  assert.equal(captured.text.format.strict, true);
  assert.equal(captured.text.format.schema.properties.istZustand, undefined);
  assert.equal(body.report.stabileBausteine.length, 0);
  assert.doesNotMatch(body.report.problemMuster[0].hebel, /Skyr/);
  assert.doesNotMatch(body.report.lebensmittelAnalyse[0].einordnung, /Iss mehr/);
  assert.match(body.report.zusammenfassung, /kein Defizit/);
  assert.equal(body.report._calculationVersion, rules.PROFILE_VERSION);
});

test("unrecognized restrictions stop before any model request", async () => {
  let calls = 0;
  const context = loadRoute(async () => { calls += 1; throw new Error("Must not call model"); });
  const response = await context.POST({ json: async () => ({
    form: { ...form, intolerances: "Histaminintoleranz" }, days: Array.from({ length: 7 }, () => ({ snacks: "50 g Schokolade" })),
    consent: { aiAccepted: true, privacyAccepted: true }
  }) });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});
