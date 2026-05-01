# Nordschmiede Ernährungsanalyse App

## Start lokal

1. Ordner entpacken.
2. Terminal im Ordner öffnen.
3. Abhängigkeiten installieren:

```bash
npm install
```

4. `.env.example` kopieren und in `.env.local` umbenennen.
5. In `.env.local` deinen OpenAI API-Key eintragen:

```bash
OPENAI_API_KEY=dein_key
```

6. App starten:

```bash
npm run dev
```

7. Im Browser öffnen:

```bash
http://localhost:3000
```

## Was enthalten ist

- Next.js-App
- lokale Ist-/Soll-Makroberechnung
- 7-Tage-Ernährungsprotokoll
- Mengenlogik für g/ml/EL/Stück
- Konfliktprüfung für Ernährungsform, Unverträglichkeiten und No-Go-Lebensmittel
- Backend-Route für OpenAI KI-Report
- geschützter Prompt in `app/api/analyze/route.js`

## Wichtig

Der OpenAI API-Key ist aus Sicherheitsgründen nicht enthalten.
