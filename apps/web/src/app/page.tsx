import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-gray-200">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Fessup
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link href="/pricing" className="hover:text-brand-600 transition-colors">
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
        <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
          <h1 className="text-5xl font-bold tracking-tight leading-tight">
            Understand what your
            <br />
            <span className="text-brand-600">AI coder</span> just did
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Fessup turns every code change into a plain-English receipt.
            No jargon, no filenames, no commit messages — just a clear
            explanation of what your app can do now and how to try it.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/pricing"
              className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Get started
            </Link>
            <a
              href="https://github.com/booi-gg/changelog"
              className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Plain English",
                desc: "No filenames, no code symbols. Every receipt is written for people who build with AI but don't read code.",
              },
              {
                title: "Know what to test",
                desc: "Each receipt includes concrete verification steps — what to open, what to click, and what to expect.",
              },
              {
                title: "Honest about risk",
                desc: "Receipts flag unfinished work, untested claims, and missing setup so you always know what you have.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-gray-200 p-6 hover:border-brand-300 transition-colors"
              >
                <h3 className="font-semibold text-lg">{feature.title}</h3>
                <p className="mt-2 text-gray-600 text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-50 border-t border-gray-200">
          <div className="max-w-4xl mx-auto px-6 py-20">
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-mono text-gray-400 mb-4">
                <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">
                  feat
                </span>
                <span>2 commits</span>
              </div>
              <h3 className="text-xl font-semibold">You added password reset</h3>
              <div className="mt-4 grid sm:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    What you can do now
                  </h4>
                  <ul className="mt-2 space-y-1 text-gray-700 text-sm">
                    <li>People can request a password-reset link from the sign-in page.</li>
                    <li>Expired links show a helpful message.</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    How to try it
                  </h4>
                  <ol className="mt-2 space-y-1 text-gray-700 text-sm list-decimal list-inside">
                    <li>Open the sign-in page.</li>
                    <li>Select &ldquo;Forgot password?&rdquo;</li>
                    <li>Enter your email address.</li>
                  </ol>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                <strong>Be aware:</strong> Real emails will not send until an email
                provider is connected.
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500">
        <div className="max-w-6xl mx-auto px-6">
          Fessup &mdash; Built for vibe coders.
        </div>
      </footer>
    </div>
  );
}
