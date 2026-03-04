import "./globals.css";

export const metadata = {
  title: "terminal-scanner-2",
  description: "Crypto scanner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}