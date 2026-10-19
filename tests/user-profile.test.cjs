const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { test, before } = require("node:test");

let rules;
const routeSource = readFileSync("app/api/analyze/route.js", "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
function loadRoute(fetchImpl) {
  const context = vm.createContext({
    process: { env: { OPENAI_API_KEY: "mock-key-not-real" } }, console,
    profileRules: rules, structuredClone, Response, AbortController, setTimeout, clearTimeout,
    fetch: fetchImpl || (() => { throw new Error("Unexpected network call"); })
  });
  vm.runInContext(routeSource, context);
  return context;
}
before(async () => { rules = await import("../app/api/analyze/user-profile.mjs"); });

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

test("catalog swaps remove the recorded source and recompute their actual nutrient difference", () => {
  const { profile, targets } = profileFor({ goal: "Abnehmen", targetWeight: "65", dietType: "Mischkost", intolerances: "Milchallergie", cookingTime: "3 Minuten" });
  const report = { ...targets, userProfile: profile, differenz: { kcal: 500, protein: -30, fett: 30, kohlenhydrate: 50 } };
  const candidates = rules.buildProfileCandidateConfigs([{ tag: 1, snacks: "50 g Schokolade" }], report);
  const tofu = candidates.find(candidate => candidate.targetFoodIds[0] === "tofu");
  assert.ok(tofu);
  assert.ok(Math.abs(tofu.weeklyEffect.kcal - (-49)) < 0.001);
  assert.equal(tofu.weeklyEffect.protein, 20.5);
  assert.match(tofu.action, /50 g Schokolade durch 150 g Verzehrfertiger Naturtofu/);
  assert.ok(candidates.every(candidate => rules.candidateFitsProfile(candidate, profile)));
  assert.ok(candidates.every(candidate => !candidate.targetFoodIds.includes("skyr")));
  assert.equal(rules.buildProfileCandidateConfigs([{ tag: 1, snacks: "Schokolade ohne Mengenangabe" }], report).length, 0);
});

test("candidate validation rejects missing metadata, unknown foods and excessive preparation times", () => {
  const profile = profileFor({ cookingTime: "1 Minute" }).profile;
  assert.equal(rules.candidateFitsProfile({ action: "Iss Quark" }, profile), false);
  assert.equal(rules.candidateFitsProfile({ targetFoodIds: ["imaginary_food"], prepMinutes: 1 }, profile), false);
  assert.equal(rules.candidateFitsProfile({ targetFoodIds: ["tofu"], prepMinutes: 3 }, profile), false);
  assert.equal(rules.candidateFitsProfile({ targetFoodIds: ["skyr"], prepMinutes: 1 }, profile), true);
});

test("repeated identical swaps form one weekly habit with a summed nutrient effect", () => {
  const { profile, targets } = profileFor({ goal: "Abnehmen", targetWeight: "65", intolerances: "Milchallergie", cookingTime: "3 Minuten" });
  const report = { ...targets, userProfile: profile, differenz: { kcal: 500, protein: -30, fett: 30, kohlenhydrate: 50 } };
  const days = Array.from({ length: 7 }, (_, index) => ({ tag: index + 1, snacks: "50 g Schokolade" }));
  const candidates = rules.buildProfileCandidateConfigs(days, report);
  const tofu = candidates.filter(candidate => candidate.targetFoodIds[0] === "tofu");
  assert.equal(tofu.length, 1);
  assert.equal(tofu[0].days.length, 7);
  assert.ok(Math.abs(tofu[0].weeklyEffect.kcal - (-343)) < 0.001);
});

test("the actual solver uses the profile pool and preserves the verified action text", () => {
  const context = loadRoute();
  const { profile, targets } = profileFor({ intolerances: "Milchallergie", cookingTime: "3 Minuten" });
  const report = { ...targets, userProfile: profile, istZustand: { kcal: 2500, protein: 60, fett: 150, kohlenhydrate: 100 } };
  report.differenz = context.calculateDifference(report.istZustand, targets.sollZustand);
  const days = [{ tag: 1, breakfast: "", lunch: "", dinner: "", snacks: "50 g Schokolade", drinks: "" }];
  const target = Object.fromEntries(Object.entries(report.differenz).map(([key, value]) => [key, -value]));
  const pool = context.buildCumulativeCandidatesV38(days, report, target);
  assert.ok(pool.length);
  assert.ok(pool.every(candidate => rules.candidateFitsProfile(candidate, profile)));
  const result = context.buildDeterministicTenStepPlan(report, days);
  assert.ok(result.zehnSchrittePlan.length);
  assert.match(result.zehnSchrittePlan[0], /Zubereitungszeit/);
  assert.doesNotMatch(result.zehnSchrittePlan.join(" "), /Skyr|Magerquark|Frischkäse/);
});

test("model receives the shared profile; returned recommendation text is constrained before publication", async () => {
  let captured;
  const modelReport = {
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
    days: [{ snacks: "50 g Schokolade" }], consent: { aiAccepted: true, privacyAccepted: true }
  }) });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const payload = JSON.parse(captured.input[1].content);
  assert.deepEqual(payload.nutzerprofil.allergens, ["milk"]);
  assert.equal(payload.nutzerprofil.maxPrepMinutes, 3);
  assert.ok(!captured.text.format.schema.properties.stabileBausteine.items.properties.lebensmittel.enum.includes("Skyr natur"));
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
    form: { ...form, intolerances: "Histaminintoleranz" }, days: [{ snacks: "50 g Schokolade" }],
    consent: { aiAccepted: true, privacyAccepted: true }
  }) });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});
