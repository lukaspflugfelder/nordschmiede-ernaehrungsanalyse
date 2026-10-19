# Shared nutrition profile (v47)

Every analysis now builds one profile from the normalized form and validated
calorie/macro targets. The model receives both this profile and the original
field contents in the same request. The planner uses the same profile object;
model output cannot overwrite it.

## What is combined

- Age, height, current/target weight, sex used by the equation, activity factor,
  primary goal and calculated nutrient targets.
- Keto/low-carb strategy and mixed, vegetarian, vegan or pescetarian pattern.
- Recognized food allergens/intolerances, dietary exclusions and dislikes.
- Maximum preparation time, including numeric ranges and hour inputs.

Explicit allergy statements in diet, goal or dislike fields are also considered;
they do not become harmless preferences because of their field placement.
Keto mentioned in the goal is considered alongside the diet field. Explicit
requests for and exclusions of keto return a clarification error.

Allergen rules distinguish milk protein from lactose. Lactose-free dairy remains
excluded for a milk-protein allergy. Compound names such as hazelnut allergy are
recognized. The category rules cover the EU's 14 declared allergen groups, with
lactose represented separately. This is a finite vocabulary, not a diagnosis.
Unknown medical restrictions (for example histamine intolerance), ambiguous
preparation limits and truncated constraint fields return 400 before the model
is called. The application does not silently relax restrictions.

Body values still use the existing explicit number/unit validation. An arbitrary
paragraph in a weight field is not converted into a guessed body weight. An
unidentified sex or activity retains the existing equation/default behavior and
is recorded in the calculation/profile for inspection.

## Recommendations and their effects

For a profile with exclusions, a dietary strategy/pattern or a time limit, the
old unverified substitution templates are replaced by a bounded ingredient
catalog. Available alternatives currently include plain skyr, explicitly
lactose-free skyr, ready-to-eat plain tofu, canned tuna, ready-to-eat lentils,
olive oil and water, subject to the profile's restrictions. This intentionally
does not promise a complete recipe library or support for every medical diet.

Swaps require an explicitly recorded gram quantity and a known source food.
The app calculates the new nutrient effect from the removed portion and the
replacement portion, rather than reusing the nutritional effect of a different
substitution. Repeated identical swaps form one weekly habit, with summed
effects. Additional protein/energy portions are explicitly counted as additions.
Water replacements retain their recorded sugary-drink reduction effects.

Each selected constrained candidate carries allowed target food IDs and an
estimated preparation time. Alternatives sharing an original meal cannot both
be counted as independent replacements of that meal. Keto and muscle-gain plan
direction checks still run on the final combined effect.

Times refer to preparing the suggested portion with the named ready-to-eat
ingredients, not cooking raw ingredients or certifying the duration of the
entire historical meal. Nutrient values are generic estimates. Actual product
ingredients, preparation instructions, allergen labels and possible cross-contact
must be checked for the chosen product; a catalog match is not an allergen-free
product certification.

## Report, browser and PDF

The model's positive food recommendations are restricted to the allowed catalog
names by the response schema and checked again by the server. Historical diary
foods cannot reappear as positive recommendations through a browser fallback.
For constrained profiles, actionable pattern advice and food-analysis notes are
replaced by references to the verified planner; historical entries are labeled
as observations. The model still estimates intake and describes diary patterns.

The browser/PDF show the actual step count. Fewer safe options are not padded
to ten. Incomplete goal coverage is stated explicitly; no available verified
step returns 422. The PDF includes the interpreted profile and removes an empty
second plan page. Persisted reports require the current profile/calculation
version as well as a matching input signature.

## Validation

`npm test` covers combined profiles, milk/lactose, compound allergen names,
unknown constraints, time limits, vegan/keto conflicts, dislikes, recomputed
nutrients, weekly aggregation, the real planner and the POST response with a
simulated model. It does not make a paid model call or test a live deployment.
Browser checks cover desktop/mobile overflow, actual step labels, print layout
and footer separation using a fixture generated through the real POST logic.

Reference for the distinction between food allergy and intolerance and the
limits of ingredient/cross-contact labeling:
https://www.bfr.bund.de/fragen-und-antworten/thema/allergien-die-wichtigsten-fragen-und-antworten-auf-einen-blick/
