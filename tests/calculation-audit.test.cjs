const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
let ledgerRules, profileRules, verifiedPlan;
const source = readFileSync('app/api/analyze/route.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const exampleDays = vm.runInNewContext(readFileSync('app/page.js', 'utf8').match(/const exampleDays = ([\s\S]*?\n\]);/)[1]);
const veganDay = {
  breakfast: '70 g Haferflocken mit 250 ml ungesüßtem Sojadrink und 100 g Beeren',
  lunch: '200 g gekochter Vollkornreis, 200 g verzehrfertige Linsen aus der Konserve, 200 g Brokkoli, 10 g Olivenöl',
  dinner: '200 g Naturtofu, 100 g Vollkornbrot, 200 g Tomaten und Gurken',
  snacks: '30 g Mandeln und 1 Apfel ca. 150 g', drinks: '2 l Wasser'
};
const baseForm = { age: '31', height: '180', weight: '85', targetWeight: '78', gender: 'm', goal: 'Abnehmen', activityLevel: 'moderat aktiv', dietType: 'Mischkost', intolerances: '', dislikes: '', cookingTime: '10 Minuten' };
const model = { ernaehrungsrealitaet: 'Eine protokollierte Woche.', problemMuster: [{ muster: 'Wochenstruktur', beobachtung: 'Verschiedene Mahlzeiten wurden erfasst.', hebel: 'Nutze den geprüften Fahrplan.' }] };
const consent = { aiAccepted: true, privacyAccepted: true };
before(async () => {
  ledgerRules = await import('../app/api/analyze/nutrition-ledger.mjs');
  profileRules = await import('../app/api/analyze/user-profile.mjs');
  verifiedPlan = await import('../app/api/analyze/verified-plan.mjs');
});
function route(fetchImpl = async () => Response.json({ output_text: JSON.stringify(model) })) {
  const context = vm.createContext({ process: { env: { OPENAI_API_KEY: 'test-placeholder' } }, console, ledgerRules, profileRules, verifiedPlan, structuredClone, Response, AbortController, setTimeout, clearTimeout, fetch: fetchImpl });
  vm.runInContext(source, context);
  return context;
}
async function analyze(form = baseForm, days = exampleDays, fetchImpl) {
  const response = await route(fetchImpl).POST({ json: async () => ({ form, days, consent }) });
  return { status: response.status, body: await response.json() };
}

test('all built-in example meals parse; the four cola portions total exactly 1200 ml / 504 kcal', () => {
  const result = ledgerRules.buildNutritionLedger(exampleDays);
  assert.deepEqual(result.issues, []);
  const cola = result.entries.filter(entry => entry.food.id === 'cola');
  assert.equal(cola.reduce((sum, entry) => sum + entry.amount, 0), 1200);
  assert.equal(cola.reduce((sum, entry) => sum + entry.kcal, 0), 504);
  assert.ok(Math.abs(result.daily.kcal - (4 * result.daily.protein + 9 * result.daily.fett + 4 * result.daily.kohlenhydrate)) < 1);
});

test('drink amounts stay with the named drink across ordering, decimal commas, suffixes and zero variants', () => {
  for (const text of ['500 ml Cola, 2 l Wasser', '2 l Wasser, 500 ml Cola', 'Cola 500 ml, Wasser 2 l', '2 l Wasser und 0,5 l Cola', '200 ml Cola, 300 ml Cola, 2 l Wasser']) {
    const parsed = ledgerRules.parseMeal(text);
    assert.deepEqual(parsed.issues, [], text);
    assert.equal(parsed.entries.reduce((sum, entry) => sum + entry.kcal, 0), 210, text);
  }
  for (const text of ['500 ml Cola Zero, 2 l Wasser', '500 ml Cola ohne Zucker, 2 l Wasser', '2 Kaffee ohne Zucker']) {
    assert.equal(ledgerRules.parseMeal(text).entries.reduce((sum, entry) => sum + entry.kcal, 0), 0, text);
  }
});

test('explicit grams override piece estimates; ranges are counted once; wrong units and unknown foods stop calculation', () => {
  for (const text of ['2 Scheiben Brot ca. 100 g', 'Brot 100 g', '100 g Brot']) {
    const parsed = ledgerRules.parseMeal(text);
    assert.deepEqual(parsed.issues, []);
    assert.equal(parsed.entries[0].amount, 100);
  }
  const range = ledgerRules.parseMeal('200–400 ml Cola');
  assert.equal(range.entries[0].amount, 300);
  assert.equal(range.entries.length, 1);
  for (const text of ['50 g Unbekanntes, 2 l Wasser', '100 g Reis', '500 g Cola', '100 g Brot und 100 g unbekannte Beilage', '-50 g Brot', '1.000 ml Cola']) assert.ok(ledgerRules.parseMeal(text).issues.length, text);
  assert.equal(ledgerRules.parseMeal('100 g Reis roh').entries[0].kcal, 349.5);
  assert.equal(ledgerRules.parseMeal('100 g Reis gekocht').entries[0].kcal, 129.1);
});

test('incomplete weeks, underweight loss, unsafe target weights, and minors stop before model calls', async () => {
  let calls = 0;
  const mock = async () => { calls++; throw new Error('Should not call'); };
  const cases = [
    [baseForm, exampleDays.slice(0, 6)],
    [baseForm, [...exampleDays.slice(0, 6), {}]],
    [{ ...baseForm, age: '28', gender: 'w', height: '170', weight: '47', targetWeight: '44' }, exampleDays],
    [{ ...baseForm, height: '170', weight: '65', targetWeight: '50' }, exampleDays],
    [{ ...baseForm, age: '14' }, exampleDays]
  ];
  for (const [form, days] of cases) {
    const result = await analyze(form, days, mock);
    assert.equal(result.status, 400, JSON.stringify(result.body));
  }
  assert.equal(calls, 0);
});

test('unknown foods cannot produce a misleading complete report', async () => {
  const days = exampleDays.map(day => ({ ...day }));
  days[3].lunch = '350 g Unbekanntes Mittagessen';
  const result = await analyze(baseForm, days, () => { throw new Error('Should not call model'); });
  assert.equal(result.status, 422);
  assert.match(result.body.details, /Tag 4, Mittagessen/);
  assert.equal(result.body.report, undefined);
});

test('all six goals, body profiles and strategies keep identical intake and an honest cumulative plan', async () => {
  const profiles = [
    ...['Abnehmen', 'Gewicht halten', 'Muskelaufbau', 'mehr Energie', 'bessere Struktur', 'Regeneration verbessern'].map(goal => ({ ...baseForm, goal, targetWeight: goal === 'Muskelaufbau' ? '90' : goal === 'Abnehmen' ? '78' : '85' })),
    { ...baseForm, age: '45', height: '165', weight: '70', targetWeight: '65', gender: 'w', activityLevel: 'sitzend' },
    { ...baseForm, age: '60', height: '170', weight: '110', targetWeight: '95', activityLevel: 'sitzend' },
    { ...baseForm, activityLevel: 'sehr aktiv' },
    { ...baseForm, dietType: 'Keto' },
    { ...baseForm, dietType: 'Low Carb' },
    { ...baseForm, weight: '85,5', targetWeight: '78,5' },
    { ...baseForm, intolerances: 'Milcheiweißallergie, Sojaallergie, Fischallergie, Nussallergie', dislikes: 'Milchprodukte, Soja, Fisch, Nüsse', cookingTime: '1 Minute' }
  ];
  const expected = ledgerRules.buildNutritionLedger(exampleDays).daily;
  for (const form of profiles) {
    const { status, body } = await analyze(form);
    assert.equal(status, 200, `${JSON.stringify(form)}: ${JSON.stringify(body)}`);
    const report = body.report;
    for (const key of ledgerRules.METRICS) assert.equal(report.istZustand[key], expected[key]);
    const solver = report.fahrplanSolverStatus;
    assert.ok(verifiedPlan.safeEnergyDirection(solver.geplanteTageswirkung, solver.zielTageswirkung));
    assert.equal(solver.zielkorridorErreicht, verifiedPlan.planWithinCorridor(solver.geplanteTageswirkung, solver.zielTageswirkung) && (report.userProfile.dietStrategy !== "keto" || report.istZustand.kohlenhydrate + solver.geplanteTageswirkung.kohlenhydrate <= 50));
    assert.equal(report.fahrplanWirkung.ausgewerteteSchritte, report.zehnSchrittePlan.length);
    if (!solver.zielkorridorErreicht) assert.match(report.fahrplanBilanz, /Teilplan/);
    for (const item of solver.profilPruefung || []) {
      assert.ok(item.zubereitungszeitMinuten <= report.userProfile.maxPrepMinutes);
      assert.ok(item.lebensmittelIds.every(id => profileRules.foodIsAllowed(ledgerRules.INTAKE_FOODS.find(food => food.id === id), { ...report.userProfile, dietStrategy: "standard" })));
    }
  }
});

test('vegan order-control cases have identical intake and plan effects; no sweet-to-savory replacements', async () => {
  const form = { ...baseForm, age: '35', gender: 'w', height: '165', weight: '60', targetWeight: '60', goal: 'Gewicht halten', dietType: 'vegan' };
  const reports = [];
  for (const drinks of ['500 ml Cola, 2 l Wasser', '2 l Wasser, 500 ml Cola']) {
    const { body, status } = await analyze(form, Array.from({ length: 7 }, () => ({ ...veganDay, drinks })));
    assert.equal(status, 200, JSON.stringify(body));
    reports.push(body.report);
    assert.doesNotMatch(body.report.zehnSchrittePlan.join(' '), /(?:Schokolade|Chips|Haferflocken|Joghurt).*durch.*(?:Thunfisch|Linsen|Tofu)/);
    assert.equal(body.report.lebensmittelAnalyse.find(item => item.lebensmittel === 'Cola / Limonade').kcal, 1470);
  }
  assert.deepEqual(reports[0].istZustand, reports[1].istZustand);
  assert.deepEqual(reports[0].fahrplanSolverStatus.geplanteTageswirkung, reports[1].fahrplanSolverStatus.geplanteTageswirkung);
});

test('near-target plans may have zero changes; gain plans cannot run in the loss direction', () => {
  const context = route();
  const fake = effect => ({ key: String(effect), weeklyEffect: { kcal: effect * 7 }, dailyEffect: { kcal: effect, protein: 0, fett: 0, kohlenhydrate: 0 }, sourceIds: [String(effect)] });
  const target = { kcal: -30, protein: 0, fett: 0, kohlenhydrate: 0 };
  assert.equal(context.selectBestTenCumulativeCandidatesV38([fake(-197)], target).length, 0);
  assert.equal(context.selectBestTenCumulativeCandidatesV38([fake(-41)], { ...target, kcal: 150 }).length, 0);
});

test('malformed and structurally invalid model output retries once and never leaks syntax errors or rewrites intake', async () => {
  for (const invalid of ['{broken', JSON.stringify({ ernaehrungsrealitaet: 'x', problemMuster: null })]) {
    let calls = 0;
    const { status, body } = await analyze(baseForm, exampleDays, async () => Response.json({ output_text: ++calls === 1 ? invalid : JSON.stringify({ ...model, istZustand: { kcal: 99999 } }) }));
    assert.equal(calls, 2);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.report.istZustand.kcal, 1907.5);
  }
  let calls = 0;
  const { status, body } = await analyze(baseForm, exampleDays, async () => { calls++; return Response.json({ output_text: '{broken' }); });
  assert.equal(status, 500);
  assert.equal(calls, 2);
  assert.match(body.details, /Eingaben bleiben erhalten/);
  assert.doesNotMatch(body.details, /JSON|position|Syntax/);
});
