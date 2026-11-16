# Calculation audit fixes — 16 November 2026

The production baseline was commit `3f62a674109203651a1e1032d338c22dd2b507a9`.
This change replaces model-estimated intake and the old substitution/forced-count
planner with a shared, deterministic item ledger. Existing body target formulas,
consents, free access, branding and daily check-in persistence are preserved.

## Calculation contract

- A quantity belongs to its food mention, not the closest number in an entire
  text field. Explicit weights override piece estimates; decimal commas, ranges,
  litres, millilitres and common household portions are handled explicitly.
- Intake is the sum of food portions across seven days divided by seven. The
  body profile, selected goal and model response cannot change the intake sum.
- Intake and proposed changes use the same generic per-100-g/ml estimates.
  Protein/carbohydrate energy uses 4 kcal/g and fat 9 kcal/g. These are approximate
  generic food values, not a branded product database or a clinical assessment.
- Rice and pasta require explicit raw/dry or cooked weights. Unknown foods,
  unmatched quantities and incompatible units return a specific clarification
  error; the app never silently treats missing foods as zero calories.
- The fixed catalog currently covers the built-in example week and the vegan
  control week. It is intentionally finite. Brand names, alcohol and unsupported
  composite recipes can require individual analysis. Extending coverage must
  preserve ingredient/quantity binding and explicitly documented food values.
- Negative quantities, incomplete weeks and underweight weight-loss profiles are
  rejected before any model call. The adult BMI threshold of 18.5 is a screening
  guard, not a diagnosis: https://www.who.int/data/gho/indicator-metadata-registry/imr-details/4804

## Plan contract

Every selected change has concrete amounts and a recomputed weekly nutrient
effect. Repeated source foods form one habit across the week. Sweet foods are
not arbitrarily replaced by canned fish, tofu or lentils. Additions are explicitly
counted and assigned to breakfast or a savory main meal. Regular and lactose-free
skyr are alternative choices, not two independent extra portions.

The solver compares different step counts, including zero, and selects a safe
combined improvement. Energy cannot move away from the target; a small energy
gap does not force calorie cutting. The operational comparison corridor is
100 kcal, 10 g protein, 10 g fat and 20 g carbohydrate around the requested
change. This is an app tolerance for estimated diaries, not a physiological
guarantee. Keto additionally requires no further carbohydrate increase while
intake is already above 50 g/day; complete coverage requires the final estimate
to be at most 50 g/day. Restrictions remain in effect; reducing a historical
carbohydrate portion is allowed as a partial move toward a low-carb/keto goal.

If a complete compatible plan is unavailable, the result explicitly says
“Teilplan” and shows the remaining calorie and macro gaps. Zero steps render a
clear explanation rather than “Schritt 1 von 0”. No fixed step count is padded.
The balance uses full internal precision; display values are rounded only at
presentation. Browser and PDF consume the same report object.

## Model boundary and saved reports

The model supplies short historical observations only. Its strict response
schema contains no calorie/macro fields, targets, foods to recommend or plan.
The server validates the structure and retries an invalid/incomplete response
once. Errors retain browser inputs and do not expose JSON parser internals.
Model content and user diaries are not written to server logs.

Calculation version `v48_verified_food_ledger` invalidates prior reports while
retaining entered profile and diary data. Old unused solver branches and the
old model-nutrient schema are removed to prevent accidental reuse.

## Regressions

`npm test` covers the real POST handler using a simulated model, all six goals,
different body/activity profiles, decimal inputs, keto/low-carb, vegan controls,
combined allergies and preparation limits, malformed model output and retry
limits. It verifies identical intake across goals and model replies, ledger/plan
consistency, target-direction guards, honest partial results and unknown foods.

Key numeric expectations:

| Case | Expected |
| --- | --- |
| Four cola portions in the built-in week | 1200 ml, 504 kcal/week |
| 500 ml cola + 2 l water, either order | 210 kcal/day, 1470 kcal/week |
| Built-in example week, all body profiles/goals | 1907.5 kcal, 89.7 g protein, 71.0 g fat, 227.5 g carbohydrate/day |
| Vegan control week without cola | 1736.2 kcal, 90.6 g protein, 59.2 g fat, 210.3 g carbohydrate/day |
| 100 g rice dry / cooked | 349.5 / 129.1 kcal in this generic catalog |

These expected values validate reproducibility of the stated catalog, not the
accuracy of any specific real product or a person's reported intake.
