"use client";

import { useEffect, useState } from "react";

const GOLD = "#c8a96a";
const DARK = "#07170f";
const GREEN = "#0d2418";
const TEXT = "#f4efe4";
const MUTED = "#cfc6b3";
const STORAGE_KEY = "nordschmiede_ernaehrungsanalyse_state_v24_pdf_final";
const KORPERKOMPASS_URL = "https://www.nordschmiede.com/korperkompass";
const LOGO_URL = "/nordschmiede-rune.png";
const PRIVACY_URL = "https://www.nordschmiede.com/datenschutz";
const IMPRINT_URL = "https://www.nordschmiede.com/impressum";
const CONSENT_VERSION = "ernaehrungsanalyse-v1-2026-06-21";

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
  activityLevel: "",
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
  activityLevel: "moderat aktiv / 2–3× Training pro Woche",
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

const wizardSteps = ["Start", "Körperdaten", "7 Tage Ernährung", "Analyse"];

const resultTabs = [
  { id: "overview", label: "Überblick" },
  { id: "implementation", label: "Umsetzung" },
  { id: "patterns", label: "Muster" },
  { id: "report", label: "Bericht" }
];

export default function Page() {
  const [form, setForm] = useState({ ...emptyForm });
  const [days, setDays] = useState(Array.from({ length: 7 }, () => ({ ...emptyDay })));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [stepCheckins, setStepCheckins] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [activeDay, setActiveDay] = useState(0);
  const [todayLabel, setTodayLabel] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [resultTab, setResultTab] = useState("overview");
  const [aiNoticeAccepted, setAiNoticeAccepted] = useState(false);
  const [privacyNoticeAccepted, setPrivacyNoticeAccepted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved);

        if (parsed.form) setForm({ ...emptyForm, ...parsed.form });
        if (parsed.days) setDays(normalizeDays(parsed.days));
        if (parsed.report) setReport(parsed.report);
        if (typeof parsed.activeStep === "number") setActiveStep(parsed.activeStep);
        if (Array.isArray(parsed.stepCheckins)) setStepCheckins(parsed.stepCheckins);
        if (typeof parsed.wizardStep === "number") setWizardStep(parsed.wizardStep);
        if (typeof parsed.activeDay === "number") setActiveDay(parsed.activeDay);
        if (typeof parsed.showDetails === "boolean") setShowDetails(parsed.showDetails);
        if (typeof parsed.resultTab === "string") setResultTab(parsed.resultTab);
        if (typeof parsed.aiNoticeAccepted === "boolean") setAiNoticeAccepted(parsed.aiNoticeAccepted);
        if (typeof parsed.privacyNoticeAccepted === "boolean") setPrivacyNoticeAccepted(parsed.privacyNoticeAccepted);
      }
    } catch (error) {
      console.error("Speicher konnte nicht geladen werden:", error);
    } finally {
      setHydrated(true);
      setTodayLabel(new Date().toLocaleDateString("de-DE"));
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
        stepCheckins,
        wizardStep,
        activeDay,
        showDetails,
        resultTab,
        aiNoticeAccepted,
        privacyNoticeAccepted
      })
    );
  }, [form, days, report, activeStep, stepCheckins, wizardStep, activeDay, showDetails, resultTab, aiNoticeAccepted, privacyNoticeAccepted, hydrated]);

  const consentReady = aiNoticeAccepted && privacyNoticeAccepted;
  const analysisDisabled = loading || !consentReady;

  function normalizeDays(inputDays) {
    if (!Array.isArray(inputDays)) {
      return Array.from({ length: 7 }, () => ({ ...emptyDay }));
    }

    return Array.from({ length: 7 }, (_, index) => {
      const day = inputDays[index];

      if (typeof day === "string") {
        return {
          breakfast: day,
          lunch: "",
          dinner: "",
          snacks: "",
          drinks: ""
        };
      }

      return {
        ...emptyDay,
        ...(day || {})
      };
    });
  }

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
    setActiveDay(0);
    setWizardStep(2);
    setShowDetails(false);
    setResultTab("overview");
  }

  function getAnalysisButtonText(activeLabel = "Analyse starten") {
    if (loading) return "Analyse läuft...";
    if (!consentReady) return "Hinweise bestätigen";
    return activeLabel;
  }

  function resetApp() {
    const confirmReset = window.confirm(
      "Möchtest du alle Eingaben, Analyse-Ergebnisse und Check-ins wirklich löschen?"
    );

    if (!confirmReset) return;

    localStorage.removeItem(STORAGE_KEY);
    setForm({ ...emptyForm });
    setDays(Array.from({ length: 7 }, () => ({ ...emptyDay })));
    setReport(null);
    setErrorText("");
    setActiveStep(0);
    setStepCheckins([]);
    setWizardStep(0);
    setActiveDay(0);
    setShowDetails(false);
    setResultTab("overview");
    setAiNoticeAccepted(false);
    setPrivacyNoticeAccepted(false);
  }

  function getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return year + "-" + month + "-" + day;
  }

  function numberValue(value) {
    const number = Number(value || 0);
    if (Number.isNaN(number)) return 0;
    return Math.round(number);
  }

  function formatDifference(value, unit) {
    const number = numberValue(value);

    if (number === 0) return "genau im Ziel";
    if (number < 0) return Math.abs(number) + " " + unit + " unter Ziel";
    return number + " " + unit + " über Ziel";
  }

  function createResultSentence(currentReport) {
    if (!currentReport?.differenz) {
      return "Deine Analyse zeigt, welche Ernährungshebel aktuell den größten Einfluss auf Energie, Gewicht und Umsetzung haben.";
    }

    const kcal = numberValue(currentReport.differenz.kcal);
    const protein = numberValue(currentReport.differenz.protein);
    const fat = numberValue(currentReport.differenz.fett);

    const kcalText =
      kcal > 0
        ? "Du liegst aktuell ca. " + kcal + " kcal über deinem Ziel"
        : kcal < 0
          ? "Du liegst aktuell ca. " + Math.abs(kcal) + " kcal unter deinem Ziel"
          : "Deine Kalorien liegen ungefähr im Zielbereich";

    const proteinText =
      protein < 0
        ? "Protein ist gleichzeitig etwa " + Math.abs(protein) + " g zu niedrig"
        : protein > 0
          ? "Protein liegt bereits über dem Ziel"
          : "Protein liegt ungefähr im Zielbereich";

    const fatText =
      fat > 0
        ? "Fett liegt etwa " + fat + " g über dem Ziel"
        : fat < 0
          ? "Fett liegt etwa " + Math.abs(fat) + " g unter dem Ziel"
          : "Fett liegt ungefähr im Zielbereich";

    return kcalText + " — " + proteinText + ", " + fatText + ". Priorität: erst die größten Kalorien- und Strukturmuster verändern, dann Feintuning.";
  }

  function getCurrentStepText() {
    if (!report?.zehnSchrittePlan?.length) return "";
    return report.zehnSchrittePlan[activeStep] || report.zehnSchrittePlan[0] || "";
  }

  function cleanStepText(text) {
    if (!text) return "";
    return String(text).replace(/^Schritt\s*\d+\s*[:.)-]\s*/i, "").trim();
  }

  function extractLabeledPart(text, label) {
    if (!text) return "";
    const source = String(text);
    const pattern = new RegExp(label + "\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:Titel|Schrittziel|Ab jetzt|Umbau|Häufigkeit|Haeufigkeit|Wirkung pro Ereignis|Wirkung|Wochenwirkung|Tagesdurchschnitt|Schließt|Schliesst|Fokus|Art|Warum|Rest|Zielbezug|Bilanz|Interne Bilanz)\\s*:|$)", "i");
    const match = source.match(pattern);
    return match ? match[1].trim() : "";
  }

  function stripStructuredLabels(text) {
    if (!text) return "";
    return String(text)
      .replace(/\b(Titel|Schrittziel|Ab jetzt|Umbau|Häufigkeit|Haeufigkeit|Wirkung pro Ereignis|Wirkung|Wochenwirkung|Tagesdurchschnitt|Schließt|Schliesst|Fokus|Art|Warum|Rest|Zielbezug|Bilanz|Interne Bilanz)\s*:/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractEffect(text) {
    if (!text) return "Der Effekt entsteht über weniger unnötige Kalorien, bessere Struktur oder mehr Protein im Alltag.";

    const explicit = extractLabeledPart(text, "Wirkung");
    if (explicit) return explicit;

    const kcalMatch = String(text).match(/(\d+)\s*[–-]\s*(\d+)\s*kcal/i);
    if (kcalMatch) {
      return "ca. " + kcalMatch[1] + "–" + kcalMatch[2] + " kcal Veränderung im relevanten Zeitraum.";
    }

    const singleKcalMatch = String(text).match(/([+-]?\d+)\s*kcal/i);
    if (singleKcalMatch) {
      return "ca. " + singleKcalMatch[1] + " kcal Veränderung im relevanten Zeitraum.";
    }

    return "weniger Reibung, klarere Mahlzeitenstruktur und bessere Steuerbarkeit im Alltag.";
  }

  function deriveStepTitle(action, cleaned) {
    const text = [action, cleaned].filter(Boolean).join(" ").toLowerCase();

    if (/cola|limonade|saft|eistee/.test(text)) return "Cola ersetzen";
    if (/schokoriegel|schokolade/.test(text)) return "Süßes ersetzen";
    if (/chips/.test(text)) return "Chips portionieren";
    if (/nuss|nüsse|nuesse/.test(text)) return "Nüsse portionieren";
    if (/döner|doener/.test(text)) return "Döner umbauen";
    if (/pizza/.test(text)) return "Pizza leichter ersetzen";
    if (/sahne|sahnesauce/.test(text)) return "Sahnesauce ersetzen";
    if (/butter/.test(text)) return "Butter leichter ersetzen";
    if (/käse|kaese/.test(text)) return "Käse bewusst dosieren";
    if (/nutella|marmelade/.test(text)) return "Süßen Belag ersetzen";
    if (/protein|magerquark|quark|skyr|hüttenkäse|huettenkäse|hähnchen|haehnchen|pute|thunfisch/.test(text)) return "Proteinbasis stärken";

    const firstSentence = String(action || cleaned || "").split(/[.!?]/)[0].trim();
    return firstSentence.length > 58 ? firstSentence.slice(0, 55).trim() + "…" : (firstSentence || "Nächsten Hebel umsetzen");
  }


  function cleanDisplayPart(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.。]+$/g, "")
      .trim();
  }

  function getReadableStep(rawText) {
    const cleaned = cleanStepText(rawText);
    const explicitTitle = extractLabeledPart(cleaned, "Titel") || extractLabeledPart(cleaned, "Schrittziel");
    const abJetzt = extractLabeledPart(cleaned, "Ab jetzt");
    const umbau = extractLabeledPart(cleaned, "Umbau");
    const haeufigkeit = extractLabeledPart(cleaned, "Häufigkeit") || extractLabeledPart(cleaned, "Haeufigkeit");
    const fokus = extractLabeledPart(cleaned, "Fokus") || extractLabeledPart(cleaned, "Schließt") || extractLabeledPart(cleaned, "Schliesst") || extractLabeledPart(cleaned, "Zielbezug");
    const warum = extractLabeledPart(cleaned, "Warum");
    const art = extractLabeledPart(cleaned, "Art");
    const actionFallback = cleaned
      .split(/\bHäufigkeit\s*:/i)[0]
      .split(/\bWirkung pro Ereignis\s*:/i)[0]
      .split(/\bTagesdurchschnitt\s*:/i)[0]
      .split(/\bSchließt\s*:/i)[0]
      .trim();
    const action = abJetzt || umbau || stripStructuredLabels(actionFallback) || "Setze den nächsten kleinen Hebel aus deiner Analyse um.";

    return {
      title: cleanDisplayPart(explicitTitle || deriveStepTitle(action, cleaned)),
      action: pdfCleanDisplayPart(action),
      frequency: cleanDisplayPart(haeufigkeit || "bei jedem Auftreten dieses Musters"),
      focus: cleanDisplayPart(fokus || "Kalorien, Protein oder Fett gezielt Richtung Soll führen"),
      why: cleanDisplayPart(warum || (art ? "Art: " + art : "Dieser Schritt verändert ein wiederkehrendes Muster aus deiner Woche"))
    };
  }

  function getStepStructure() {
    const raw = getCurrentStepText();
    return getReadableStep(raw);
  }

  function correctionDirection(value, unit, label) {
    const number = Number(value) || 0;
    if (number === 0) return { label, value: "im Zielbereich", tone: "neutral" };
    if (number > 0) return { label, value: "ca. -" + Math.abs(number) + " " + unit, tone: "down" };
    return { label, value: "ca. +" + Math.abs(number) + " " + unit, tone: "up" };
  }

  function createFahrplanTarget(reportData) {
    const diff = reportData?.differenz || {};
    return [
      correctionDirection(diff.kcal, "kcal", "Kalorien"),
      correctionDirection(diff.protein, "g", "Protein"),
      correctionDirection(diff.fett, "g", "Fett"),
      correctionDirection(diff.kohlenhydrate, "g", "Kohlenhydrate")
    ];
  }


  function signedDisplay(value, unit) {
    const number = Number(value) || 0;
    if (number === 0) return "±0 " + unit;
    return (number > 0 ? "+" : "-") + Math.abs(number) + " " + unit;
  }

  function createWeeklyTargetCards(reportData) {
    const weekly = reportData?.fahrplanWochenziel?.wochenziel;
    if (!weekly) return [];

    return [
      { label: "Kalorien/Woche", value: signedDisplay(weekly.kcal, "kcal") },
      { label: "Protein/Woche", value: signedDisplay(weekly.protein, "g") },
      { label: "Fett/Woche", value: signedDisplay(weekly.fett, "g") },
      { label: "Kohlenhydrate/Woche", value: signedDisplay(weekly.kohlenhydrate, "g") }
    ];
  }

  function createPlanBalanceCards(reportData) {
    const effect = reportData?.fahrplanSolverStatus?.geplanteTageswirkung || reportData?.fahrplanWirkung?.geplanteTageswirkung;
    if (!effect) return [];

    return [
      { label: "geplant kcal/Tag", value: signedDisplay(Math.round(effect.kcal || 0), "kcal") },
      { label: "geplant Protein/Tag", value: signedDisplay(Math.round(effect.protein || 0), "g") },
      { label: "geplant Fett/Tag", value: signedDisplay(Math.round(effect.fett || 0), "g") },
      { label: "geplant KH/Tag", value: signedDisplay(Math.round(effect.kohlenhydrate || 0), "g") }
    ];
  }

  function createPlanBalanceText(reportData) {
    const status = reportData?.fahrplanSolverStatus;
    if (!status) return "";
    const real = Number(status.echteBilanzschritte) || 0;
    const confirmations = Number(status.bestaetigungenProSchritt) || 3;
    if (status.modus === "v38_kumulativer_30_tage_solver") {
      return "Bilanzprüfung: Die App berechnet " + real + " kumulative Umbauten. Jeder Schritt wird " + confirmations + "x bestätigt, bleibt danach aktiv und nach Schritt 10 zählt die Summe aller Schritte.";
    }
    return "Bilanzprüfung: Die geplante Wirkung ist eine Näherung und sollte bei ungenauen Freitextmengen nach der ersten Woche überprüft werden.";
  }

  function createFahrplanIntro(reportData) {
    if (reportData?.fahrplanBilanz) return reportData.fahrplanBilanz;
    return "Dieser Fahrplan ist kein allgemeiner Ernährungsplan. Er ist ein kumulativer 30-Tage-Aufbau: Jeder Schritt wird 3x bestätigt, bleibt danach aktiv und nach Schritt 10 zählt die Summe aller Umbauten.";
  }

  function getStableBuildingBlocks() {
    const sourceItems = [];

    if (Array.isArray(report?.stabileBausteine)) {
      report.stabileBausteine.forEach(item => {
        sourceItems.push({
          lebensmittel: item?.lebensmittel || "",
          einordnung: [item?.begruendung, item?.hinweis].filter(Boolean).join(" ")
        });
      });
    }

    if (Array.isArray(report?.lebensmittelAnalyse)) {
      report.lebensmittelAnalyse.forEach(item => {
        sourceItems.push({
          lebensmittel: item?.lebensmittel || "",
          einordnung: item?.einordnung || ""
        });
      });
    }

    const hardReject = [
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
      "wurst",
      "aufschnitt",
      "nüsse",
      "nuss",
      "fett-treiber",
      "fetttreiber",
      "problem",
      "überschuss",
      "zuckerquelle",
      "stark verarbeitet"
    ];

    const allowed = [
      "hähnchen",
      "haehnchen",
      "pute",
      "putenbrust",
      "thunfisch",
      "ei",
      "eier",
      "magerquark",
      "quark",
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
      "kaese"
    ];

    const seen = new Set();

    return sourceItems
      .filter(item => item.lebensmittel)
      .filter(item => {
        const text = (item.lebensmittel + " " + item.einordnung).toLowerCase();
        const hasAllowed = allowed.some(keyword => text.includes(keyword));
        const hasReject = hardReject.some(keyword => text.includes(keyword));

        if (!hasAllowed || hasReject) return false;

        const key = item.lebensmittel.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);

        return true;
      })
      .slice(0, 6);
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

    const maxStepIndex = Math.max(0, (report?.zehnSchrittePlan?.length || 10) - 1);

    if (successfulDaysForCurrentStep >= 3 && activeStep < maxStepIndex) {
      setActiveStep(prev => prev + 1);
    }
  }

  function copyPreviousDay() {
    if (activeDay === 0) return;

    setDays(prev => {
      const copy = [...prev];
      copy[activeDay] = { ...copy[activeDay - 1] };
      return copy;
    });
  }

  function printAnalysis() {
    window.print();
  }

  async function runAnalysis() {
    if (!consentReady) {
      setWizardStep(2);
      setErrorText("Bitte bestätige zuerst die KI- und Datenschutzhinweise, bevor du die Analyse startest.");
      return;
    }

    setLoading(true);
    setErrorText("");
    setReport(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          form,
          days,
          consent: {
            aiAccepted: aiNoticeAccepted,
            privacyAccepted: privacyNoticeAccepted,
            version: CONSENT_VERSION,
            acceptedAt: new Date().toISOString()
          }
        })
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
      setWizardStep(3);
      setShowDetails(false);
      setResultTab("overview");
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

  const filledDaysCount = days.filter(day =>
    day.breakfast || day.lunch || day.dinner || day.snacks || day.drinks
  ).length;

  const currentDay = days[activeDay] || emptyDay;
  const stepStructure = getStepStructure();
  const stableBuildingBlocks = getStableBuildingBlocks();
  const fahrplanTarget = report ? createFahrplanTarget(report) : [];
  const fahrplanWeeklyTarget = report ? createWeeklyTargetCards(report) : [];
  const fahrplanPlanBalance = report ? createPlanBalanceCards(report) : [];
  const fahrplanBalanceText = report ? createPlanBalanceText(report) : "";
  const fahrplanIntro = report ? createFahrplanIntro(report) : "";

  return (
    <main style={styles.page}>
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #f2eadc !important;
          }

          main {
            padding: 0 !important;
            background: #f2eadc !important;
          }

          .no-print,
          .screen-report-intro,
          .print-section,
          .result-tabs {
            display: none !important;
          }

          .pdf-report {
            display: block !important;
            background: #f2eadc !important;
            color: #142016 !important;
            font-family: Arial, Helvetica, sans-serif !important;
          }

          .pdf-page {
            width: 180mm !important;
            min-height: 245mm !important;
            height: auto !important;
            max-height: none !important;
            padding: 12mm 13mm !important;
            margin: 0 auto !important;
            box-sizing: border-box !important;
            page-break-after: always !important;
            break-after: page !important;
            background: #f2eadc !important;
            position: relative !important;
            overflow: visible !important;
          }

          .pdf-report .pdf-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .pdf-cover-page {
            min-height: 245mm !important;
            height: 245mm !important;
            max-height: 245mm !important;
            padding: 16mm !important;
            overflow: hidden !important;
            background:
              radial-gradient(circle at 14% 12%, rgba(200, 169, 106, 0.28), transparent 30%),
              radial-gradient(circle at 88% 82%, rgba(200, 169, 106, 0.16), transparent 28%),
              linear-gradient(135deg, #06140d 0%, #0d2418 58%, #020604 100%) !important;
            color: #f4efe4 !important;
            display: grid !important;
            grid-template-rows: auto 1fr auto !important;
            gap: 8mm !important;
          }

          .pdf-cover-mark {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
          }

          .pdf-logo-cover {
            width: 24mm !important;
            height: 24mm !important;
            object-fit: contain !important;
          }

          .pdf-cover-brand {
            color: #c8a96a !important;
            letter-spacing: 4px !important;
            text-transform: uppercase !important;
            font-size: 10px !important;
            font-weight: 800 !important;
          }

          .pdf-cover-main {
            align-self: center !important;
            max-width: 138mm !important;
            padding-bottom: 8mm !important;
          }

          .pdf-cover-kicker {
            color: #c8a96a !important;
            text-transform: uppercase !important;
            letter-spacing: 2.5px !important;
            font-size: 10px !important;
            font-weight: 800 !important;
            margin-bottom: 7mm !important;
          }

          .pdf-cover-main h1 {
            color: #f4efe4 !important;
            font-size: 40px !important;
            line-height: 1.02 !important;
            margin: 0 0 7mm 0 !important;
            font-weight: 800 !important;
          }

          .pdf-cover-main p {
            color: #ded2bc !important;
            font-size: 14.5px !important;
            line-height: 1.55 !important;
            margin: 0 !important;
            max-width: 130mm !important;
          }

          .pdf-cover-meta-grid {
            display: grid !important;
            grid-template-columns: 1fr 1.1fr 1.2fr !important;
            gap: 5mm !important;
            border-top: 1px solid rgba(200, 169, 106, 0.7) !important;
            padding-top: 5mm !important;
          }

          .pdf-cover-meta-grid span {
            display: block !important;
            color: rgba(244, 239, 228, 0.68) !important;
            font-size: 9px !important;
            text-transform: uppercase !important;
            letter-spacing: 1.5px !important;
            margin-bottom: 2mm !important;
          }

          .pdf-cover-meta-grid strong {
            display: block !important;
            color: #c8a96a !important;
            font-size: 11.5px !important;
            line-height: 1.35 !important;
          }

          .pdf-page-light {
            background:
              linear-gradient(90deg, rgba(200, 169, 106, 0.12), transparent 38%),
              #f2eadc !important;
          }

          .pdf-page-final {
            background:
              radial-gradient(circle at 90% 8%, rgba(200, 169, 106, 0.18), transparent 30%),
              linear-gradient(135deg, #f2eadc 0%, #ebe0cd 100%) !important;
          }

          .pdf-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            border-bottom: 1px solid #c8a96a !important;
            padding-bottom: 6mm !important;
            margin-bottom: 8mm !important;
          }

          .pdf-header-left {
            display: flex !important;
            align-items: center !important;
            gap: 5mm !important;
          }

          .pdf-header-left img {
            width: 14mm !important;
            height: 14mm !important;
            object-fit: contain !important;
          }

          .pdf-header-left span {
            display: block !important;
            color: #9f7b2e !important;
            letter-spacing: 2.5px !important;
            text-transform: uppercase !important;
            font-size: 8.5px !important;
            font-weight: 800 !important;
            margin-bottom: 2mm !important;
          }

          .pdf-header-left strong {
            display: block !important;
            color: #123421 !important;
            font-size: 25px !important;
            line-height: 1.1 !important;
          }

          .pdf-header-number {
            color: rgba(18, 52, 33, 0.14) !important;
            font-size: 34px !important;
            font-weight: 900 !important;
          }

          .pdf-summary-hero {
            background: #102b1d !important;
            color: #f4efe4 !important;
            border: 1px solid #c8a96a !important;
            border-radius: 11px !important;
            padding: 8mm !important;
            margin-bottom: 6mm !important;
          }

          .pdf-summary-hero span,
          .pdf-card span,
          .pdf-first-step span,
          .pdf-final-cta span {
            color: #9f7b2e !important;
            text-transform: uppercase !important;
            letter-spacing: 1.8px !important;
            font-size: 8.5px !important;
            font-weight: 800 !important;
          }

          .pdf-card-intro {
            font-size: 8.2pt !important;
            color: #4f4a3f !important;
            line-height: 1.38 !important;
            margin: 0 0 4mm !important;
          }

          .pdf-summary-hero h2 {
            color: #f4efe4 !important;
            font-size: 20px !important;
            line-height: 1.35 !important;
            margin: 3mm 0 0 0 !important;
          }

          .pdf-score-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 4mm !important;
            margin-bottom: 6mm !important;
          }

          .pdf-score-grid-small {
            grid-template-columns: repeat(4, 1fr) !important;
            margin-top: 4mm !important;
            margin-bottom: 0 !important;
            gap: 3mm !important;
          }

          .pdf-target-card .pdf-score-card {
            padding: 4mm !important;
          }

          .pdf-target-card .pdf-score-card strong {
            font-size: 12px !important;
          }


          .pdf-small-note {
            margin: 4mm 0 0 0 !important;
            color: #4c4b45 !important;
            font-size: 10px !important;
            line-height: 1.45 !important;
          }

          .pdf-score-card {
            background: #fffaf0 !important;
            border: 1px solid #d7c491 !important;
            border-radius: 10px !important;
            padding: 6mm !important;
          }

          .pdf-score-card span {
            display: block !important;
            color: #9f7b2e !important;
            letter-spacing: 1.5px !important;
            text-transform: uppercase !important;
            font-size: 8.5px !important;
            font-weight: 800 !important;
            margin-bottom: 3mm !important;
          }

          .pdf-score-card strong {
            display: block !important;
            color: #123421 !important;
            font-size: 15px !important;
            line-height: 1.25 !important;
          }

          .pdf-two-column {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 5mm !important;
          }

          .pdf-gap-large {
            margin-bottom: 6mm !important;
          }

          .pdf-card {
            background: #fffaf0 !important;
            border: 1px solid #d7c491 !important;
            border-left: 4px solid #c8a96a !important;
            border-radius: 11px !important;
            padding: 6mm !important;
            color: #142016 !important;
            box-sizing: border-box !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .pdf-card-dark {
            background: #102b1d !important;
            color: #f4efe4 !important;
          }

          .pdf-card-dark p {
            color: #f4efe4 !important;
          }

          .pdf-card-wide {
            margin-top: 5mm !important;
          }

          .pdf-card-tall {
            min-height: 118mm !important;
          }

          .pdf-card p,
          .pdf-source-item p,
          .pdf-roadmap-row p,
          .pdf-note-row p,
          .pdf-table-card span,
          .pdf-table-card strong,
          .pdf-final-cta p {
            color: #142016 !important;
            font-size: 10.8px !important;
            line-height: 1.42 !important;
            margin: 2mm 0 0 0 !important;
          }

          .pdf-card.pdf-card-dark p,
          .pdf-card.pdf-card-dark span,
          .pdf-card.pdf-card-dark strong {
            color: #f4efe4 !important;
          }

          .pdf-table-card {
            background: #fffaf0 !important;
            border: 1px solid #d7c491 !important;
            border-radius: 11px !important;
            overflow: hidden !important;
            margin-top: 5mm !important;
          }

          .pdf-table-head,
          .pdf-table-row {
            display: grid !important;
            grid-template-columns: 1.05fr 1fr 1fr 1fr 1fr !important;
            gap: 2mm !important;
            padding: 4mm 5mm !important;
            align-items: center !important;
          }

          .pdf-table-head {
            background: #102b1d !important;
          }

          .pdf-table-head span {
            color: #c8a96a !important;
            font-size: 8.5px !important;
            text-transform: uppercase !important;
            letter-spacing: 1px !important;
            font-weight: 800 !important;
          }

          .pdf-table-row {
            border-top: 1px solid #e1d1a8 !important;
          }

          .pdf-table-row-accent {
            background: #eadfca !important;
          }

          .pdf-first-step {
            display: grid !important;
            grid-template-columns: 24mm 1fr !important;
            gap: 7mm !important;
            background: #102b1d !important;
            color: #f4efe4 !important;
            border: 1px solid #c8a96a !important;
            border-radius: 14px !important;
            padding: 9mm !important;
            margin-bottom: 6mm !important;
          }

          .pdf-first-step h2 {
            color: #f4efe4 !important;
            margin: 2mm 0 4mm 0 !important;
            font-size: 22px !important;
            line-height: 1.18 !important;
          }

          .pdf-first-step p {
            color: #f4efe4 !important;
            font-size: 14px !important;
            line-height: 1.45 !important;
            margin: 0 !important;
          }

          .pdf-step-number-large {
            color: rgba(200, 169, 106, 0.35) !important;
            font-size: 45px !important;
            font-weight: 900 !important;
            line-height: 1 !important;
          }

          .pdf-note-row {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 5mm !important;
            margin-bottom: 5mm !important;
          }

          .pdf-note-row > div {
            background: #eadfca !important;
            border-left: 4px solid #c8a96a !important;
            border-radius: 10px !important;
            padding: 5mm !important;
          }

          .pdf-note-row strong {
            color: #123421 !important;
            font-size: 12px !important;
          }

          .pdf-hebel-list {
            margin: 3mm 0 0 0 !important;
            padding-left: 5mm !important;
          }

          .pdf-hebel-list li {
            color: #142016 !important;
            font-size: 10.8px !important;
            line-height: 1.38 !important;
            margin-bottom: 2mm !important;
          }

          .pdf-roadmap-list {
            display: grid !important;
            gap: 4mm !important;
          }

          .pdf-roadmap-row {
            display: grid !important;
            grid-template-columns: 12mm 1fr !important;
            gap: 5mm !important;
            align-items: start !important;
            background: #fffaf0 !important;
            border: 1px solid #d7c491 !important;
            border-radius: 11px !important;
            padding: 5mm !important;
            min-height: 34mm !important;
            box-sizing: border-box !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .pdf-roadmap-index {
            width: 10mm !important;
            height: 10mm !important;
            border-radius: 50% !important;
            background: #102b1d !important;
            color: #c8a96a !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-weight: 900 !important;
            font-size: 11px !important;
          }

          .pdf-roadmap-row p {
            font-size: 10.6px !important;
            line-height: 1.36 !important;
            margin: 0 !important;
          }

          .pdf-roadmap-title {
            display: block !important;
            color: #102b1d !important;
            font-size: 13px !important;
            line-height: 1.2 !important;
            margin-bottom: 1.5mm !important;
          }

          .pdf-roadmap-action {
            color: #142016 !important;
            margin-bottom: 2mm !important;
          }

          .pdf-roadmap-meta {
            display: grid !important;
            gap: 1mm !important;
            color: #5c614d !important;
            font-size: 9.5px !important;
            line-height: 1.25 !important;
          }

          .pdf-source-item {
            border-top: 1px solid #e0d2ab !important;
            padding-top: 3mm !important;
            margin-top: 3mm !important;
          }

          .pdf-source-item strong {
            color: #123421 !important;
            font-size: 11.2px !important;
          }

          .pdf-source-positive {
            border-left: 3px solid #789b61 !important;
            padding-left: 3mm !important;
          }

          .pdf-pattern-strip {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 3mm !important;
            margin-top: 6mm !important;
          }

          .pdf-pattern-strip > div {
            background: #eadfca !important;
            border-radius: 9px !important;
            padding: 4mm !important;
          }

          .pdf-pattern-strip strong {
            color: #123421 !important;
            font-size: 10.5px !important;
          }

          .pdf-pattern-strip p {
            color: #142016 !important;
            font-size: 9.8px !important;
            line-height: 1.35 !important;
            margin: 2mm 0 0 0 !important;
          }

          .pdf-final-cta {
            display: grid !important;
            grid-template-columns: 24mm 1fr !important;
            gap: 8mm !important;
            background: #102b1d !important;
            border: 1px solid #c8a96a !important;
            border-radius: 15px !important;
            padding: 9mm !important;
            margin-top: 8mm !important;
          }

          .pdf-final-cta img {
            width: 20mm !important;
            height: 20mm !important;
            object-fit: contain !important;
          }

          .pdf-final-cta h2 {
            color: #f4efe4 !important;
            font-size: 22px !important;
            line-height: 1.2 !important;
            margin: 3mm 0 !important;
          }

          .pdf-final-cta p {
            color: #ded2bc !important;
            font-size: 12px !important;
            line-height: 1.5 !important;
          }

          .pdf-final-cta strong {
            display: block !important;
            color: #c8a96a !important;
            font-size: 12px !important;
            margin-top: 5mm !important;
          }

          .pdf-footer {
            position: absolute !important;
            left: 16mm !important;
            right: 16mm !important;
            bottom: 9mm !important;
            display: flex !important;
            justify-content: space-between !important;
            border-top: 1px solid rgba(18, 52, 33, 0.22) !important;
            padding-top: 3mm !important;
            color: rgba(18, 52, 33, 0.58) !important;
            font-size: 9px !important;
            letter-spacing: 0.4px !important;
          }

          .pdf-footer-inverted {
            color: rgba(18, 52, 33, 0.58) !important;
          }
        }

        .pdf-report {
          display: none;
        }

        @media (max-width: 820px) {
          .hero-grid,
          .two-column-grid,
          .result-grid {
            grid-template-columns: 1fr !important;
          }

          .wizard-card {
            padding: 22px !important;
          }

          .page-title {
            font-size: 42px !important;
          }
        }
      `}</style>

      <div style={styles.shell}>
        <section style={styles.hero} className="hero-grid no-print">
          <div>
            <div style={styles.brand}>NORDSCHMIEDE</div>
            <h1 style={styles.h1} className="page-title">
              Ernährungsanalyse
            </h1>
            <p style={styles.heroText}>
              7 Tage Ehrlichkeit. Ein klarer Blick auf deinen aktuellen Zustand.
              Und ein strukturierter Weg zurück in Kontrolle.
            </p>
          </div>

          <div style={styles.heroBox}>
            <div style={styles.heroBoxLabel}>Nordschmiede Analyseprinzip</div>
            <p style={styles.heroBoxText}>
              Schritt für Schritt durch Ziel, Körperdaten, 7 Tage Ernährung und
              konkrete Umsetzung. Keine Diät. Keine Formularwand. Eine geführte
              Momentaufnahme deiner Ernährungsrealität.
            </p>
          </div>
        </section>

        <div className="no-print" style={styles.topBar}>
          <WizardProgress current={wizardStep} setCurrent={setWizardStep} report={report} />

          <div style={styles.actionRow}>
            <button style={styles.secondaryButton} onClick={fillExample}>
              Beispiel ausfüllen
            </button>

            <button style={styles.ghostButton} onClick={resetApp}>
              Alles zurücksetzen
            </button>
          </div>
        </div>

        {report && (
          <div style={styles.saveNotice} className="no-print">
            Fortschritt gespeichert. Dein Stand wird auf diesem Gerät und in diesem Browser gespeichert. Wenn du Browserdaten löschst oder ein anderes Gerät nutzt, ist der Fortschritt dort nicht verfügbar.
          </div>
        )}

        {errorText && (
          <div style={styles.errorBox} className="no-print">
            <strong>Fehler:</strong> {errorText}
          </div>
        )}

        {wizardStep === 0 && (
          <section style={styles.card} className="wizard-card no-print">
            <span style={styles.kicker}>01 Start</span>
            <h2 style={styles.h2}>Worum geht es dir gerade?</h2>

            <p style={styles.bodyText}>
              Diese Analyse funktioniert am besten, wenn du ein klares Ziel auswählst.
              Es geht nicht um perfekte Ernährung, sondern um eine ehrliche Momentaufnahme
              deiner aktuellen Realität.
            </p>

            <div style={styles.goalGrid}>
              {[
                "abnehmen",
                "Gewicht halten",
                "Muskelaufbau",
                "mehr Energie",
                "bessere Struktur",
                "Regeneration verbessern"
              ].map(goal => (
                <button
                  key={goal}
                  style={{
                    ...styles.goalButton,
                    borderColor: form.goal === goal ? GOLD : "rgba(200,169,106,0.22)",
                    background: form.goal === goal ? "rgba(200,169,106,0.16)" : "rgba(7,23,15,0.58)"
                  }}
                  onClick={() => updateForm("goal", goal)}
                >
                  {goal}
                </button>
              ))}
            </div>

            <div style={styles.navigationRow}>
              <button style={styles.primaryButton} onClick={() => setWizardStep(1)}>
                Weiter zu den Körperdaten
              </button>
            </div>
          </section>
        )}

        {wizardStep === 1 && (
          <section style={styles.card} className="wizard-card no-print">
            <span style={styles.kicker}>02 Körperdaten</span>
            <h2 style={styles.h2}>Deine Ausgangslage</h2>

            <p style={styles.bodyText}>
              Diese Angaben helfen der Analyse, deinen Ist-Zustand besser einzuordnen.
              Je klarer Ziel, Körperdaten und Alltag sind, desto sinnvoller werden die
              späteren Schritte.
            </p>

            <div style={styles.grid}>
              <Input label="Alter" value={form.age} onChange={v => updateForm("age", v)} />
              <Input label="Größe in cm" value={form.height} onChange={v => updateForm("height", v)} />
              <Input label="Geschlecht" value={form.gender} onChange={v => updateForm("gender", v)} />
              <Input label="Aktuelles Gewicht in kg" value={form.weight} onChange={v => updateForm("weight", v)} />
              <Input label="Zielgewicht in kg" value={form.targetWeight} onChange={v => updateForm("targetWeight", v)} />
              <Input label="Ziel" value={form.goal} onChange={v => updateForm("goal", v)} />
              <Input label="Aktivität: sitzend, leicht aktiv, moderat aktiv, sehr aktiv ..." value={form.activityLevel} onChange={v => updateForm("activityLevel", v)} />
              <Input label="Ernährungsform: Mischkost, vegetarisch, Low Carb, Keto, vegetarisch, vegan ..." value={form.dietType} onChange={v => updateForm("dietType", v)} />
              <Input label="Allergien / Unverträglichkeiten" value={form.intolerances} onChange={v => updateForm("intolerances", v)} />
              <Input label="Lebensmittel vermeiden" value={form.dislikes} onChange={v => updateForm("dislikes", v)} />
              <Input label="Maximale Zubereitungszeit" value={form.cookingTime} onChange={v => updateForm("cookingTime", v)} />
            </div>

            <div style={styles.navigationRow}>
              <button style={styles.ghostButton} onClick={() => setWizardStep(0)}>
                Zurück
              </button>
              <button style={styles.primaryButton} onClick={() => setWizardStep(2)}>
                Weiter zur 7-Tage-Ernährung
              </button>
            </div>
          </section>
        )}

        {wizardStep === 2 && (
          <section style={styles.card} className="wizard-card no-print">
            <div style={styles.foodHeader}>
              <div>
                <span style={styles.kicker}>03 Ernährung</span>
                <h2 style={styles.h2}>7 Tage Ernährung</h2>
              </div>

              <div style={styles.dayCounter}>Tag {activeDay + 1} von 7</div>
            </div>

            <p style={styles.bodyText}>
              Je genauer du Mengen angibst, desto genauer kann die Analyse werden.
              Nutze möglichst konkrete Angaben wie 200 ml Cola, 200 g Joghurt,
              150 g Pommes oder 2 Scheiben Brot.
            </p>

            <div style={styles.miniProgress}>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: String((filledDaysCount / 7) * 100) + "%" }} />
              </div>
              <p style={styles.smallText}>
                {filledDaysCount} von 7 Tagen enthalten bereits Angaben.
              </p>
            </div>

            <ConsentBox
              aiNoticeAccepted={aiNoticeAccepted}
              setAiNoticeAccepted={setAiNoticeAccepted}
              privacyNoticeAccepted={privacyNoticeAccepted}
              setPrivacyNoticeAccepted={setPrivacyNoticeAccepted}
            />

            <div style={styles.topAnalyzeRow}>
              <div>
                <strong style={styles.topAnalyzeTitle}>Bereit zur Auswertung?</strong>
                <p style={styles.topAnalyzeText}>
                  Wenn deine 7 Tage ausgefüllt sind, kannst du die Analyse direkt hier starten.
                </p>
              </div>

              <button
                style={{
                  ...styles.primaryButton,
                  opacity: analysisDisabled ? 0.65 : 1,
                  cursor: analysisDisabled ? "not-allowed" : "pointer"
                }}
                disabled={analysisDisabled}
                onClick={runAnalysis}
              >
                {getAnalysisButtonText("Analyse starten")}
              </button>
            </div>

            <div style={styles.dayTabs}>
              {days.map((day, index) => {
                const isFilled = day.breakfast || day.lunch || day.dinner || day.snacks || day.drinks;

                return (
                  <button
                    key={index}
                    style={{
                      ...styles.dayTab,
                      borderColor: activeDay === index ? GOLD : "rgba(255,255,255,0.1)",
                      color: activeDay === index ? GOLD : MUTED
                    }}
                    onClick={() => setActiveDay(index)}
                  >
                    Tag {index + 1}
                    {isFilled ? " ✓" : ""}
                  </button>
                );
              })}
            </div>

            <div style={styles.dayEditor}>
              <h3 style={styles.h3}>Tag {activeDay + 1}</h3>

              <Textarea
                label="Frühstück"
                helper="Beispiel: 2 Scheiben Brot ca. 100 g mit 15 g Butter, 1 Kaffee mit 50 ml Milch"
                value={currentDay.breakfast}
                onChange={v => updateDay(activeDay, "breakfast", v)}
              />

              <Textarea
                label="Mittagessen"
                helper="Beispiel: 120 g Nudeln ungekocht mit 180 g Bolognese"
                value={currentDay.lunch}
                onChange={v => updateDay(activeDay, "lunch", v)}
              />

              <Textarea
                label="Abendessen"
                helper="Beispiel: 2 Scheiben Brot ca. 100 g mit 40 g Käse und 60 g Pute"
                value={currentDay.dinner}
                onChange={v => updateDay(activeDay, "dinner", v)}
              />

              <Textarea
                label="Snacks"
                helper="Beispiel: 50 g Schokolade, 30 g Nüsse, 1 Proteinriegel ca. 60 g"
                value={currentDay.snacks}
                onChange={v => updateDay(activeDay, "snacks", v)}
              />

              <Textarea
                label="Getränke"
                helper="Beispiel: 2 l Wasser, 300 ml Cola, 2 Kaffee"
                value={currentDay.drinks}
                onChange={v => updateDay(activeDay, "drinks", v)}
              />
            </div>

            <div style={styles.navigationRow}>
              <button style={styles.ghostButton} onClick={() => setWizardStep(1)}>
                Zurück
              </button>

              <button
                style={{
                  ...styles.secondaryButton,
                  opacity: activeDay === 0 ? 0.45 : 1,
                  cursor: activeDay === 0 ? "not-allowed" : "pointer"
                }}
                disabled={activeDay === 0}
                onClick={copyPreviousDay}
              >
                Ähnlich wie gestern
              </button>

              <button
                style={{
                  ...styles.secondaryButton,
                  opacity: activeDay === 0 ? 0.45 : 1,
                  cursor: activeDay === 0 ? "not-allowed" : "pointer"
                }}
                disabled={activeDay === 0}
                onClick={() => setActiveDay(prev => Math.max(prev - 1, 0))}
              >
                Vorheriger Tag
              </button>

              {activeDay < 6 ? (
                <button style={styles.primaryButton} onClick={() => setActiveDay(prev => Math.min(prev + 1, 6))}>
                  Nächster Tag
                </button>
              ) : (
                <button
                  style={{
                    ...styles.primaryButton,
                    opacity: analysisDisabled ? 0.65 : 1,
                    cursor: analysisDisabled ? "not-allowed" : "pointer"
                  }}
                  disabled={analysisDisabled}
                  onClick={runAnalysis}
                >
                  {getAnalysisButtonText("Analyse starten", "Neue Analyse in Begleitung freischalten")}
                </button>
              )}
            </div>

            <div style={styles.analyzeBox}>
              <p style={styles.smallText}>
                Du musst nicht perfekt sein. Eine ehrliche, grobe Analyse ist besser als
                gar keine Analyse. Je genauer die Mengen, desto klarer werden die Zahlen.
              </p>

              <button
                style={{
                  ...styles.secondaryButton,
                  opacity: analysisDisabled ? 0.65 : 1,
                  cursor: analysisDisabled ? "not-allowed" : "pointer"
                }}
                disabled={analysisDisabled}
                onClick={runAnalysis}
              >
                {getAnalysisButtonText("Analyse jetzt starten")}
              </button>
            </div>
          </section>
        )}

        {wizardStep === 3 && (
          <section style={styles.results}>
            {!report && (
              <div style={styles.card} className="no-print">
                <span style={styles.kicker}>04 Analyse</span>
                <h2 style={styles.h2}>Noch keine Analyse erstellt</h2>
                <p style={styles.bodyText}>
                  Fülle deine 7 Tage Ernährung aus und starte dann die Auswertung.
                </p>

                <div style={styles.navigationRow}>
                  <button style={styles.ghostButton} onClick={() => setWizardStep(2)}>
                    Zur Ernährung
                  </button>
                  <button style={styles.primaryButton} onClick={runAnalysis} disabled={loading}>
                    {loading ? "Analyse läuft..." : "Analyse starten"}
                  </button>
                </div>
              </div>
            )}

            {report && (
              <>
                <PdfReport
                  report={report}
                  todayLabel={todayLabel}
                  stableBuildingBlocks={stableBuildingBlocks}
                  cleanStepText={cleanStepText}
                  createResultSentence={createResultSentence}
                  formatDifference={formatDifference}
                />

                <div style={styles.resultIntro} className="screen-report-intro no-print">
                  <span style={styles.kicker}>04 Analyse</span>
                  <h2 style={styles.h1} className="page-title">Auswertung</h2>
                  <p style={styles.heroText}>{createResultSentence(report)}</p>
                </div>

                <ResultTabs current={resultTab} setCurrent={setResultTab} />

                {resultTab === "overview" && (
                  <>
                    <div style={styles.diagnosisCard} className="print-section">
                      <span style={styles.kicker}>Dein Ergebnis in einem Satz</span>
                      <h2 style={styles.h2}>Priorität statt Datenflut</h2>
                      <p style={styles.focusTextSmall}>{createResultSentence(report)}</p>
                    </div>

                    {report.schaetzHinweis && (
                      <div style={styles.card} className="print-section print-compact-card">
                        <h2 style={styles.h2}>Schätzqualität</h2>
                        <p style={styles.bodyText}>{report.schaetzHinweis}</p>
                      </div>
                    )}

                    <div style={styles.resultGrid} className="result-grid">
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
                      <h2 style={styles.h2}>Kernproblem</h2>
                      <p style={styles.bodyText}>{report.zentralesProblem}</p>

                      <div style={styles.navigationRow} className="no-print">
                        <button style={styles.primaryButton} onClick={() => setResultTab("implementation")}>
                          Umsetzung starten
                        </button>
                        <button style={styles.secondaryButton} onClick={() => setResultTab("patterns")}>
                          Muster ansehen
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {resultTab === "implementation" && (
                  <>
                    <div style={styles.correctionCard} className="print-section">
                      <span style={styles.kicker}>Ziel dieses Fahrplans</span>
                      <h2 style={styles.h2}>Die 10 Schritte bauen deinen Durchschnittstag um</h2>
                      <p style={styles.bodyText}>{fahrplanIntro}</p>
                      <div style={styles.correctionGrid}>
                        {fahrplanTarget.map((item, index) => (
                          <div key={index} style={styles.correctionItem}>
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>

                      {fahrplanPlanBalance.length > 0 && (
                        <>
                          <p style={styles.smallText}><strong>Geplante Wirkung nach Schritt 10:</strong></p>
                          <div style={styles.correctionGrid}>
                            {fahrplanPlanBalance.map((item, index) => (
                              <div key={index} style={styles.correctionItem}>
                                <span>{item.label}</span>
                                <strong>{item.value}</strong>
                              </div>
                            ))}
                          </div>
                          {fahrplanBalanceText && <p style={styles.smallText}>{fahrplanBalanceText}</p>}
                        </>
                      )}

                      <p style={styles.smallText}>
                        Die App rechnet die Wirkung aller 10 Schritte kumuliert. Jeder Schritt wird 3x bestätigt, bleibt danach aktiv und nach Schritt 10 zählt die Summe aller Umbauten.
                      </p>
                    </div>

                    <div style={styles.focusCard} className="print-section">
                      <span style={styles.kicker}>Dein aktueller Umsetzungsschritt</span>
                      <h2 style={styles.h2}>Schritt {activeStep + 1} von 10</h2>

                      <div style={styles.structuredStepGrid}>
                        <div style={styles.stepMainBox}>
                          <span style={styles.stepBoxTitle}>Jetzt umsetzen</span>
                          <strong style={styles.currentStepTitle}>{stepStructure.title}</strong>
                          <p style={styles.focusText}>{stepStructure.action}</p>
                        </div>

                        <div style={styles.stepMetaGrid}>
                          <div style={styles.smallInfoBox}>
                            <strong>Häufigkeit</strong>
                            <p style={styles.smallText}>{stepStructure.frequency}</p>
                          </div>

                          <div style={styles.smallInfoBox}>
                            <strong>Fokus</strong>
                            <p style={styles.smallText}>{stepStructure.focus}</p>
                          </div>
                        </div>

                        <p style={styles.stepWhyText}>{stepStructure.why}</p>
                      </div>

                      <div style={styles.progressBox} className="no-print">
                        <p style={styles.smallText}>
                          Erfolgreiche Umsetzungstage für diesen Schritt: {successfulDaysForCurrentStep} von 3
                        </p>

                        <div style={styles.progressBar}>
                          <div style={{ ...styles.progressFill, width: String((successfulDaysForCurrentStep / 3) * 100) + "%" }} />
                        </div>
                      </div>

                      <div style={styles.checkHint} className="no-print">
                        Setze diesen Schritt 3x erfolgreich um. Danach wird der nächste Schritt freigeschaltet; alle bisherigen Schritte bleiben aktiv.
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
                    </div>

                    <div style={styles.softCtaCard} className="no-print">
                      <span style={styles.kicker}>Weiterführende Orientierung</span>
                      <p style={styles.bodyText}>
                        Deine Ernährung ist ein Teil deiner körperlichen Selbstführung. Wenn du zusätzlich Themen wie Schmerz, Belastung, Training, Stress oder Körpersicherheit besser einordnen möchtest, findest du im Körperkompass kostenlose Orientierungshilfen.
                      </p>
                      <a href={KORPERKOMPASS_URL} target="_blank" rel="noreferrer" style={styles.ctaButton}>
                        Weiter zum Körperkompass
                      </a>
                    </div>
                  </>
                )}

                {resultTab === "patterns" && (
                  <>
                    {Array.isArray(report.problemMuster) && report.problemMuster.length > 0 && (
                      <div style={styles.card} className="print-section">
                        <span style={styles.kicker}>Ernährungsrealität</span>
                        <h2 style={styles.h2}>Erkannte Muster</h2>

                        <div style={styles.patternGrid}>
                          {report.problemMuster.map((item, index) => (
                            <div key={index} style={styles.driverRow}>
                              <strong>{item.muster}</strong>
                              <p style={styles.smallText}>{item.beobachtung}</p>
                              <p style={styles.smallText}><strong>Hebel:</strong> {item.hebel}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={styles.twoColumn} className="two-column-grid">
                      <div style={styles.card} className="print-section">
                        <span style={styles.kicker}>Muster</span>
                        <h2 style={styles.h2}>Dein größtes Potenzial</h2>
                        <p style={styles.bodyText}>
                          Diese Punkte zeigen, wo in deinen 7 Tagen aktuell der größte Hebel liegt.
                          Sie sind nicht verboten – aber hier kannst du mit kleinen Anpassungen am meisten bewegen.
                        </p>
                        {(report.topKalorienQuellen || []).slice(0, 5).map((item, index) => (
                          <div key={index} style={styles.driverRow}>
                            <strong>{index + 1}. {item.lebensmittel}</strong>
                            {item.rolle && <span style={styles.rolePill}>{item.rolle}</span>}
                            <span>{item.kcal} kcal · {item.anteil}</span>
                            <p style={styles.smallText}>{item.grund}</p>
                          </div>
                        ))}
                      </div>

                      <div style={styles.card} className="print-section">
                        <span style={styles.kicker}>Grundlage</span>
                        <h2 style={styles.h2}>Deine stabile Grundlage</h2>
                        <p style={styles.bodyText}>
                          Diese Lebensmittel und Gewohnheiten kannst du als Fundament nutzen.
                          Sie geben deiner Ernährung Struktur, Protein, Flüssigkeit oder Sättigung – je nach Menge und Kontext.
                        </p>

                        {stableBuildingBlocks.length > 0 ? (
                          stableBuildingBlocks.map((item, index) => (
                            <div key={index} style={styles.driverRow}>
                              <strong>{item.lebensmittel}</strong>
                              <p style={styles.smallText}>{item.einordnung}</p>
                            </div>
                          ))
                        ) : (
                          <p style={styles.bodyText}>
                            In deinen 7 Tagen sind noch wenige stabile Grundlagen sichtbar.
                            Der erste Fokus liegt daher nicht auf Feintuning, sondern auf einfachen Grundlagen:
                            Flüssigkalorien reduzieren, Proteinquellen aufbauen und Mahlzeiten strukturieren.
                          </p>
                        )}
                      </div>
                    </div>

                    <div style={styles.twoColumn} className="two-column-grid">
                      <div style={styles.card} className="print-section">
                        <h2 style={styles.h2}>Größte Hebel</h2>
                        <ul style={styles.list}>
                          {report.groessteHebel?.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </div>

                      <div style={styles.card} className="print-section">
                        <h2 style={styles.h2}>Nächste konkrete Änderung</h2>
                        <p style={styles.bodyText}>{report.naechsteKonkreteAenderung}</p>
                      </div>
                    </div>

                    <div style={styles.navigationRow} className="no-print">
                      <button style={styles.primaryButton} onClick={() => setResultTab("implementation")}>
                        Zur Umsetzung
                      </button>
                      <button style={styles.secondaryButton} onClick={() => setResultTab("report")}>
                        Zum Bericht
                      </button>
                    </div>
                  </>
                )}

                {resultTab === "report" && (
                  <>
                    <div style={styles.reportHeader} className="print-section">
                      <span style={styles.kicker}>Bericht</span>
                      <h2 style={styles.h2}>Dein Analysebericht</h2>
                      <p style={styles.bodyText}>
                        Dieser Bericht fasst deine aktuelle Ernährungsrealität zusammen. Der komplette 10-Schritte-Fahrplan ist sichtbar, aber die App führt dich bewusst als 30-Tage-Aufbau Schritt für Schritt durch die Umsetzung.
                      </p>

                      <div style={styles.navigationRow} className="no-print">
                        <button style={styles.primaryButton} onClick={printAnalysis}>
                          Analyse als PDF speichern
                        </button>
                      </div>
                    </div>

                    <div style={styles.diagnosisCard} className="print-section">
                      <span style={styles.kicker}>Ergebnis in einem Satz</span>
                      <p style={styles.focusTextSmall}>{createResultSentence(report)}</p>
                    </div>

                    {report.schaetzHinweis && (
                      <div style={styles.card} className="print-section print-compact-card">
                        <h2 style={styles.h2}>Schätzqualität</h2>
                        <p style={styles.bodyText}>{report.schaetzHinweis}</p>
                      </div>
                    )}

                    <div style={styles.resultGrid} className="result-grid">
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
                      <h2 style={styles.h2}>Kernproblem</h2>
                      <p style={styles.bodyText}>{report.zentralesProblem}</p>
                    </div>

                    {Array.isArray(report.problemMuster) && report.problemMuster.length > 0 && (
                      <div style={styles.card} className="print-section">
                        <h2 style={styles.h2}>Erkannte Ernährungsmuster</h2>

                        <div style={styles.patternGrid}>
                          {report.problemMuster.map((item, index) => (
                            <div key={index} style={styles.driverRow}>
                              <strong>{item.muster}</strong>
                              <p style={styles.smallText}>{item.beobachtung}</p>
                              <p style={styles.smallText}><strong>Hebel:</strong> {item.hebel}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={styles.correctionCard} className="print-section">
                      <span style={styles.kicker}>Ziel dieses Fahrplans</span>
                      <h2 style={styles.h2}>Ist-Soll-Differenz schließen</h2>
                      <p style={styles.bodyText}>{fahrplanIntro}</p>
                      <div style={styles.correctionGrid}>
                        {fahrplanTarget.map((item, index) => (
                          <div key={index} style={styles.correctionItem}>
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>

                      {fahrplanPlanBalance.length > 0 && (
                        <>
                          <p style={styles.smallText}><strong>Geplante Wirkung nach Schritt 10:</strong></p>
                          <div style={styles.correctionGrid}>
                            {fahrplanPlanBalance.map((item, index) => (
                              <div key={index} style={styles.correctionItem}>
                                <span>{item.label}</span>
                                <strong>{item.value}</strong>
                              </div>
                            ))}
                          </div>
                          {fahrplanBalanceText && <p style={styles.smallText}>{fahrplanBalanceText}</p>}
                        </>
                      )}

                      <p style={styles.smallText}>
                        Die App rechnet die Wirkung aller 10 Schritte kumuliert. Jeder Schritt wird 3x bestätigt, bleibt danach aktiv und nach Schritt 10 zählt die Summe aller Umbauten.
                      </p>
                    </div>

                    <div style={styles.card} className="print-section pdf-page-break">
                      <h2 style={styles.h2}>Dein 10-Schritte-Fahrplan</h2>
                      <p style={styles.bodyText}>
                        Starte nicht mit allen Schritten gleichzeitig. Jeder Schritt wird 3x bestätigt, bleibt danach aktiv und der nächste Schritt kommt dazu. Nach Schritt 10 soll die Summe aller Umbauten deinen durchschnittlichen Tag in Richtung Sollzustand bringen.
                      </p>

                      <div style={styles.stepPlanList}>
                        {report.zehnSchrittePlan?.map((item, index) => {
                          const readable = getReadableStep(item);
                          return (
                            <div key={index} style={styles.stepPlanItem}>
                              <div style={styles.stepPlanHeader}>
                                <span style={styles.stepNumberBadge}>Schritt {index + 1}</span>
                                <strong style={styles.stepPlanTitle}>{readable.title}</strong>
                              </div>

                              <p style={styles.stepActionText}>{readable.action}</p>

                              <div style={styles.stepMiniMeta}>
                                <span>Häufigkeit: {readable.frequency}</span>
                                <span>Fokus: {readable.focus}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div style={styles.twoColumn} className="two-column-grid">
                      <div style={styles.card} className="print-section">
                        <h2 style={styles.h2}>Dein größtes Potenzial</h2>
                        <p style={styles.bodyText}>
                          Diese Punkte zeigen, wo in deinen 7 Tagen aktuell der größte Hebel liegt.
                          Sie sind nicht verboten – aber hier kannst du mit kleinen Anpassungen am meisten bewegen.
                        </p>
                        {(report.topKalorienQuellen || []).slice(0, 5).map((item, index) => (
                          <div key={index} style={styles.driverRow}>
                            <strong>{index + 1}. {item.lebensmittel}</strong>
                            {item.rolle && <span style={styles.rolePill}>{item.rolle}</span>}
                            <span>{item.kcal} kcal · {item.anteil}</span>
                            <p style={styles.smallText}>{item.grund}</p>
                          </div>
                        ))}
                      </div>

                      <div style={styles.card} className="print-section">
                        <h2 style={styles.h2}>Deine stabile Grundlage</h2>
                        <p style={styles.bodyText}>
                          Diese Lebensmittel und Gewohnheiten kannst du als Fundament nutzen.
                          Sie geben deiner Ernährung Struktur, Protein, Flüssigkeit oder Sättigung – je nach Menge und Kontext.
                        </p>

                        {stableBuildingBlocks.length > 0 ? (
                          stableBuildingBlocks.map((item, index) => (
                            <div key={index} style={styles.driverRow}>
                              <strong>{item.lebensmittel}</strong>
                              <p style={styles.smallText}>{item.einordnung}</p>
                            </div>
                          ))
                        ) : (
                          <p style={styles.bodyText}>
                            In deinen 7 Tagen sind noch wenige stabile Grundlagen sichtbar.
                            Der erste Fokus liegt daher nicht auf Feintuning, sondern auf einfachen Grundlagen:
                            Flüssigkalorien reduzieren, Proteinquellen aufbauen und Mahlzeiten strukturieren.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="no-print" style={styles.detailsToggleWrap}>
                      <button style={styles.secondaryButton} onClick={() => setShowDetails(prev => !prev)}>
                        {showDetails ? "Detailanalyse ausblenden" : "Detailanalyse anzeigen"}
                      </button>
                    </div>

                    {showDetails && (
                      <>
                        <div style={styles.card} className="print-section">
                          <h2 style={styles.h2}>Lebensmittelanalyse</h2>
                          <div style={styles.tableWrap}>
                            {report.lebensmittelAnalyse?.map((item, index) => (
                              <div key={index} style={styles.foodRow}>
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
                          <h2 style={styles.h2}>Hauptkalorienquellen komplett</h2>
                          {report.topKalorienQuellen?.map((item, index) => (
                            <div key={index} style={styles.foodRow}>
                              <strong style={{ color: GOLD }}>{item.lebensmittel}</strong>
                              <span>{item.kcal} kcal · {item.anteil}</span>
                              <p style={styles.smallText}>{item.grund}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <div style={styles.card} className="print-section">
                      <h2 style={styles.h2}>Zusammenfassung</h2>
                      <p style={styles.bodyText}>{report.zusammenfassung}</p>
                    </div>

                    <div style={styles.card} className="print-section">
                      <h2 style={styles.h2}>Hinweis</h2>
                      <p style={styles.bodyText}>
                        {report.medizinischerHinweis ||
                          "Diese Analyse ersetzt keine ärztliche, ernährungsmedizinische oder therapeutische Untersuchung. Sie dient als strukturierte Orientierung auf Grundlage deiner Angaben."}
                      </p>
                    </div>

                    <div style={styles.ctaCard} className="print-section">
                      <div style={styles.ctaContent}>
                        <span style={styles.kicker}>NORDSCHMIEDE KÖRPERKOMPASS</span>

                        <h2 style={styles.ctaTitle}>Ernährung ist ein Teil deiner körperlichen Selbstführung.</h2>

                        <p style={styles.ctaText}>
                          Du hast jetzt gesehen, wo deine Ernährung aktuell steht und welcher nächste Schritt sinnvoll ist.
                          Wenn du deinen Körper darüber hinaus besser einordnen möchtest — bei Schmerz, Belastung, Stress,
                          Training oder körperlicher Unsicherheit — findest du im Nordschmiede Körperkompass weitere kostenlose Orientierungshilfen.
                        </p>

                        <div style={styles.ctaButtonRow} className="no-print">
                          <a
                            href={KORPERKOMPASS_URL}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.ctaButton}
                          >
                            Weiter zum Körperkompass
                          </a>
                        </div>

                        <p style={styles.ctaSubtext}>
                          Für Menschen, die ihren Körper ruhiger verstehen und den nächsten sinnvollen Schritt finden möchten.
                        </p>
                      </div>
                    </div>

                    <div style={styles.navigationRow} className="no-print">
                      <button style={styles.ghostButton} onClick={() => setWizardStep(2)}>
                        Ernährung bearbeiten
                      </button>

                      <button style={styles.primaryButton} onClick={printAnalysis}>
                        Analyse als PDF speichern
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}

        <LegalFooter />
      </div>
    </main>
  );
}

function WizardProgress({ current, setCurrent, report }) {
  return (
    <div style={styles.wizardProgress}>
      {wizardSteps.map((step, index) => {
        const isActive = current === index;
        const isResultLocked = index === 3 && !report;

        return (
          <button
            key={step}
            style={{
              ...styles.wizardStep,
              borderColor: isActive ? GOLD : "rgba(255,255,255,0.1)",
              color: isActive ? GOLD : MUTED,
              opacity: isResultLocked ? 0.45 : 1,
              cursor: isResultLocked ? "not-allowed" : "pointer"
            }}
            disabled={isResultLocked}
            onClick={() => setCurrent(index)}
          >
            <span style={styles.stepNumber}>{index + 1}</span>
            {step}
          </button>
        );
      })}
    </div>
  );
}

function ResultTabs({ current, setCurrent }) {
  return (
    <div style={styles.resultTabs} className="result-tabs no-print">
      {resultTabs.map(tab => {
        const isActive = current === tab.id;

        return (
          <button
            key={tab.id}
            style={{
              ...styles.resultTab,
              background: isActive ? "rgba(200,169,106,0.16)" : "rgba(7,23,15,0.55)",
              borderColor: isActive ? GOLD : "rgba(255,255,255,0.1)",
              color: isActive ? GOLD : MUTED
            }}
            onClick={() => setCurrent(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <label style={styles.label}>
      <span>{label}</span>
      <input style={styles.input} value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function Textarea({ label, helper, value, onChange }) {
  return (
    <label style={styles.label}>
      <span>{label}</span>
      {helper && <small style={styles.helperText}>{helper}</small>}
      <textarea style={styles.textarea} value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function ConsentBox({
  aiNoticeAccepted,
  setAiNoticeAccepted,
  privacyNoticeAccepted,
  setPrivacyNoticeAccepted
}) {
  return (
    <div style={styles.consentCard} className="no-print">
      <div style={styles.consentHeaderRow}>
        <div>
          <span style={styles.kicker}>Hinweis vor der Analyse</span>
          <h3 style={styles.consentTitle}>KI-gestützte Orientierung und Datenschutz</h3>
        </div>
      </div>

      <p style={styles.consentIntro}>
        Die Zielwerte für Kalorien und Makronährstoffe werden nach einer hinterlegten Formel berechnet.
        Die Auswertung deiner Ernährungsmuster und die Formulierung der Handlungsschritte erfolgen KI-gestützt.
        Die Analyse dient der strukturierten Orientierung und ersetzt keine ärztliche, ernährungsmedizinische
        oder therapeutische Beratung.
      </p>

      <div style={styles.consentGrid}>
        <div style={styles.consentPoint}>
          <strong>Was verarbeitet wird</strong>
          <p>
            Körperdaten, Ziel, Aktivitätsniveau, Ernährungsform und deine 7-Tage-Ernährungsangaben
            werden zur Erstellung des Reports verarbeitet.
          </p>
        </div>

        <div style={styles.consentPoint}>
          <strong>Was nicht eingegeben werden sollte</strong>
          <p>
            Bitte gib keine Diagnosen, Laborwerte, Medikamente oder besonders sensiblen Gesundheitsinformationen ein,
            die für diese Analyse nicht notwendig sind.
          </p>
        </div>
      </div>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={aiNoticeAccepted}
          onChange={event => setAiNoticeAccepted(event.target.checked)}
          style={styles.checkboxBox}
        />
        <span style={styles.checkboxText}>
          Ich habe verstanden, dass diese Analyse KI-gestützt erstellt wird und nur eine strukturierte Orientierung ist.
          Sie ersetzt keine ärztliche, ernährungsmedizinische oder therapeutische Beratung.
        </span>
      </label>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={privacyNoticeAccepted}
          onChange={event => setPrivacyNoticeAccepted(event.target.checked)}
          style={styles.checkboxBox}
        />
        <span style={styles.checkboxText}>
          Ich bin einverstanden, dass meine Angaben zur Erstellung der Analyse verarbeitet und an die eingesetzten
          technischen Dienstleister übermittelt werden. Die <a href={PRIVACY_URL} target="_blank" rel="noreferrer" style={styles.legalLink}>Datenschutzhinweise</a> habe ich gelesen.
        </span>
      </label>
    </div>
  );
}

function LegalFooter() {
  return (
    <footer style={styles.legalFooter} className="no-print">
      <div style={styles.footerDivider} />
      <p>
        Nordschmiede Ernährungsanalyse · KI-gestützte Orientierung · keine Diagnose · keine medizinische Beratung.
      </p>
      <div style={styles.legalFooterLinks}>
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" style={styles.legalLink}>Datenschutz</a>
        <span>·</span>
        <a href={IMPRINT_URL} target="_blank" rel="noreferrer" style={styles.legalLink}>Impressum</a>
        <span>·</span>
        <a href="mailto:kontakt@nordschmiede.com" style={styles.legalLink}>Kontakt</a>
      </div>
    </footer>
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


function pdfCorrectionTarget(value, unit, label) {
  const number = Number(value) || 0;
  if (number === 0) return { label, value: "im Zielbereich" };
  if (number > 0) return { label, value: "ca. -" + Math.abs(number) + " " + unit };
  return { label, value: "ca. +" + Math.abs(number) + " " + unit };
}

function pdfSignedDisplay(value, unit) {
  const number = Number(value) || 0;
  if (number === 0) return "±0 " + unit;
  return (number > 0 ? "+" : "-") + Math.abs(number) + " " + unit;
}

function PdfReport({
  report,
  todayLabel,
  stableBuildingBlocks,
  cleanStepText,
  createResultSentence,
  formatDifference
}) {
  if (!report) return null;

  const steps = Array.isArray(report.zehnSchrittePlan) ? report.zehnSchrittePlan : [];
  const firstStep = steps[0] || "";
  const stepsOne = steps.slice(0, 5);
  const stepsTwo = steps.slice(5, 10);
  const topSources = Array.isArray(report.topKalorienQuellen) ? report.topKalorienQuellen.slice(0, 5) : [];
  const patterns = Array.isArray(report.problemMuster) ? report.problemMuster.slice(0, 4) : [];
  const fahrplanTarget = [
    pdfCorrectionTarget(report.differenz?.kcal, "kcal", "Kalorien"),
    pdfCorrectionTarget(report.differenz?.protein, "g", "Protein"),
    pdfCorrectionTarget(report.differenz?.fett, "g", "Fett"),
    pdfCorrectionTarget(report.differenz?.kohlenhydrate, "g", "Kohlenhydrate")
  ];
  const fahrplanBilanz = report.fahrplanBilanz || "Die 10 Schritte sind als Umbau deiner bisherigen Ernährung gedacht: Sie sollen die gemessene Differenz zwischen Ist- und Soll-Zustand schrittweise schließen.";
  const weeklyGoal = report.fahrplanWochenziel?.wochenziel || null;

  return (
    <div className="pdf-report">
      <section className="pdf-page pdf-cover-page">
        <div className="pdf-cover-mark">
          <img src={LOGO_URL} alt="" className="pdf-logo-cover" />
          <div className="pdf-cover-brand">NORDSCHMIEDE</div>
        </div>

        <div className="pdf-cover-main">
          <div className="pdf-cover-kicker">Analysebericht</div>
          <h1>Ernährungsanalyse</h1>
          <p>
            Dein persönlicher Report auf Grundlage von 7 Tagen Ernährung — mit klarem Ist-Zustand,
            priorisierten Ernährungsmustern und dem ersten sinnvollen Umsetzungsschritt.
          </p>
        </div>

        <div className="pdf-cover-meta-grid">
          <div>
            <span>Erstellt am</span>
            <strong>{todayLabel || "heute"}</strong>
          </div>
          <div>
            <span>Format</span>
            <strong>Nordschmiede Analysebericht</strong>
          </div>
          <div>
            <span>Schwerpunkt</span>
            <strong>Ernährung · Struktur · Selbstführung</strong>
          </div>
        </div>
      </section>

      <section className="pdf-page pdf-page-light">
        <PdfHeader eyebrow="01" title="Executive Summary" />

        <div className="pdf-summary-hero">
          <span>Ergebnis in einem Satz</span>
          <h2>{createResultSentence(report)}</h2>
        </div>

        <div className="pdf-score-grid">
          <PdfScore label="Kalorien" value={formatDifference(report.differenz?.kcal, "kcal")} />
          <PdfScore label="Protein" value={formatDifference(report.differenz?.protein, "g")} />
          <PdfScore label="Fett" value={formatDifference(report.differenz?.fett, "g")} />
        </div>

        <div className="pdf-two-column pdf-gap-large">
          <div className="pdf-card pdf-card-dark">
            <span>Kernproblem</span>
            <p>{report.zentralesProblem}</p>
          </div>

          <div className="pdf-card">
            <span>Schätzqualität</span>
            <p>{report.schaetzHinweis || report.istZustand?.schaetzqualitaet || "Die Werte sind Näherungen auf Basis deiner Angaben."}</p>
          </div>
        </div>

        <div className="pdf-table-card">
          <div className="pdf-table-head">
            <span>Einordnung</span>
            <span>Kalorien</span>
            <span>Protein</span>
            <span>Fett</span>
            <span>Kohlenhydrate</span>
          </div>
          <div className="pdf-table-row">
            <strong>Ist-Zustand</strong>
            <span>{report.istZustand?.kcal} kcal</span>
            <span>{report.istZustand?.protein} g</span>
            <span>{report.istZustand?.fett} g</span>
            <span>{report.istZustand?.kohlenhydrate} g</span>
          </div>
          <div className="pdf-table-row">
            <strong>Soll-Zustand</strong>
            <span>{report.sollZustand?.kcal} kcal</span>
            <span>{report.sollZustand?.protein} g</span>
            <span>{report.sollZustand?.fett} g</span>
            <span>{report.sollZustand?.kohlenhydrate} g</span>
          </div>
          <div className="pdf-table-row pdf-table-row-accent">
            <strong>Differenz</strong>
            <span>{formatDifference(report.differenz?.kcal, "kcal")}</span>
            <span>{formatDifference(report.differenz?.protein, "g")}</span>
            <span>{formatDifference(report.differenz?.fett, "g")}</span>
            <span>{formatDifference(report.differenz?.kohlenhydrate, "g")}</span>
          </div>
        </div>

        <PdfFooter page="01" />
      </section>

      <section className="pdf-page pdf-page-light">
        <PdfHeader eyebrow="02" title="Dein erster Schritt" />

        <div className="pdf-first-step">
          <div className="pdf-step-number-large">01</div>
          <div>
            <span>Starte hier</span>
            <h2>Der erste Hebel zählt mehr als zehn gute Vorsätze.</h2>
            <p>{cleanStepText(firstStep)}</p>
          </div>
        </div>

        <div className="pdf-note-row">
          <div>
            <strong>Nicht alles gleichzeitig.</strong>
            <p>Der Fahrplan zeigt die Reihenfolge. Die Umsetzung erfolgt bewusst Schritt für Schritt.</p>
          </div>
          <div>
            <strong>Erst Stabilität, dann Feinschliff.</strong>
            <p>Starte mit dem Muster, das bei wenig Komplexität den größten Effekt erzeugt.</p>
          </div>
        </div>

        <div className="pdf-card pdf-card-wide pdf-target-card">
          <span>Ziel dieses Fahrplans</span>
          <p>{fahrplanBilanz}</p>
          <div className="pdf-score-grid pdf-score-grid-small">
            {fahrplanTarget.map((item, index) => (
              <PdfScore key={index} label={item.label} value={item.value} />
            ))}
          </div>

          {weeklyGoal && (
            <p className="pdf-small-note">
              Wochenziel: {pdfSignedDisplay(weeklyGoal.kcal, "kcal")}, {pdfSignedDisplay(weeklyGoal.protein, "g Protein")}, {pdfSignedDisplay(weeklyGoal.fett, "g Fett")}, {pdfSignedDisplay(weeklyGoal.kohlenhydrate, "g Kohlenhydrate")}.
            </p>
          )}
        </div>

        <div className="pdf-card pdf-card-wide">
          <span>Nächste konkrete Änderung</span>
          <p>{report.naechsteKonkreteAenderung}</p>
        </div>

        <div className="pdf-card pdf-card-wide">
          <span>Größte Hebel</span>
          <ul className="pdf-hebel-list">
            {report.groessteHebel?.slice(0, 5).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <PdfFooter page="02" />
      </section>

      <section className="pdf-page pdf-page-light">
        <PdfHeader eyebrow="03" title="Differenz schließen · Schritte 1–5" />
        <RoadmapList steps={stepsOne} offset={0} cleanStepText={cleanStepText} />
        <PdfFooter page="03" />
      </section>

      <section className="pdf-page pdf-page-light">
        <PdfHeader eyebrow="04" title="Differenz schließen · Schritte 6–10" />
        <RoadmapList steps={stepsTwo} offset={5} cleanStepText={cleanStepText} />
        <PdfFooter page="04" />
      </section>

      <section className="pdf-page pdf-page-light">
        <PdfHeader eyebrow="05" title="Potenzial & stabile Grundlage" />

        <div className="pdf-two-column">
          <div className="pdf-card pdf-card-tall">
            <span>Dein größtes Potenzial</span>
            <p className="pdf-card-intro">Hier liegt in deinen 7 Tagen aktuell der größte Hebel. Nicht verboten – aber relevant.</p>
            {topSources.map((item, index) => (
              <div className="pdf-source-item" key={index}>
                <strong>{index + 1}. {item.lebensmittel}</strong>
                {item.rolle ? <p><em>{item.rolle}</em></p> : null}
                <p>{item.kcal} kcal · {item.anteil}</p>
                <p>{item.grund}</p>
              </div>
            ))}
          </div>

          <div className="pdf-card pdf-card-tall">
            <span>Deine stabile Grundlage</span>
            <p className="pdf-card-intro">Darauf kannst du aufbauen: Struktur, Protein, Flüssigkeit oder Sättigung.</p>
            {stableBuildingBlocks.length > 0 ? (
              stableBuildingBlocks.map((item, index) => (
                <div className="pdf-source-item pdf-source-positive" key={index}>
                  <strong>{item.lebensmittel}</strong>
                  <p>{item.einordnung}</p>
                </div>
              ))
            ) : (
              <p>
                In deinen 7 Tagen sind noch wenige stabile Grundlagen sichtbar.
                Der erste Fokus liegt daher auf einfachen Grundlagen: Flüssigkalorien reduzieren,
                Proteinquellen aufbauen und Mahlzeiten strukturieren.
              </p>
            )}
          </div>
        </div>

        {patterns.length > 0 && (
          <div className="pdf-pattern-strip">
            {patterns.map((item, index) => (
              <div key={index}>
                <strong>{item.muster}</strong>
                <p>{item.hebel}</p>
              </div>
            ))}
          </div>
        )}

        <PdfFooter page="05" />
      </section>

      <section className="pdf-page pdf-page-final">
        <PdfHeader eyebrow="06" title="Abschluss & nächste Orientierung" />

        <div className="pdf-card pdf-card-wide">
          <span>Zusammenfassung</span>
          <p>{report.zusammenfassung}</p>
        </div>

        <div className="pdf-card pdf-card-wide">
          <span>Medizinischer Hinweis</span>
          <p>
            {report.medizinischerHinweis ||
              "Diese Analyse ersetzt keine ärztliche, ernährungsmedizinische oder therapeutische Untersuchung. Sie dient als strukturierte Orientierung auf Grundlage deiner Angaben."}
          </p>
        </div>

        <div className="pdf-final-cta">
          <img src={LOGO_URL} alt="" />
          <div>
            <span>Nordschmiede Körperkompass</span>
            <h2>Ernährung ist ein Teil deiner körperlichen Selbstführung.</h2>
            <p>
              Wenn du deinen Körper darüber hinaus besser einordnen möchtest — bei Schmerz,
              Belastung, Stress, Training oder körperlicher Unsicherheit — findest du im
              Nordschmiede Körperkompass weitere Orientierungshilfen.
            </p>
            <strong>www.nordschmiede.com/korperkompass</strong>
          </div>
        </div>

        <PdfFooter page="06" inverted />
      </section>
    </div>
  );
}

function PdfHeader({ eyebrow, title }) {
  return (
    <div className="pdf-header">
      <div className="pdf-header-left">
        <img src={LOGO_URL} alt="" />
        <div>
          <span>NORDSCHMIEDE</span>
          <strong>{title}</strong>
        </div>
      </div>
      <div className="pdf-header-number">{eyebrow}</div>
    </div>
  );
}

function PdfScore({ label, value }) {
  return (
    <div className="pdf-score-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function pdfCleanStepText(text) {
  if (!text) return "";
  return String(text).replace(/^Schritt\s*\d+\s*[:.)-]\s*/i, "").trim();
}

function pdfExtractLabeledPart(text, label) {
  if (!text) return "";
  const pattern = new RegExp(label + "\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:Titel|Schrittziel|Ab jetzt|Umbau|Häufigkeit|Haeufigkeit|Fokus|Wirkung pro Ereignis|Wirkung|Wochenwirkung|Tagesdurchschnitt|Schließt|Schliesst|Art|Warum|Rest|Zielbezug|Bilanz|Interne Bilanz)\\s*:|$)", "i");
  const match = String(text).match(pattern);
  return match ? match[1].trim() : "";
}

function pdfStripLabels(text) {
  return String(text || "")
    .replace(/\b(Titel|Schrittziel|Ab jetzt|Umbau|Häufigkeit|Haeufigkeit|Fokus|Wirkung pro Ereignis|Wirkung|Wochenwirkung|Tagesdurchschnitt|Schließt|Schliesst|Art|Warum|Rest|Zielbezug|Bilanz|Interne Bilanz)\s*:/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfDeriveStepTitle(action, cleaned) {
  const text = [action, cleaned].filter(Boolean).join(" ").toLowerCase();
  if (/cola|limonade|saft|eistee/.test(text)) return "Cola ersetzen";
  if (/schokoriegel|schokolade/.test(text)) return "Süßes ersetzen";
  if (/chips/.test(text)) return "Chips portionieren";
  if (/nuss|nüsse|nuesse/.test(text)) return "Nüsse portionieren";
  if (/döner|doener/.test(text)) return "Döner umbauen";
  if (/pizza/.test(text)) return "Pizza leichter ersetzen";
  if (/sahne|sahnesauce/.test(text)) return "Sahnesauce ersetzen";
  if (/butter/.test(text)) return "Butter leichter ersetzen";
  if (/käse|kaese/.test(text)) return "Käse bewusst dosieren";
  if (/nutella|marmelade/.test(text)) return "Süßen Belag ersetzen";
  if (/protein|magerquark|quark|skyr|hüttenkäse|haehnchen|hähnchen|pute|thunfisch/.test(text)) return "Proteinbasis stärken";
  const firstSentence = String(action || cleaned || "").split(/[.!?]/)[0].trim();
  return firstSentence.length > 52 ? firstSentence.slice(0, 49).trim() + "…" : (firstSentence || "Nächsten Hebel umsetzen");
}


function pdfCleanDisplayPart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

function pdfReadableStep(item) {
  const cleaned = pdfCleanStepText(item);
  const title = pdfExtractLabeledPart(cleaned, "Titel") || pdfExtractLabeledPart(cleaned, "Schrittziel");
  const action = pdfExtractLabeledPart(cleaned, "Ab jetzt") || pdfExtractLabeledPart(cleaned, "Umbau") || pdfStripLabels(cleaned.split(/\bHäufigkeit\s*:/i)[0]);
  const frequency = pdfExtractLabeledPart(cleaned, "Häufigkeit") || pdfExtractLabeledPart(cleaned, "Haeufigkeit") || "bei Auftreten";
  const focus = pdfExtractLabeledPart(cleaned, "Fokus") || pdfExtractLabeledPart(cleaned, "Schließt") || pdfExtractLabeledPart(cleaned, "Schliesst") || "Zielbereich";
  return {
    title: pdfCleanDisplayPart(title || pdfDeriveStepTitle(action, cleaned)),
    action: pdfCleanDisplayPart(action),
    frequency: pdfCleanDisplayPart(frequency),
    focus: pdfCleanDisplayPart(focus)
  };
}

function RoadmapList({ steps, offset, cleanStepText }) {
  return (
    <div className="pdf-roadmap-list">
      {steps.map((item, index) => {
        const readable = pdfReadableStep(item);
        return (
          <div className="pdf-roadmap-row" key={index}>
            <div className="pdf-roadmap-index">{offset + index + 1}</div>
            <div>
              <strong className="pdf-roadmap-title">{readable.title}</strong>
              <p className="pdf-roadmap-action">{readable.action}</p>
              <div className="pdf-roadmap-meta">
                <span>Häufigkeit: {readable.frequency}</span>
                <span>Fokus: {readable.focus}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PdfFooter({ page, inverted }) {
  return (
    <div className={inverted ? "pdf-footer pdf-footer-inverted" : "pdf-footer"}>
      <span>Nordschmiede Ernährungsanalyse</span>
      <span>{page}</span>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top left, #173522 0, #07170f 34%, #040b07 100%)",
    color: TEXT,
    padding: "48px 20px",
    fontFamily: "Arial, Helvetica, sans-serif"
  },
  shell: {
    maxWidth: 1180,
    margin: "0 auto"
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.9fr",
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
  h2: {
    color: GOLD,
    margin: "0 0 18px 0",
    fontSize: 24
  },
  h3: {
    color: TEXT,
    margin: "0 0 14px 0",
    fontSize: 18
  },
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
  heroBoxText: {
    color: MUTED,
    lineHeight: 1.55,
    margin: 0
  },
  topBar: {
    display: "grid",
    gap: 18,
    marginBottom: 24
  },
  wizardProgress: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12
  },
  wizardStep: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "13px 14px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(7,23,15,0.55)",
    fontWeight: 700
  },
  stepNumber: {
    width: 25,
    height: 25,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(200,169,106,0.14)",
    color: GOLD,
    fontSize: 12
  },
  resultTabs: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginBottom: 24
  },
  resultTab: {
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.1)",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer"
  },
  actionRow: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    alignItems: "center"
  },
  modeBadge: {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid rgba(200,169,106,0.25)",
    color: MUTED,
    fontSize: 13,
    background: "rgba(7,23,15,0.45)"
  },
  primaryButton: {
    padding: "15px 22px",
    borderRadius: 14,
    border: "none",
    background: GOLD,
    color: DARK,
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer"
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
    marginBottom: 22,
    fontSize: 14,
    lineHeight: 1.55
  },
  infoNotice: {
    background: "rgba(200,169,106,0.08)",
    border: "1px solid rgba(200,169,106,0.22)",
    color: MUTED,
    padding: 16,
    borderRadius: 16,
    marginBottom: 22,
    fontSize: 14,
    lineHeight: 1.55
  },
  card: {
    background: "rgba(16, 43, 29, 0.82)",
    border: "1px solid rgba(200,169,106,0.22)",
    borderRadius: 24,
    padding: 28,
    marginBottom: 24,
    boxShadow: "0 22px 60px rgba(0,0,0,0.24)"
  },
  diagnosisCard: {
    background: "rgba(200,169,106,0.10)",
    border: "1px solid rgba(200,169,106,0.35)",
    borderRadius: 24,
    padding: 28,
    marginBottom: 24,
    boxShadow: "0 22px 60px rgba(0,0,0,0.24)"
  },
  kicker: {
    color: GOLD,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: 12
  },
  bodyText: {
    color: MUTED,
    lineHeight: 1.7,
    fontSize: 17
  },
  focusTextSmall: {
    color: TEXT,
    lineHeight: 1.65,
    fontSize: 21,
    maxWidth: 960
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16
  },
  goalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 14,
    marginTop: 24
  },
  goalButton: {
    padding: "16px",
    borderRadius: 16,
    border: "1px solid rgba(200,169,106,0.22)",
    color: TEXT,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left"
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    color: MUTED,
    fontSize: 13
  },
  helperText: {
    color: "#9f9686",
    lineHeight: 1.45
  },
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
    minHeight: 96,
    borderRadius: 13,
    border: "1px solid rgba(200,169,106,0.3)",
    background: GREEN,
    color: TEXT,
    padding: "13px 14px",
    fontSize: 14,
    outline: "none",
    resize: "vertical"
  },
  navigationRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 24
  },
  foodHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap"
  },
  dayCounter: {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid rgba(200,169,106,0.35)",
    color: GOLD,
    fontWeight: 700
  },
  miniProgress: {
    marginTop: 20,
    marginBottom: 20
  },
  dayTabs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24
  },
  dayTab: {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(7,23,15,0.55)",
    fontWeight: 700,
    cursor: "pointer"
  },
  dayEditor: {
    background: "rgba(7,23,15,0.58)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 20,
    padding: 22,
    display: "grid",
    gap: 16
  },
  analyzeBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
    marginTop: 24,
    padding: 18,
    borderRadius: 18,
    border: "1px solid rgba(200,169,106,0.2)",
    background: "rgba(200,169,106,0.08)"
  },
  topAnalyzeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
    marginTop: 14,
    marginBottom: 22,
    padding: 18,
    borderRadius: 18,
    border: "1px solid rgba(200,169,106,0.32)",
    background: "linear-gradient(135deg, rgba(200,169,106,0.13), rgba(7,23,15,0.46))"
  },
  topAnalyzeTitle: {
    display: "block",
    color: GOLD,
    fontSize: 15,
    marginBottom: 4
  },
  topAnalyzeText: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 1.5,
    margin: 0
  },
  errorBox: {
    background: "rgba(120, 32, 32, 0.55)",
    border: "1px solid rgba(255,120,120,0.35)",
    padding: 18,
    borderRadius: 18,
    marginBottom: 22
  },
  results: {
    marginTop: 24
  },
  resultIntro: {
    marginBottom: 24,
    background: "rgba(16, 43, 29, 0.82)",
    border: "1px solid rgba(200,169,106,0.22)",
    borderRadius: 24,
    padding: 28
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 18
  },
  metricLine: {
    fontSize: 17,
    color: TEXT,
    margin: "9px 0"
  },
  twoColumn: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 18
  },
  list: {
    color: MUTED,
    lineHeight: 1.7,
    paddingLeft: 22,
    fontSize: 16
  },
  focusCard: {
    background: "linear-gradient(135deg, rgba(200,169,106,0.18), rgba(16,43,29,0.88))",
    border: "1px solid rgba(200,169,106,0.38)",
    borderRadius: 26,
    padding: 30,
    marginBottom: 24,
    boxShadow: "0 24px 70px rgba(0,0,0,0.3)"
  },
  focusText: {
    color: TEXT,
    lineHeight: 1.55,
    fontSize: 21,
    maxWidth: 960,
    margin: "10px 0 0 0"
  },
  currentStepTitle: {
    display: "block",
    color: TEXT,
    fontSize: 34,
    lineHeight: 1.12,
    marginBottom: 10
  },
  structuredStepGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
    marginTop: 20
  },
  stepMainBox: {
    gridColumn: "1 / -1",
    background: "rgba(7,23,15,0.60)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 18,
    padding: 18
  },
  stepBoxTitle: {
    display: "block",
    color: GOLD,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontSize: 12
  },
  stepMetaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12
  },
  stepWhyText: {
    color: MUTED,
    lineHeight: 1.6,
    fontSize: 14,
    margin: "0"
  },
  smallInfoBox: {
    background: "rgba(7,23,15,0.55)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16
  },
  progressBox: {
    marginTop: 20,
    marginBottom: 20
  },
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
  checkHint: {
    color: MUTED,
    lineHeight: 1.55,
    fontSize: 14,
    background: "rgba(7,23,15,0.38)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: 14,
    borderRadius: 14,
    marginTop: 14
  },
  checkRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 20
  },
  checkButton: {
    padding: "12px 16px",
    borderRadius: 13,
    border: "1px solid rgba(200,169,106,0.5)",
    background: DARK,
    color: TEXT,
    cursor: "pointer",
    fontWeight: 700
  },
  correctionCard: {
    background: "linear-gradient(135deg, rgba(200,169,106,0.14), rgba(7,23,15,0.68))",
    border: "1px solid rgba(200,169,106,0.34)",
    borderRadius: 24,
    padding: 26,
    marginBottom: 24,
    boxShadow: "0 22px 60px rgba(0,0,0,0.22)"
  },
  correctionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginTop: 18
  },
  correctionItem: {
    background: "rgba(7,23,15,0.58)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 15,
    display: "grid",
    gap: 6
  },
  correctionItemMuted: {
    background: "rgba(244,239,228,0.06)",
    border: "1px solid rgba(200,169,106,0.16)",
    borderRadius: 16,
    padding: 15,
    display: "grid",
    gap: 6
  },
  softCtaCard: {
    background: "rgba(200,169,106,0.10)",
    border: "1px solid rgba(200,169,106,0.30)",
    borderRadius: 22,
    padding: 24,
    marginBottom: 24
  },
  driverRow: {
    background: "rgba(7,23,15,0.50)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    padding: 14,
    display: "grid",
    gap: 5,
    marginBottom: 10
  },
  patternGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12
  },
  detailsToggleWrap: {
    marginBottom: 22
  },
  tableWrap: {
    display: "grid",
    gap: 12
  },
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
  rolePill: {
    display: "inline-flex",
    width: "fit-content",
    alignItems: "center",
    margin: "8px 0 2px",
    padding: "4px 9px",
    borderRadius: 999,
    border: "1px solid rgba(200, 169, 106, 0.45)",
    background: "rgba(200, 169, 106, 0.10)",
    color: GOLD,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.5
  },
  consentCard: {
    background: "rgba(200,169,106,0.10)",
    border: "1px solid rgba(200,169,106,0.32)",
    borderRadius: 22,
    padding: 22,
    marginTop: 20,
    marginBottom: 20,
    boxShadow: "0 18px 50px rgba(0,0,0,0.18)"
  },
  consentHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 10
  },
  consentTitle: {
    color: TEXT,
    fontSize: 20,
    margin: "8px 0 0 0"
  },
  consentIntro: {
    color: MUTED,
    lineHeight: 1.65,
    fontSize: 15,
    margin: "8px 0 16px 0"
  },
  consentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
    marginBottom: 16
  },
  consentPoint: {
    background: "rgba(7,23,15,0.48)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 14,
    color: MUTED,
    lineHeight: 1.5,
    fontSize: 13
  },
  checkboxRow: {
    display: "grid",
    gridTemplateColumns: "24px 1fr",
    gap: 12,
    alignItems: "start",
    background: "rgba(7,23,15,0.52)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    cursor: "pointer"
  },
  checkboxBox: {
    width: 18,
    height: 18,
    marginTop: 2,
    accentColor: GOLD,
    cursor: "pointer"
  },
  checkboxText: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 1.55
  },
  legalLink: {
    color: GOLD,
    textDecoration: "none",
    fontWeight: 700
  },
  legalFooter: {
    color: "#9f9686",
    fontSize: 13,
    lineHeight: 1.6,
    marginTop: 34,
    paddingBottom: 8,
    textAlign: "center"
  },
  legalFooterLinks: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 6
  },
  footerDivider: {
    height: 1,
    background: "rgba(200,169,106,0.22)",
    marginBottom: 16
  },
  reportHeader: {
    background: "rgba(16, 43, 29, 0.82)",
    border: "1px solid rgba(200,169,106,0.22)",
    borderRadius: 24,
    padding: 28,
    marginBottom: 24
  },
  stepPlanList: {
    display: "grid",
    gap: 12,
    marginTop: 20
  },
  stepPlanItem: {
    background: "rgba(7,23,15,0.50)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
    padding: 16
  },
  stepPlanHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 10
  },
  stepNumberBadge: {
    color: GOLD,
    border: "1px solid rgba(200,169,106,0.42)",
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.03em"
  },
  stepPlanTitle: {
    color: TEXT,
    fontSize: 23,
    lineHeight: 1.2
  },
  stepActionText: {
    color: TEXT,
    fontSize: 16,
    lineHeight: 1.55,
    margin: "0 0 10px 0"
  },
  stepMiniMeta: {
    display: "grid",
    gap: 6,
    color: MUTED,
    fontSize: 13,
    lineHeight: 1.45
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
