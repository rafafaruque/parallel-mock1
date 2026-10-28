"use client";

import { useState, type FormEvent } from "react";

type ResearchError = {
  source: "frontend" | "server" | "parallel";
  message: string;
  status?: number;
};

type SearchSection = {
  sources: {
    title: string;
    url: string;
    excerpt: string;
    publishedAt: string | null;
  }[];
  error?: ResearchError;
};

type Research = {
  company: string;
  overview: SearchSection;
  developments: SearchSection;
};

type ApiResponse = { research?: Research; error?: ResearchError };

function ErrorMessage({ error }: { error: ResearchError }) {
  return (
    <div className="error" role="alert">
      <strong>{error.source} error{error.status ? " · HTTP " + error.status : ""}</strong>
      <p>{error.message}</p>
    </div>
  );
}

function ResultsSection({ title, section }: { title: string; section: SearchSection }) {
  return (
    <section className="results-section">
      <h3>{title}</h3>
      {section.error ? <ErrorMessage error={section.error} /> : null}
      {!section.error && section.sources.length === 0 ? (
        <p className="empty-section">No sources found for this section. Try a more specific company name.</p>
      ) : null}
      {section.sources.map((source) => (
        <article className="source-card" key={source.url}>
          <div className="source-meta">
            <span>{new URL(source.url).hostname.replace(/^www\./, "")}</span>
            <span>{source.publishedAt || "Date not provided"}</span>
          </div>
          <h4><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></h4>
          <p>{source.excerpt || "No excerpt was returned. Open the source to read more."}</p>
        </article>
      ))}
    </section>
  );
}

export default function Home() {
  const [company, setCompany] = useState("");
  const [research, setResearch] = useState<Research | null>(null);
  const [error, setError] = useState<ResearchError | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = company.trim();
    if (loading) return;
    if (name.length < 2 || name.length > 120) {
      setError({ source: "frontend", message: "Enter a company name between 2 and 120 characters." });
      return;
    }

    setError(null);
    setResearch(null);
    setLoading(true);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: name }),
        signal: AbortSignal.timeout(25_000),
      });

      let body: ApiResponse;
      try {
        body = await response.json();
      } catch {
        setError({ source: "server", message: "The server returned an unreadable response.", status: response.status });
        return;
      }

      if (!response.ok || !body?.research) {
        setError(body?.error || { source: "server", message: "The research request failed.", status: response.status });
        return;
      }
      setResearch(body.research);
    } catch (error) {
      setError({
        source: "frontend",
        message: error instanceof Error && error.name === "TimeoutError"
          ? "The browser stopped waiting after 25 seconds. Please retry."
          : "The browser could not reach the research server. Check your connection and retry.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="page-header">
        <span className="brand">briefly.</span>
        <span className="header-note">Company research, with sources</span>
      </header>

      <section className="intro">
        <p className="eyebrow">PREPARE FOR YOUR NEXT CONVERSATION</p>
        <h1>Know the company.<br /><span>Start a better conversation.</span></h1>
        <p>Find out what a company does and what’s new, with original sources a click away.</p>
      </section>

      <form onSubmit={handleSubmit} className="search-form" noValidate>
        <label htmlFor="company">Company name</label>
        <div className="search-controls">
          <input
            id="company"
            name="company"
            placeholder="e.g. Stripe, Notion, or Nvidia"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            maxLength={120}
            disabled={loading}
            autoComplete="organization"
          />
          <button type="submit" disabled={loading || !company.trim()}>
            {loading ? "Researching…" : "Research company"}
          </button>
        </div>
        <p>Powered by Parallel Search · Usually takes a few seconds</p>
      </form>

      {error ? <ErrorMessage error={error} /> : null}

      {loading ? (
        <div className="status-panel" role="status">
          <h2>Researching {company.trim()}…</h2>
          <p>Finding company information and recent news. This can take up to 20 seconds.</p>
        </div>
      ) : null}

      {!research && !loading && !error ? (
        <div className="status-panel">
          <h2>Your research starts here</h2>
          <p>Enter a company name to see an overview, recent developments, and the sources behind them.</p>
        </div>
      ) : null}

      {research ? (
        <section className="research">
          <div className="research-heading">
            <h2>{research.company}</h2>
            <p>Source excerpts · Recent news searches cover the past 12 months</p>
          </div>
          <div className="results-grid">
            <ResultsSection title="What they do" section={research.overview} />
            <ResultsSection title="Recent developments" section={research.developments} />
          </div>
        </section>
      ) : null}

      <footer>Read the original sources for the details that matter to your meeting.</footer>
    </main>
  );
}
