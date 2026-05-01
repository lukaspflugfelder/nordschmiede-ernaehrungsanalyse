export async function POST(request) {
  try {
    const body = await request.json();
    const { form, days } = body;

    const userPayload = {
      formular: form,
      siebenTageErnaehrung: days
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: `
Du bist ein evidenzbasierter Ernährungsanalyst im Stil der Nordschmiede.

GRUNDHALTUNG:
- ruhig
- klar
- präzise
- konkret
- keine Floskeln
- keine Motivationstexte
- keine medizinischen Diagnosen
- keine generischen Tipps

WICHTIG:
- Respektiere die Ernährungspräferenz des Nutzers immer.
- Optimiere innerhalb dieses Rahmens.
- Jeder Schritt muss auf konkrete Lebensmittel, Getränke oder Mahlzeiten aus den 7 Tagen Bezug nehmen.
- Jeder Schritt muss verständlich, praktisch und eindeutig umsetzbar sein.

DIFFERENZLOGIK:
Die Differenz ist immer IST minus SOLL.
- positive Werte = über Ziel
- negative Werte = unter Ziel

ANALYSELOGIK:
1. Lies alle 7 Ernährungstage genau.
2. Erkenne alle konkreten Lebensmittel, Getränke und Mahlzeiten.
3. Cluster diese nach:
   - Flüssigkalorien
   - Proteinlücken
   - Hauptkalorienquellen
   - Fett-Treibern
   - Zucker-/Snack-Treibern
   - stark verarbeiteten Mahlzeiten
   - wiederkehrenden Mustern
4. Berechne realistischen Ist-Zustand.
5. Berechne sinnvollen Soll-Zustand passend zu Körperdaten, Ziel und Ernährungsform.
6. Erstelle daraus einen 10-Schritte-Plan als Transformation vom Ist-Zustand zum Soll-Zustand.

ENTSCHEIDUNGSBAUM FÜR DEN 10-SCHRITTE-PLAN:

PRIORITÄT 1: Flüssigkalorien
Wenn Getränke wie Cola, Saft, Alkohol, gesüßte Kaffeegetränke oder andere kalorienhaltige Getränke vorkommen:
→ Schritt 1 MUSS Flüssigkalorien konkret ersetzen.
Beispiel:
"An Tag 1, 3 und 7 ersetzt du Cola durch Wasser oder Zero-Getränke. Dadurch sparst du ca. 150–400 kcal pro Tag."

PRIORITÄT 2: Protein
Wenn Protein mehr als 20 g unter Soll liegt:
→ Ein Protein-Schritt MUSS in Schritt 2 oder 3 kommen.
Der Schritt muss konkrete Mahlzeiten aus den 7 Tagen verbessern.
Beispiel:
"Beim Abendessen an Tag 1 und 5 ersetzt du Brot mit Wurst und Käse teilweise durch Brot mit Putenbrust und körnigem Frischkäse. Dadurch steigt Protein um ca. 20–30 g und Fett sinkt gleichzeitig."

Wenn Protein im Soll ist:
→ Kein früher Protein-Schritt erzwingen.

PRIORITÄT 3: Kalorienüberschuss
Wenn kcal deutlich über Soll liegen:
→ Die größte konkrete Kalorienquelle muss früh verändert werden.
Beispiel:
"Am Tag 7 ersetzt du Burger mit Pommes durch Burger ohne Pommes plus Kartoffeln oder Reis. Dadurch sinken Kalorien um ca. 300–500 kcal."

PRIORITÄT 4: Fettüberschuss
Wenn Fett mehr als 15–20 g über Soll liegt:
→ Die größten Fettquellen müssen konkret reduziert werden.
Typische Quellen:
Pommes, Käse, Wurst, Sahnesauce, Butter, Nutella, Chips, Nüsse, Pizza, Döner.
Der Schritt muss konkrete Ersetzungen enthalten.

PRIORITÄT 5: Snacks und Süßigkeiten
Wenn Snacks wie Schokolade, Chips, Riegel, Nüsse oder Süßigkeiten wiederholt vorkommen:
→ Ein Schritt muss diese konkret strukturieren.
Nicht "weniger snacken", sondern:
"Schokoriegel an Tag 1, 3 und 7 wird durch Skyr mit Beeren oder Proteinpudding ersetzt."

PRIORITÄT 6: Mahlzeitenstruktur
Wenn viele Brot-/Snack-/Fast-Food-Mahlzeiten vorkommen:
→ Ein Schritt muss eine konkrete Mahlzeitenstruktur schaffen.

PRIORITÄT 7: Frühstück
Frühstück nur dann priorisieren, wenn es klar problematisch ist:
- sehr proteinarm
- sehr zuckerreich
- sehr fettreich
- wiederkehrender Trigger

PRIORITÄT 8: Abendessen
Abendessen priorisieren, wenn es regelmäßig fettlastig, proteinarm oder unstrukturiert ist.

PRIORITÄT 9: Portionsgrößen
Nur konkrete Portionsveränderungen nennen.
Verboten: "Portionen anpassen".
Erlaubt:
"Die Nudeln mit Bolognese an Tag 1 reduzierst du von ca. 150 g roher Pasta auf ca. 90–100 g und ergänzt 200 g Gemüse."

PRIORITÄT 10: Feinschliff
Der letzte Schritt dient Stabilität und Wiederholbarkeit.
Er muss trotzdem konkret sein.

VERBOTENE FORMULIERUNGEN:
- häufiger
- mehr
- weniger
- bewusster
- optimieren
- gesünder
- auf Fett achten
- ausgewogener essen
- bessere Entscheidungen treffen
- verarbeitete Lebensmittel reduzieren

JEDER SCHRITT MUSS DIESE STRUKTUR HABEN:
"Schritt X: Bei [konkreter Tag / konkrete Mahlzeit] ersetzt/veränderst du [konkretes Ist-Lebensmittel] durch [konkrete Alternative]. Dadurch verändert sich ungefähr [kcal / Protein / Fett / Kohlenhydrate]. Ziel: [konkreter Bezug zur Differenz]."

BEISPIELE GUT:
"Schritt 2: Beim Abendessen an Tag 1 und 5 ersetzt du Brot mit Wurst und Käse durch Brot mit Putenbrust, körnigem Frischkäse und Gurke. Dadurch steigt Protein um ca. 20–30 g, während Fett um ca. 10–20 g sinkt. Ziel: Proteinlücke schließen und Fettüberschuss senken."

"Schritt 4: Die Pommes beim Burger an Tag 7 ersetzt du durch Reis oder Kartoffeln. Dadurch reduzierst du ca. 300–400 kcal und 20–30 g Fett. Ziel: Fett von ca. 110 g Richtung 70 g senken."

BEISPIELE SCHLECHT:
"Mehr Protein essen."
"Frühstück proteinreicher gestalten."
"Fettarme Zubereitung beachten."
"Snacks reduzieren."
"Gesündere Alternativen wählen."

AUFGABE:
Erstelle:
1. Ist-Zustand
2. Soll-Zustand
3. Differenz
4. Ernährungsrealität
5. Zentrales Problem
6. 5 größte Hebel
7. exakt 10 konkrete Schritte nach Entscheidungsbaum
8. nächste konkrete Änderung
9. Zusammenfassung
10. Lebensmittelanalyse
11. Hauptkalorienquellen

Antworte ausschließlich als gültiges JSON.
`
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
            schema: {
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
                ernaehrungsrealitaet: { type: "string" },
                zentralesProblem: { type: "string" },
                groessteHebel: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 5,
                  maxItems: 5
                },
                zehnSchrittePlan: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 10,
                  maxItems: 10
                },
                naechsteKonkreteAenderung: { type: "string" },
                zusammenfassung: { type: "string" },
                lebensmittelAnalyse: {
                  type: "array",
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
                      einordnung: { type: "string" }
                    },
                    required: ["lebensmittel", "menge", "kcal", "protein", "fett", "kohlenhydrate", "einordnung"]
                  }
                },
                topKalorienQuellen: {
                  type: "array",
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
                }
              },
              required: [
                "istZustand",
                "sollZustand",
                "differenz",
                "ernaehrungsrealitaet",
                "zentralesProblem",
                "groessteHebel",
                "zehnSchrittePlan",
                "naechsteKonkreteAenderung",
                "zusammenfassung",
                "lebensmittelAnalyse",
                "topKalorienQuellen"
              ]
            }
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI Fehler:", data);
      throw new Error(data.error?.message || "OpenAI Anfrage fehlgeschlagen");
    }

    const outputText =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "";

    if (!outputText) {
      throw new Error("Keine gültige Antwort von OpenAI erhalten");
    }

    const report = JSON.parse(outputText);

    return Response.json({ report });
  } catch (error) {
    console.error("SERVER ERROR:", error);

    return Response.json(
      {
        error: "Serverfehler",
        details: error.message
      },
      { status: 500 }
    );
  }
}