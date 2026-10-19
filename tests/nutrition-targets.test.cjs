const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { test, before } = require("node:test");

// Exercise the route's actual pure functions without making paid model requests.
const source = readFileSync("app/api/analyze/route.js", "utf8");
let context;
let calculate;
before(async () => {
  const profileRules = await import("../app/api/analyze/user-profile.mjs");
  context = vm.createContext({ process, console, profileRules, structuredClone });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, ""), context);
  calculate = context.calculateNutritionTargets;
});
const profile = {
  age: "70", height: "178", weight: "68", targetWeight: "70",
  gender: "m", goal: "Muskelaufbau", dietType: "Keto", activityLevel: "1.5"
};

test("reported muscle gain + keto profile preserves protein and positive energy balance", () => {
  const result = calculate(profile);
  assert.equal(result.error, undefined);
  assert.equal(result.goal, "zunehmen");
  assert.equal(result.sollZustand.protein, 120);
  assert.equal(result.sollZustand.kcal, 2350);
  assert.ok(result.sollZustand.kcal >= result.berechnungslogik.tdee + 140);
  assert.ok(result.sollZustand.kohlenhydrate <= 50);
  assert.match(result.berechnungslogik.hinweis, /keine Ketose/);
});

test("muscle gain remains above maintenance for each supported activity and sex", () => {
  for (const gender of ["m", "w", "divers"]) {
    for (const activityLevel of ["1.2", "1.35", "1.5", "1.65", "1.8", "2.2"]) {
      for (const dietType of ["Keto", "Low Carb", "Mischkost"]) {
        const result = calculate({ ...profile, gender, activityLevel, dietType });
        assert.equal(result.error, undefined);
        assert.ok(result.sollZustand.kcal > result.berechnungslogik.tdee);
        assert.ok(result.sollZustand.protein >= 1.6 * 68);
        const { kcal, protein, fett, kohlenhydrate } = result.sollZustand;
        assert.ok(Math.abs(kcal - (4 * protein + 9 * fett + 4 * kohlenhydrate)) <= 50);
      }
    }
  }
});

test("rejects implausible, malformed and nonfinite body data", () => {
  for (const [field, value] of [
    ["weight", "6.8"], ["weight", "6/8"], ["weight", "-68"],
    ["weight", Infinity], ["weight", "68 kg 70 kg"], ["height", "1,78"],
    ["age", "17"], ["age", ""], ["targetWeight", "unknown"]
  ]) {
    assert.ok(calculate({ ...profile, [field]: value }).error, `${field}: ${value}`);
  }
  assert.equal(calculate({ ...profile, weight: "68,0 kg", height: "178 cm" }).error, undefined);
});

test("rejects conflicting goals and target weights", () => {
  assert.ok(calculate({ ...profile, goal: "Muskelaufbau und Fettverlust" }).error);
  assert.ok(calculate({ ...profile, targetWeight: "65" }).error);
  assert.ok(calculate({ ...profile, goal: "Abnehmen" }).error);
  const loss = calculate({ ...profile, goal: "Abnehmen", targetWeight: "65" });
  assert.ok(loss.sollZustand.kcal < loss.berechnungslogik.tdee);
});

test("dislikes and negated diet preferences do not enable keto", () => {
  assert.equal(calculate({ ...profile, dietType: "Mischkost", dislikes: "Keto" }).dietStrategy, "standard");
  assert.equal(calculate({ ...profile, dietType: "kein Keto" }).dietStrategy, "standard");
  assert.equal(calculate({ ...profile, dietType: "nicht ketogen, sondern Low Carb" }).dietStrategy, "low_carb");
  assert.equal(calculate({ ...profile, dietType: "Low Carb" }).dietStrategy, "low_carb");
});

test("report explanation distinguishes intake reduction from a maintenance deficit", () => {
  const targets = calculate(profile);
  const report = {
    ...targets,
    differenz: { kcal: 1050 }
  };
  const text = context.buildEnergyExplanation(report);
  assert.match(text, /2350 kcal/);
  assert.match(text, /120 g Protein/);
  assert.match(text, /1050 kcal über/);
  assert.match(text, /kein Defizit gegenüber dem Erhaltungsbedarf/);
});

test("plan guard blocks energy reductions below maintenance and keto carbohydrate increases", () => {
  const targets = calculate(profile);
  const report = {
    ...targets,
    istZustand: { kcal: 2300, kohlenhydrate: 50 },
    zehnSchrittePlan: ["Tagesdurchschnitt: -200 kcal, 0 g Protein, -20 g Fett, 0 g Kohlenhydrate"]
  };
  assert.match(context.validatePlanGoalConsistency(report), /Erhaltungsbedarf/);
  report.istZustand.kcal = 3000;
  assert.equal(context.validatePlanGoalConsistency(report), null);
  report.zehnSchrittePlan = ["Tagesdurchschnitt: +100 kcal, 0 g Protein, 0 g Fett, +25 g Kohlenhydrate"];
  assert.match(context.validatePlanGoalConsistency(report), /Keto/);
});
