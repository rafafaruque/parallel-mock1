import { NextResponse } from "next/server";

type Source = {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string | null;
};

type SearchSection = {
  sources: Source[];
  error?: { source: "parallel"; message: string; status?: number };
};

type ParallelResponse = {
  results: {
    title: string;
    url: string;
    excerpts: string[];
    publish_date?: string | null;
  }[];
};

type Citation = {
  type: string;
  title: string;
  url: string;
  start_index: number;
  end_index: number;
};

type BriefingPart = { text: string; citations: Citation[] };
type Briefing = {
  parts: BriefingPart[];
  incomplete: boolean;
  error?: { source: "parallel"; message: string; status?: number };
};

type ResponsesPayload = {
  status?: string;
  output?: {
    type: string;
    content?: { type: string; text?: string; annotations?: Citation[] }[];
  }[];
};

// Search and Responses are isolated in these two server-only functions.
async function searchParallel(
  company: string,
  topic: "overview" | "developments",
  apiKey: string,
): Promise<SearchSection> {
  const recent = topic === "developments";
  const oneYearAgo = new Date();
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
  const afterDate = oneYearAgo.toISOString().slice(0, 10);

  let response: Response;
  try {
    response = await fetch("https://api.parallel.ai/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        objective: recent
          ? "Find recent developments about " + company + " since " + afterDate +
            ". Focus on product launches, partnerships, funding, and significant company news. Prefer official announcements and reputable reporting."
          : "Explain what " + company +
            " does, its main products or services, and its customers. Prefer its official website and clear company profiles.",
        search_queries: [
          company + (recent ? " latest company news" : " company products services"),
        ],
        mode: "fast",
        advanced_settings: {
          max_results: 3,
          excerpt_settings: { max_chars_per_result: 900 },
          source_policy: recent ? { after_date: afterDate } : undefined,
        },
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (error) {
    return {
      sources: [],
      error: {
        source: "parallel",
        message: error instanceof Error && error.name === "TimeoutError"
          ? "Parallel did not respond within 20 seconds. Please retry."
          : "Our server could not reach Parallel. Please retry.",
      },
    };
  }

  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Parallel rejected the API key. Check .env.local.",
      403: "This Parallel API key does not have access to Search.",
      402: "Your Parallel account needs available credits.",
      429: "Parallel's rate limit was reached. Wait a moment and retry.",
    };
    return {
      sources: [],
      error: {
        source: "parallel",
        message: messages[response.status] || "Parallel could not complete the search.",
        status: response.status,
      },
    };
  }

  try {
    const data: ParallelResponse = await response.json();
    if (!Array.isArray(data.results)) throw new Error("Missing results");

    const sources = data.results.map((result) => {
      const url = new URL(result.url);
      if (!["http:", "https:"].includes(url.protocol) ||
          typeof result.title !== "string" ||
          !Array.isArray(result.excerpts) ||
          !result.excerpts.every((excerpt) => typeof excerpt === "string")) {
        throw new Error("Invalid result");
      }
      return {
        title: result.title,
        url: url.href,
        excerpt: result.excerpts.join("\n\n"),
        publishedAt: typeof result.publish_date === "string" ? result.publish_date : null,
      };
    });
    return { sources };
  } catch {
    return {
      sources: [],
      error: { source: "parallel", message: "Parallel returned an unexpected response format." },
    };
  }
}

async function generateBriefing(company: string, apiKey: string): Promise<Briefing> {
  let response: Response;
  try {
    response = await fetch("https://api.parallel.ai/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "parallel",
        reasoning: { effort: "medium" },
        input: "Prepare a concise meeting briefing about " + JSON.stringify(company) +
          " as of " + new Date().toISOString().slice(0, 10) +
          ". Keep it under 250 words. Use exactly these three plain-text section headings: " +
          "What the company does; Recent developments; Conversation starters. " +
          "Under the first heading, write 2–3 sentences about the business. " +
          "Under the second, give three meaningful developments from the past 12 months with dates. " +
          "Under the third, give two specific questions someone could ask in a meeting. " +
          "Research current sources and cite factual claims. Prefer official announcements and reputable reporting. " +
          "If facts or recent developments cannot be verified, say so instead of inventing them. " +
          "Use plain text with numbered lists, without Markdown links or formatting.",
      }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch (error) {
    return {
      parts: [],
      incomplete: true,
      error: {
        source: "parallel",
        message: error instanceof Error && error.name === "TimeoutError"
          ? "Parallel Responses did not finish within 60 seconds."
          : "Our server could not reach Parallel Responses.",
      },
    };
  }

  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Parallel Responses rejected the API key.",
      403: "This API key does not have access to Parallel Responses.",
      402: "Your Parallel account needs available credits for Responses.",
      429: "Parallel Responses reached its rate limit. Wait a moment and retry.",
    };
    return {
      parts: [],
      incomplete: true,
      error: {
        source: "parallel",
        message: messages[response.status] || "Parallel Responses could not generate a briefing.",
        status: response.status,
      },
    };
  }

  try {
    const data: ResponsesPayload = await response.json();
    if (!Array.isArray(data.output)) throw new Error("Missing output");
    const parts: BriefingPart[] = [];
    let incomplete = data.status !== "completed";

    for (const item of data.output) {
      if (item.type !== "message" || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part.type !== "output_text" || typeof part.text !== "string" || !part.text.trim()) continue;
        const text = part.text;
        const citations: Citation[] = [];

        for (const annotation of part.annotations || []) {
          if (annotation.type !== "url_citation") continue;
          try {
            const url = new URL(annotation.url);
            if (!["http:", "https:"].includes(url.protocol) ||
                !Number.isInteger(annotation.start_index) ||
                !Number.isInteger(annotation.end_index) ||
                annotation.start_index < 0 ||
                annotation.end_index < annotation.start_index ||
                annotation.end_index > text.length) {
              throw new Error("Invalid citation");
            }
            citations.push({
              type: "url_citation",
              title: typeof annotation.title === "string" ? annotation.title : annotation.url,
              url: annotation.url,
              start_index: annotation.start_index,
              end_index: annotation.end_index,
            });
          } catch {
            incomplete = true;
          }
        }

        citations.sort((left, right) => left.end_index - right.end_index);
        parts.push({ text, citations });
      }
    }

    if (!parts.length) throw new Error("No briefing text");
    return { parts, incomplete };
  } catch {
    return {
      parts: [],
      incomplete: true,
      error: { source: "parallel", message: "Parallel Responses returned no readable briefing. Search results may still be available below." },
    };
  }
}

export async function POST(request: Request) {
  let company: string;
  try {
    const body: { company?: unknown } | null = await request.json();
    company = typeof body?.company === "string" ? body.company.trim() : "";
  } catch {
    return NextResponse.json(
      { error: { source: "server", message: "The request must contain valid JSON." } },
      { status: 400 },
    );
  }

  if (company.length < 2 || company.length > 120) {
    return NextResponse.json(
      { error: { source: "server", message: "Enter a company name between 2 and 120 characters." } },
      { status: 400 },
    );
  }

  const apiKey = process.env.PARALLEL_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: { source: "server", message: "PARALLEL_API_KEY is missing. Add it to .env.local and restart the server." } },
      { status: 503 },
    );
  }

  try {
    const [overview, developments, briefing] = await Promise.all([
      searchParallel(company, "overview", apiKey),
      searchParallel(company, "developments", apiKey),
      generateBriefing(company, apiKey),
    ]);

    if (overview.error && developments.error && briefing.error) {
      return NextResponse.json({ error: briefing.error }, { status: 502 });
    }

    return NextResponse.json({ research: { company, overview, developments, briefing } });
  } catch {
    return NextResponse.json(
      { error: { source: "server", message: "An unexpected error occurred in the research route." } },
      { status: 500 },
    );
  }
}
