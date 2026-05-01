export const metadata = {
  title: "Nordschmiede Ernährungsanalyse",
  description: "KI-gestütztes Ernährungstool",
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
