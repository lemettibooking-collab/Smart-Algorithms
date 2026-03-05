import "./globals.css";

export const metadata = {
  title: "terminal-scanner-2",
  description: "Crypto scanner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var k='sa-theme';var v=localStorage.getItem(k);var d=document.documentElement;if(v==='light'){d.classList.remove('dark')}else{d.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})();",
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)]">{children}</body>
    </html>
  );
}
