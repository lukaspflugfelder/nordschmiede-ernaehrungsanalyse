# Nutrition target safeguards

The reported failure was 1250 kcal, 10 g protein, 110 g fat and 50 g
carbohydrate for age 70, height 178 cm, weight 68 kg, target 70 kg, muscle gain
and keto. Those macros total 1230 kcal, so an energy consistency check alone
cannot detect the inappropriate target. Body data, goal and protein must also
be checked. The original PDF attachment was not available in this checkout;
the reported values are the reproduction reference, not proof of a particular
historical input or deployment version.

Main already included body-range validation and input-signature invalidation
before this change. A valid 68 kg muscle-gain input does not reproduce 10 g
protein in that implementation. The exact historical cause is not established.

## Current behavior

- Body inputs must contain one finite number with an optional supported unit.
  Height is entered in cm. Ambiguous values such as `6/8` are rejected rather
  than silently converted to 68. Existing adult/range checks remain in force.
- Conflicting gain/loss goals or a target weight opposing the selected goal
  return a validation error. The app requires an explicit primary goal.
- Muscle gain uses the existing 7% surplus (150-400 kcal), rounded upward to
  50 kcal. Protein remains 1.8 g/kg current weight with a 1.6 g/kg safety check.
- Keto changes carbohydrate/fat allocation, not the energy goal or protein.
  Only the diet field selects the strategy; dislikes do not select keto.
  Keto and muscle gain can coexist, but ketosis or muscle gain is not guaranteed.
- The energy in target macros must agree with target calories within 50 kcal
  (the existing 5 g macro rounding permits small differences).
- A plan that reduces intake below maintenance during muscle gain, or increases carbohydrate
  above the keto limit, is rejected rather than presented as actionable advice.
- Report summary and core explanation use server-calculated numbers. The model
  prompt explicitly distinguishes intake changes from maintenance deficits.
  The PDF uses the same report data and explanation as the browser.
- Saved reports require both a matching input signature and calculation version.
  Old calculations are discarded while entered profile/diary data are retained.

Example with male formula and activity factor 1.5: BMR 1447.5 kcal,
maintenance 2171.25 kcal, gain target rounded upward to 2350 kcal,
protein 120 g. Sex and activity are needed to specify a calorie target;
2350 kcal is not a universal prescription for the reported profile.

An intake reduction of 1050 kcal can be appropriate if prior intake exceeds
the gain target by that amount. It must never be described as a 1050 kcal
deficit relative to maintenance.

## Evidence and limits

The existing 1.8 g/kg protein target is within the sports-nutrition range.
Protein should not be reduced merely to raise the percentage of keto fat.
The ISSN position statement discusses adequate protein and the limitations
of ketogenic diets for performance and body-composition interpretation:
https://pubmed.ncbi.nlm.nih.gov/38934469/ (2024).

Energy equations and food-diary estimates remain approximations. Older age,
medical conditions and individual training response require individualized
assessment; this calculation is not clinical nutrition therapy.

Run `npm test` for profile, validation, conflict, macro-energy, report wording,
and plan-direction regression checks. No paid model call is required.
