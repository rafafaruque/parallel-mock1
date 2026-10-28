"use client";

import { useState, type FormEvent, type ReactNode } from "react";

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
  briefing: Briefing;
};

type BriefingPart = {
  text: string;
  citations: {
    type: string;
    title: string;
    url: string;
    start_index: number;
    end_index: number;
  }[];
};

type Briefing = {
  parts: BriefingPart[];
  incomplete: boolean;
  error?: ResearchError;
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

function BriefingText({ part }: { part: BriefingPart }) {
  const content: ReactNode[] = [];
  let cursor = 0;

  // Keep the API text unchanged; add links at the supplied citation positions.
  for (const [index, citation] of part.citations.entries()) {
    content.push(part.text.slice(cursor, citation.end_index));
    content.push(
      <a
        className="inline-citation"
        href={citation.url}
        key={index}
        title={citation.title}
        aria-label={"Source " + (index + 1) + ": " + citation.title}
        target="_blank"
        rel="noopener noreferrer"
      >[{index + 1}]</a>,
    );
    cursor = citation.end_index;
  }
  content.push(part.text.slice(cursor));

  return <div className="briefing-text">{content}</div>;
}

function MeetingBriefing({ briefing }: { briefing: Briefing }) {
  const hasCitations = briefing.parts.some((part) => part.citations.length > 0);
  return (
    <section className="meeting-briefing" aria-label="Company meeting briefing">
      <p className="eyebrow">YOUR MEETING BRIEFING</p>
      <h3>The essentials, before you meet</h3>
      {briefing.error ? <ErrorMessage error={briefing.error} /> : (
        <>
          {briefing.incomplete ? (
            <p className="briefing-notice" role="status">Parallel returned a partial briefing. Some content or citations may be missing.</p>
          ) : null}
          {!briefing.parts.length ? <p>No briefing text was returned. Browse the search results below.</p> : null}
          {!hasCitations && briefing.parts.length > 0 ? (
            <p className="briefing-notice" role="status">No source citations were returned for this briefing. Check factual claims against the search sources below.</p>
          ) : null}
          {briefing.parts.map((part, index) => (
            <div key={index}>
              <BriefingText part={part} />
              {part.citations.length > 0 ? (
                <details className="briefing-sources">
                  <summary>Briefing sources{briefing.parts.length > 1 ? " · part " + (index + 1) : ""}</summary>
                  <ol>
                    {part.citations.map((citation, citationIndex) => (
                      <li key={citationIndex}><a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title}</a></li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          ))}
        </>
      )}
    </section>
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
          <p>{source.excerpt ? source.excerpt.slice(0, 180) + (source.excerpt.length > 180 ? "…" : "") : "No excerpt was returned. Open the source to read more."}</p>
          {source.excerpt.length > 180 ? (
            <details className="full-excerpt">
              <summary>Read full excerpt</summary>
              <p>{source.excerpt}</p>
            </details>
          ) : null}
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
        signal: AbortSignal.timeout(65_000),
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
          ? "The browser stopped waiting after 65 seconds. Please retry."
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
        <p>Powered by Parallel Search + Responses · Briefings can take up to a minute</p>
      </form>

      {error ? <ErrorMessage error={error} /> : null}

      {loading ? (
        <div className="status-panel" role="status">
          <h2>Researching {company.trim()}…</h2>
          <p>Finding sources and writing your meeting briefing. This can take up to a minute.</p>
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
            <p>A concise briefing and original sources · Recent research covers the past 12 months</p>
          </div>
          <MeetingBriefing briefing={research.briefing} />
          <h3 className="search-results-heading">Explore the search results</h3>
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
