"use client";

import { useEffect, useState } from "react";

const GOLD = "#c8a96a";
const DARK = "#07170f";
const GREEN = "#0d2418";
const TEXT = "#f4efe4";
const MUTED = "#cfc6b3";
const STORAGE_KEY = "nordschmiede_ernaehrungsanalyse_state";

const emptyDay = {
  breakfast: "",
  lunch: "",
  dinner: "",
  snacks: "",
  drinks: ""
};

const emptyForm = {
  age: "",
  height: "",
  gender: "",
  weight: "",
  targetWeight: "",
  goal: "",
  dietType: "",
  intolerances: "",
  dislikes: "",
  cookingTime: ""
};

const exampleForm = {
  age: "31",
  height: "180",
  gender: "männlich",
  weight: "85",
  targetWeight: "78",
  goal: "abnehmen",
  dietType: "Mischkost",
  intolerances: "keine",
  dislikes: "keine",
  cookingTime: "maximal 20 Minuten pro Mahlzeit"
};

  const exampleDays = [
  {
    breakfast: "2 Scheiben Brot ca. 100 g mit 15 g Butter und 25 g Marmelade, 1 Kaffee mit 50 ml Milch und 10 g Zucker",
    lunch: "120 g Nudeln ungekocht mit 180 g Bolognese, kleiner gemischter Salat ca. 100 g",
    dinner: "2 Scheiben Brot ca. 100 g mit 40 g Wurst und 40 g Käse, 100 g Gurke und Tomate",
    snacks: "1 Schokoriegel ca. 50 g, 30 g Nüsse",
    drinks: "1,5 l Wasser, 200 ml Cola, 2 Kaffee"
  },
  {
    breakfast: "80 g Müsli mit 250 ml Milch, 1 Banane ca. 120 g",
    lunch: "100 g Reis ungekocht mit 180 g Hähnchen und 200 g Gemüse",
    dinner: "2 Scheiben Brot ca. 100 g mit 40 g Frischkäse und 60 g Pute",
    snacks: "200 g Joghurt, 1 Apfel ca. 150 g",
    drinks: "2 l Wasser, 2 Kaffee"
  },
  {
    breakfast: "2 Brötchen ca. 120 g mit 15 g Butter und 50 g Käse",
    lunch: "1 Pizza Margherita ca. 350 g",
    dinner: "Salat ca. 250 g mit 1 Dose Thunfisch ca. 150 g",
    snacks: "50 g Schokolade",
    drinks: "1,5 l Wasser, 200 ml Cola"
  },
  {
    breakfast: "70 g Haferflocken mit 250 ml Milch und 100 g Beeren",
    lunch: "300 g Kartoffeln mit 200 g Quark",
    dinner: "2 Scheiben Brot ca. 100 g mit 2 Eiern und 70 g Avocado",
    snacks: "30 g Nüsse",
    drinks: "2 l Wasser, 2 Tassen Tee"
  },
  {
    breakfast: "2 Scheiben Toast ca. 60 g mit 30 g Nutella",
    lunch: "1 Döner ca. 450 g",
    dinner: "2 Scheiben Brot ca. 100 g mit 50 g Käse",
    snacks: "60 g Chips",
    drinks: "500 ml Cola, 1,5 l Wasser"
  },
  {
    breakfast: "3 Eier als Rührei mit 2 Scheiben Toast ca. 60 g",
    lunch: "120 g Pasta ungekocht mit 150 g Sahnesauce",
    dinner: "Salat ca. 250 g mit 180 g Hähnchen",
    snacks: "1 Proteinriegel ca. 60 g",
    drinks: "2 l Wasser, 2 Kaffee"
  },
  {
    breakfast: "80 g Müsli mit 200 g Joghurt",
    lunch: "1 Burger ca. 250 g mit 150 g Pommes",
    dinner: "2 Scheiben Brot ca. 100 g mit 50 g Aufschnitt",
    snacks: "50 g Schokolade",
    drinks: "300 ml Cola, 1,5 l Wasser"
  }
];

export default function Page() {
  const [form, setForm] = useState(emptyForm);
  const [days, setDays] = useState(Array.from({ length: 7 }, () => ({ ...emptyDay })));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [stepCheckins, setStepCheckins] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved);

        if (parsed.form) setForm(parsed.form);
        if (parsed.days) setDays(parsed.days);
        if (parsed.report) setReport(parsed.report);
        if (typeof parsed.activeStep === "number") setActiveStep(parsed.activeStep);
        if (Array.isArray(parsed.stepCheckins)) setStepCheckins(parsed.stepCheckins);
      }
    } catch (error) {
      console.error("Speicher konnte nicht geladen werden:", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        form,
        days,
        report,
        activeStep,
        stepCheckins
      })
    );
  }, [form, days, report, activeStep, stepCheckins, hydrated]);

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateDay(index, field, value) {
    setDays(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function fillExample() {
    setForm(exampleForm);
    setDays(exampleDays);
    setReport(null);
    setErrorText("");
    setActiveStep(0);
    setStepCheckins([]);
  }

  function resetApp() {
    const confirmReset = window.confirm(
      "Möchtest du alle Eingaben, Analyse-Ergebnisse und Check-ins wirklich löschen?"
    );

    if (!confirmReset) return;

    localStorage.removeItem(STORAGE_KEY);
    setForm(emptyForm);
    setDays(Array.from({ length: 7 }, () => ({ ...emptyDay })));
    setReport(null);
    setErrorText("");
    setActiveStep(0);
    setStepCheckins([]);
  }

  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDifference(value, unit) {
    const number = Math.round(Number(value || 0));
    if (number === 0) return "genau im Ziel";
    if (number < 0) return `${Math.abs(number)} ${unit} unter Ziel`;
    return `${number} ${unit} über Ziel`;
  }

  function handleStepCheckin(status) {
    const today = getTodayKey();

    const alreadyCheckedToday = stepCheckins.some(
      item => item.date === today && item.step === activeStep
    );

    if (alreadyCheckedToday) return;

    const newEntry = {
      step: activeStep,
      date: today,
      status
    };

    const updated = [...stepCheckins, newEntry];
    setStepCheckins(updated);

    const successfulDaysForCurrentStep = updated.filter(
      item => item.step === activeStep && item.status === "done"
    ).length;

    if (successfulDaysForCurrentStep >= 3 && activeStep < 9) {
      setActiveStep(prev => prev + 1);
    }
  }

  function printAnalysis() {
    window.print();
  }

  async function runAnalysis() {
    setLoading(true);
    setErrorText("");
    setReport(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ form, days })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || "Analyse fehlgeschlagen");
      }

      if (!data.report) {
        throw new Error("Es wurde kein Report zurückgegeben.");
      }

      setReport(data.report);
      setActiveStep(0);
      setStepCheckins([]);
    } catch (error) {
      setErrorText(error.message || "Unbekannter Fehler bei der Analyse.");
    } finally {
      setLoading(false);
    }
  }

  const today = getTodayKey();

  const alreadyCheckedToday = stepCheckins.some(
    item => item.date === today && item.step === activeStep
  );

  const successfulDaysForCurrentStep = stepCheckins.filter(
    item => item.step === activeStep && item.status === "done"
  ).length;

  return (
    <main style={styles.page}>
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          .print-section {
            background: white !important;
            color: #111 !important;
            box-shadow: none !important;
            border: 1px solid #ddd !important;
            page-break-inside: avoid;
          }

          .print-section h1,
          .print-section h2,
          .print-section h3,
          .print-section p,
          .print-section li,
          .print-section span,
          .print-section strong {
            color: #111 !important;
          }

          main {
            background: white !important;
            padding: 0 !important;
          }
        }

        @media (max-width: 760px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div style={styles.shell}>
        <section style={styles.hero} className="hero-grid no-print">
          <div>
            <div style={styles.brand}>NORDSCHMIEDE</div>
            <h1 style={styles.h1}>Ernährungsanalyse</h1>
            <p style={styles.heroText}>
              7 Tage Ehrlichkeit. Ein klarer Blick auf deinen aktuellen Zustand.
              Und ein strukturierter Weg zurück in Kontrolle.
            </p>
          </div>

          <div style={styles.heroBox}>
            <div style={styles.heroBoxLabel}>Analyseprinzip</div>
            <p style={styles.heroBoxText}>
              Kein Diätplan. Kein Motivationsprodukt. Eine nüchterne Auswertung
              deiner aktuellen Ernährungsrealität.
            </p>
          </div>
        </section>

        <div style={styles.actionRow} className="no-print">
          <button style={styles.secondaryButton} onClick={fillExample}>
            Beispiel ausfüllen
          </button>

          <button
            style={{
              ...styles.primaryButton,
              opacity: loading ? 0.65 : 1,
              cursor: loading ? "not-allowed" : "pointer"
            }}
            onClick={runAnalysis}
            disabled={loading}
          >
            {loading ? "Analyse läuft..." : "Analyse starten"}
          </button>

          {report && (
            <button style={styles.secondaryButton} onClick={printAnalysis}>
              Analyse als PDF speichern
            </button>
          )}

          <button style={styles.ghostButton} onClick={resetApp}>
            Alles zurücksetzen
          </button>
        </div>

        {report && (
          <div style={styles.saveNotice} className="no-print">
            Fortschritt gespeichert. Du kannst die Seite schließen und später an derselben Stelle weitermachen.
          </div>
        )}

        {errorText && (
          <div style={styles.errorBox} className="no-print">
            <strong>Fehler:</strong> {errorText}
          </div>
        )}

        <section style={styles.card} className="no-print">
          <div style={styles.sectionHeader}>
            <span style={styles.kicker}>01</span>
            <h2 style={styles.h2}>Körper und Ziel</h2>
          </div>

          <div style={styles.grid}>
            <Input label="Alter" value={form.age} onChange={v => updateForm("age", v)} />
            <Input label="Größe in cm" value={form.height} onChange={v => updateForm("height", v)} />
            <Input label="Geschlecht" value={form.gender} onChange={v => updateForm("gender", v)} />
            <Input label="Aktuelles Gewicht in kg" value={form.weight} onChange={v => updateForm("weight", v)} />
            <Input label="Zielgewicht in kg" value={form.targetWeight} onChange={v => updateForm("targetWeight", v)} />
            <Input label="Ziel: abnehmen, Gewicht halten oder zunehmen" value={form.goal} onChange={v => updateForm("goal", v)} />
            <Input label="Ernährungsform: Mischkost, vegetarisch, Low Carb, vegan ..." value={form.dietType} onChange={v => updateForm("dietType", v)} />
            <Input label="Allergien / Unverträglichkeiten" value={form.intolerances} onChange={v => updateForm("intolerances", v)} />
            <Input label="Lebensmittel vermeiden" value={form.dislikes} onChange={v => updateForm("dislikes", v)} />
            <Input label="Maximale Zubereitungszeit" value={form.cookingTime} onChange={v => updateForm("cookingTime", v)} />
          </div>
        </section>

        <section style={styles.card} className="no-print">
          <div style={styles.sectionHeader}>
            <span style={styles.kicker}>02</span>
            <h2 style={styles.h2}>7 Tage Ernährung</h2>
<p style={styles.smallText}>
  Je genauer du Mengen angibst, desto genauer kann die Analyse werden. Nutze möglichst konkrete Angaben wie 200 ml Cola, 200 g Joghurt, 150 g Pommes oder 2 Scheiben Brot.
</p>
          </div>

          <div style={styles.daysGrid}>
            {days.map((day, index) => (
              <div key={index} style={styles.dayCard}>
                <h3 style={styles.h3}>Tag {index + 1}</h3>

                <Textarea label="Frühstück" value={day.breakfast} onChange={v => updateDay(index, "breakfast", v)} />
                <Textarea label="Mittagessen" value={day.lunch} onChange={v => updateDay(index, "lunch", v)} />
                <Textarea label="Abendessen" value={day.dinner} onChange={v => updateDay(index, "dinner", v)} />
                <Textarea label="Snacks" value={day.snacks} onChange={v => updateDay(index, "snacks", v)} />
                <Textarea label="Getränke" value={day.drinks} onChange={v => updateDay(index, "drinks", v)} />
              </div>
            ))}
          </div>
        </section>

        {report && (
          <section style={styles.results}>
            <div style={styles.printCover} className="print-only print-section">
              <div style={styles.brand}>NORDSCHMIEDE</div>
              <h1 style={styles.h1}>Ernährungsanalyse</h1>
              <p style={styles.bodyText}>
                Erstellt am {new Date().toLocaleDateString("de-DE")}
              </p>
              <p style={styles.bodyText}>
                7 Tage Ehrlichkeit. Ein klarer Blick auf den aktuellen Zustand.
                Und ein strukturierter Weg zurück in Kontrolle.
              </p>
            </div>

            <div style={styles.resultIntro} className="print-section">
              <span style={styles.kicker}>03</span>
              <h2 style={styles.h1}>Auswertung</h2>
              <p style={styles.heroText}>{report.ernaehrungsrealitaet}</p>
            </div>

            <div style={styles.overallProgressCard} className="print-section">
              <div>
                <span style={styles.kicker}>Gesamtfortschritt</span>
                <h2 style={styles.h2}>Schritt {activeStep + 1} von 10 aktiv</h2>
              </div>

              <div style={styles.progressBar} className="no-print">
                <div style={{ ...styles.progressFill, width: `${((activeStep + 1) / 10) * 100}%` }} />
              </div>
            </div>

            <div style={styles.resultGrid}>
              <MetricCard title="Ist-Zustand" data={report.istZustand} />
              <MetricCard title="Soll-Zustand" data={report.sollZustand} />

              <div style={styles.card} className="print-section">
                <h2 style={styles.h2}>Differenz</h2>
                <p style={styles.metricLine}>Kalorien: {formatDifference(report.differenz.kcal, "kcal")}</p>
                <p style={styles.metricLine}>Protein: {formatDifference(report.differenz.protein, "g")}</p>
                <p style={styles.metricLine}>Fett: {formatDifference(report.differenz.fett, "g")}</p>
                <p style={styles.metricLine}>Kohlenhydrate: {formatDifference(report.differenz.kohlenhydrate, "g")}</p>
              </div>
            </div>

            <div style={styles.card} className="print-section">
              <h2 style={styles.h2}>Zentrales Problem</h2>
              <p style={styles.bodyText}>{report.zentralesProblem}</p>
            </div>

            <div style={styles.twoColumn}>
              <div style={styles.card} className="print-section">
                <h2 style={styles.h2}>Größte Hebel</h2>
                <ul style={styles.list}>
                  {report.groessteHebel?.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div style={styles.card} className="print-section">
                <h2 style={styles.h2}>Nächste konkrete Änderung</h2>
                <p style={styles.bodyText}>{report.naechsteKonkreteAenderung}</p>
              </div>
            </div>

            <div style={styles.focusCard} className="print-section">
              <span style={styles.kicker}>Schritt {activeStep + 1} von 10</span>
              <h2 style={styles.h2}>Aktueller Schritt</h2>

              <p style={styles.focusText}>
                {report.zehnSchrittePlan?.[activeStep]}
              </p>

              <div style={styles.progressBox} className="no-print">
                <p style={styles.smallText}>
                  Erfolgreiche Umsetzungstage für diesen Schritt: {successfulDaysForCurrentStep} von 3
                </p>

                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: `${(successfulDaysForCurrentStep / 3) * 100}%` }} />
                </div>
              </div>

              <div style={styles.checkRow} className="no-print">
                <button
                  style={{
                    ...styles.checkButton,
                    opacity: alreadyCheckedToday ? 0.45 : 1,
                    cursor: alreadyCheckedToday ? "not-allowed" : "pointer"
                  }}
                  disabled={alreadyCheckedToday}
                  onClick={() => handleStepCheckin("done")}
                >
                  Heute umgesetzt
                </button>

                <button
                  style={{
                    ...styles.checkButton,
                    opacity: alreadyCheckedToday ? 0.45 : 1,
                    cursor: alreadyCheckedToday ? "not-allowed" : "pointer"
                  }}
                  disabled={alreadyCheckedToday}
                  onClick={() => handleStepCheckin("partial")}
                >
                  Teilweise umgesetzt
                </button>

                <button
                  style={{
                    ...styles.checkButton,
                    opacity: alreadyCheckedToday ? 0.45 : 1,
                    cursor: alreadyCheckedToday ? "not-allowed" : "pointer"
                  }}
                  disabled={alreadyCheckedToday}
                  onClick={() => handleStepCheckin("missed")}
                >
                  Nicht umgesetzt
                </button>
              </div>

              {alreadyCheckedToday && (
                <p style={styles.smallText} className="no-print">
                  Dein Check-in für heute wurde gespeichert. Der nächste Check-in ist morgen möglich.
                </p>
              )}

              <p style={styles.smallText} className="no-print">
                Der nächste Schritt wird erst freigeschaltet, wenn dieser Schritt an 3 Tagen erfolgreich umgesetzt wurde.
              </p>
            </div>

            <div style={styles.card} className="print-section">
              <h2 style={styles.h2}>Lebensmittelanalyse</h2>
              <div style={styles.tableWrap}>
                {report.lebensmittelAnalyse?.map((item, i) => (
                  <div key={i} style={styles.foodRow}>
                    <strong style={{ color: GOLD }}>{item.lebensmittel}</strong>
                    <span>{item.menge}</span>
                    <span>{item.kcal} kcal</span>
                    <span>P {item.protein} g · F {item.fett} g · KH {item.kohlenhydrate} g</span>
                    <p style={styles.smallText}>{item.einordnung}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.card} className="print-section">
              <h2 style={styles.h2}>Hauptkalorienquellen</h2>
              {report.topKalorienQuellen?.map((item, i) => (
                <div key={i} style={styles.foodRow}>
                  <strong style={{ color: GOLD }}>{item.lebensmittel}</strong>
                  <span>{item.kcal} kcal · {item.anteil}</span>
                  <p style={styles.smallText}>{item.grund}</p>
                </div>
              ))}
            </div>

            <div style={styles.card} className="print-section">
              <h2 style={styles.h2}>Zusammenfassung</h2>
              <p style={styles.bodyText}>{report.zusammenfassung}</p>
            </div>

            <div style={styles.ctaCard} className="print-section">
              <div style={styles.ctaContent}>
                <span style={styles.kicker}>NORDSCHMIEDE</span>

                <h2 style={styles.ctaTitle}>Wissen reicht nicht.</h2>

                <p style={styles.ctaText}>
                  Du hast jetzt gesehen, wo du stehst und was sich konkret verändern muss.
                  Die meisten scheitern nicht daran, dass sie es nicht verstehen,
                  sondern daran, dass sie es nicht dauerhaft umsetzen.
                </p>

                <p style={styles.ctaText}>
                  Wenn du willst, begleite ich dich dabei, diese Schritte strukturiert
                  in deinen Alltag zu integrieren.
                </p>

                <div style={styles.ctaButtonRow} className="no-print">
                  <a
                    href="https://calendly.com/lukasplugfelder/30min?month=2026-05&date=2026-05-15"
                    target="_blank"
                    rel="noreferrer"
                    style={styles.ctaButton}
                  >
                    Analyse gemeinsam umsetzen
                  </a>
                </div>

                <p style={styles.ctaSubtext}>
                  Nur für Unternehmer, die bereit sind, Verantwortung zu übernehmen.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Input({ label, value, onChange }) {
  return (
    <label style={styles.label}>
      <span>{label}</span>
      <input style={styles.input} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function Textarea({ label, value, onChange }) {
  return (
    <label style={styles.label}>
      <span>{label}</span>
      <textarea style={styles.textarea} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function MetricCard({ title, data }) {
  return (
    <div style={styles.card} className="print-section">
      <h2 style={styles.h2}>{title}</h2>
      <p style={styles.metricLine}>Kalorien: {data?.kcal} kcal</p>
      <p style={styles.metricLine}>Protein: {data?.protein} g</p>
      <p style={styles.metricLine}>Fett: {data?.fett} g</p>
      <p style={styles.metricLine}>Kohlenhydrate: {data?.kohlenhydrate} g</p>
      {data?.schaetzqualitaet && (
        <p style={styles.smallText}>Schätzqualität: {data.schaetzqualitaet}</p>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: `radial-gradient(circle at top left, #173522 0, ${DARK} 34%, #040b07 100%)`,
    color: TEXT,
    padding: "48px 20px",
    fontFamily: "Arial, Helvetica, sans-serif"
  },
  shell: { maxWidth: 1180, margin: "0 auto" },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.5fr 0.8fr",
    gap: 28,
    alignItems: "end",
    marginBottom: 30
  },
  brand: {
    color: GOLD,
    letterSpacing: 4,
    fontSize: 13,
    textTransform: "uppercase",
    marginBottom: 16
  },
  h1: {
    fontSize: 52,
    lineHeight: 1.05,
    margin: "0 0 18px 0",
    fontWeight: 700
  },
  h2: { color: GOLD, margin: "0 0 18px 0", fontSize: 24 },
  h3: { color: TEXT, margin: "0 0 14px 0", fontSize: 18 },
  heroText: {
    color: MUTED,
    fontSize: 19,
    lineHeight: 1.6,
    maxWidth: 760,
    margin: 0
  },
  heroBox: {
    background: "rgba(16, 43, 29, 0.82)",
    border: "1px solid rgba(200,169,106,0.28)",
    borderRadius: 24,
    padding: 26,
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)"
  },
  heroBoxLabel: {
    color: GOLD,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 12
  },
  heroBoxText: { color: MUTED, lineHeight: 1.55, margin: 0 },
  actionRow: { display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 },
  primaryButton: {
    padding: "15px 22px",
    borderRadius: 14,
    border: "none",
    background: GOLD,
    color: DARK,
    fontWeight: 700,
    fontSize: 16
  },
  secondaryButton: {
    padding: "15px 22px",
    borderRadius: 14,
    border: "1px solid rgba(200,169,106,0.55)",
    background: "rgba(16, 43, 29, 0.62)",
    color: GOLD,
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer"
  },
  ghostButton: {
    padding: "15px 22px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "transparent",
    color: MUTED,
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer"
  },
  saveNotice: {
    background: "rgba(200,169,106,0.12)",
    border: "1px solid rgba(200,169,106,0.28)",
    color: MUTED,
    padding: 16,
    borderRadius: 16,
    marginBottom: 22
  },
  card: {
    background: "rgba(16, 43, 29, 0.82)",
    border: "1px solid rgba(200,169,106,0.22)",
    borderRadius: 24,
    padding: 28,
    marginBottom: 24,
    boxShadow: "0 22px 60px rgba(0,0,0,0.24)"
  },
  sectionHeader: { display: "flex", alignItems: "baseline", gap: 14, marginBottom: 10 },
  kicker: { color: GOLD, letterSpacing: 2, textTransform: "uppercase", fontSize: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 },
  daysGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 18 },
  dayCard: {
    background: "rgba(7,23,15,0.72)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 20
  },
  label: { display: "flex", flexDirection: "column", gap: 8, color: MUTED, fontSize: 13 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 13,
    border: "1px solid rgba(200,169,106,0.3)",
    background: GREEN,
    color: TEXT,
    padding: "14px 15px",
    fontSize: 15,
    outline: "none"
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 74,
    borderRadius: 13,
    border: "1px solid rgba(200,169,106,0.3)",
    background: GREEN,
    color: TEXT,
    padding: "13px 14px",
    fontSize: 14,
    outline: "none",
    resize: "vertical"
  },
  errorBox: {
    background: "rgba(120, 32, 32, 0.55)",
    border: "1px solid rgba(255,120,120,0.35)",
    padding: 18,
    borderRadius: 18,
    marginBottom: 22
  },
  results: { marginTop: 40 },
  resultIntro: {
    marginBottom: 24,
    background: "rgba(16, 43, 29, 0.82)",
    border: "1px solid rgba(200,169,106,0.22)",
    borderRadius: 24,
    padding: 28
  },
  resultGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 },
  metricLine: { fontSize: 17, color: TEXT, margin: "9px 0" },
  bodyText: { color: MUTED, lineHeight: 1.7, fontSize: 17 },
  twoColumn: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 },
  list: { color: MUTED, lineHeight: 1.7, paddingLeft: 22, fontSize: 16 },
  overallProgressCard: {
    background: "rgba(16, 43, 29, 0.82)",
    border: "1px solid rgba(200,169,106,0.22)",
    borderRadius: 24,
    padding: 24,
    marginBottom: 24
  },
  focusCard: {
    background: `linear-gradient(135deg, rgba(200,169,106,0.18), rgba(16,43,29,0.88))`,
    border: "1px solid rgba(200,169,106,0.38)",
    borderRadius: 26,
    padding: 30,
    marginBottom: 24,
    boxShadow: "0 24px 70px rgba(0,0,0,0.3)"
  },
  focusText: { color: TEXT, lineHeight: 1.65, fontSize: 22, maxWidth: 900 },
  progressBox: { marginTop: 20, marginBottom: 20 },
  progressBar: {
    width: "100%",
    height: 10,
    background: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    background: GOLD,
    borderRadius: 999
  },
  checkRow: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 },
  checkButton: {
    padding: "12px 16px",
    borderRadius: 13,
    border: "1px solid rgba(200,169,106,0.5)",
    background: DARK,
    color: TEXT,
    cursor: "pointer",
    fontWeight: 700
  },
  tableWrap: { display: "grid", gap: 12 },
  foodRow: {
    background: "rgba(7,23,15,0.58)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
    padding: 16,
    display: "grid",
    gap: 7,
    marginBottom: 10
  },
  smallText: {
    color: MUTED,
    lineHeight: 1.55,
    margin: "6px 0 0 0",
    fontSize: 14
  },
  printCover: {
    display: "none",
    background: "rgba(16, 43, 29, 0.82)",
    border: "1px solid rgba(200,169,106,0.22)",
    borderRadius: 24,
    padding: 32,
    marginBottom: 24
  },
  ctaCard: {
    marginTop: 40,
    borderRadius: 28,
    padding: 32,
    background: "linear-gradient(135deg, rgba(200,169,106,0.15), rgba(16,43,29,0.95))",
    border: "1px solid rgba(200,169,106,0.4)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
    marginBottom: 40
  },
  ctaContent: {
    maxWidth: 760
  },
  ctaTitle: {
    fontSize: 34,
    margin: "10px 0 18px 0",
    color: TEXT
  },
  ctaText: {
    color: MUTED,
    fontSize: 17,
    lineHeight: 1.7,
    marginBottom: 16
  },
  ctaButtonRow: {
    marginTop: 24,
    marginBottom: 14
  },
  ctaButton: {
    display: "inline-block",
    padding: "16px 24px",
    borderRadius: 14,
    background: GOLD,
    color: DARK,
    fontWeight: 700,
    textDecoration: "none"
  },
  ctaSubtext: {
    fontSize: 13,
    color: "#a89f8d"
  }
};