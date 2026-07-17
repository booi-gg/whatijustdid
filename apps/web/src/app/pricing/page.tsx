import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — Changetrail",
  description: "Choose the plan that fits how you build with AI.",
};

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Everything you need to understand your local changes.",
    features: [
      "Local receipt generation",
      "Git-backed history",
      "VS Code extension",
      "Local browser viewer",
      "Bring your own AI key",
    ],
    cta: "Install free",
    href: "https://github.com/booi-gg/changelog",
    featured: false,
  },
  {
    name: "Pro",
    price: "$8",
    period: "per month",
    desc: "Shareable history and managed AI for solo builders.",
    features: [
      "Everything in Free",
      "Hosted history & shareable links",
      "Managed AI (no API key needed)",
      "Multiple projects",
      "Full-text search",
      "Agent integrations & screenshots",
    ],
    cta: "Get Pro",
    href: "/signup?plan=pro",
    featured: true,
  },
  {
    name: "Team",
    price: "$20",
    period: "per user / month",
    desc: "Central billing, shared timeline, and team policies.",
    features: [
      "Everything in Pro",
      "Shared organization timeline",
      "GitHub App & policy checks",
      "Central AI budget",
      "Permissions & audit history",
      "Cross-project summaries",
      "Private sharing",
    ],
    cta: "Contact sales",
    href: "mailto:hello@changetrail.dev?subject=Team%20plan",
    featured: false,
  },
];

export default function Pricing() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-gray-200">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Changetrail
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link
              href="/pricing"
              className="text-brand-600 hover:text-brand-700 transition-colors"
            >
              Pricing
            </Link>
            <a
              href="https://github.com/booi-gg/changelog"
              className="hover:text-brand-600 transition-colors"
            >
              GitHub
            </a>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-6 pt-20 pb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-xl mx-auto">
            Start free. Upgrade when you need hosted history, managed AI, or
            team features.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border p-6 flex flex-col ${
                  plan.featured
                    ? "border-brand-600 ring-2 ring-brand-600/20 shadow-md"
                    : "border-gray-200"
                }`}
              >
                {plan.featured && (
                  <span className="self-start mb-3 rounded-full bg-brand-100 px-3 py-0.5 text-xs font-semibold text-brand-700">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="mt-3">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-gray-500 text-sm"> {plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">{plan.desc}</p>
                <ul className="mt-6 space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <svg
                        className="w-4 h-4 mt-0.5 text-brand-600 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.href}
                  className={`mt-8 block text-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                    plan.featured
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500">
        <div className="max-w-6xl mx-auto px-6">
          Changetrail &mdash; Built for vibe coders.
        </div>
      </footer>
    </div>
  );
}
