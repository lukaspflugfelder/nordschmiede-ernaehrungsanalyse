export const metadata = {
  title: "Nordschmiede Ernährungsanalyse",
  description:
    "Kostenlose Nordschmiede Ernährungsanalyse: 7 Tage Ernährung eintragen, Ist-Zustand, Soll-Zustand und ersten Umsetzungsschritt erhalten.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}