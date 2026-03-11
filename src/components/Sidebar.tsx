"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Dashboard", icon: "📊" },
    { href: "/cities", label: "Cities", icon: "🏙️" },
    { href: "/matches", label: "Matches", icon: "🔍" },
    { href: "/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <aside className="hidden md:flex w-64 border-r" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
      <nav className="w-full p-6 flex flex-col">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "var(--primary)" }}>
            RAL Scout
          </h1>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Assisted Living Deal Finder
          </p>
        </div>

        <ul className="space-y-2 flex-1">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
                  style={{
                    backgroundColor: isActive ? "var(--surface-elevated)" : "transparent",
                    color: isActive ? "var(--primary)" : "var(--text-secondary)",
                    borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent",
                  }}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            v1.0.0
          </p>
        </div>
      </nav>
    </aside>
  );
}
