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

// All Parallel-specific code lives in this function.
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
    const [overview, developments] = await Promise.all([
      searchParallel(company, "overview", apiKey),
      searchParallel(company, "developments", apiKey),
    ]);

    if (overview.error && developments.error) {
      return NextResponse.json({ error: overview.error }, { status: 502 });
    }

    return NextResponse.json({ research: { company, overview, developments } });
  } catch {
    return NextResponse.json(
      { error: { source: "server", message: "An unexpected error occurred in the research route." } },
      { status: 500 },
    );
  }
}
