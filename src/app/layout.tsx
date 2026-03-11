import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "RAL Scout",
  description: "Assisted Living Deal Finder",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`
          body {
            margin: 0;
            padding: 0;
            font-family: Outfit, system-ui, sans-serif;
            background-color: hsl(0, 0%, 3.5%);
            color: hsl(0, 0%, 98%);
          }
        `}</style>
      </head>
      <body>
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
