# Company Research Explorer

A small Next.js + TypeScript application for preparing to meet a company.

## Run it

Use Node.js 20.9 or newer.

Put your Parallel API key in the root .env.local file:

    PARALLEL_API_KEY=your_key_here

Then run:

    npm install
    npm run dev

Open http://localhost:3000. Restart the server after changing the key.
The key is read only by the server, and .env.local is ignored by Git.

## Architecture

The data flow is:

    Company input → POST /api/research → Parallel Search + Responses → JSON → React UI

- app/page.tsx holds the form, loading/error/result state, briefing, and expandable source excerpts.
- app/api/research/route.ts validates the input and contains the complete Parallel integration in searchParallel and generateBriefing.
- app/globals.css styles the page. app/layout.tsx is the standard Next.js document wrapper.

There are no additional runtime libraries, databases, authentication, or persisted state.

## Why Parallel Search?

Search returns source excerpts and URLs directly, keeping the underlying research accessible.

The server runs two independent searches at the same time: a company overview and recent developments. Each response maps directly to its UI section. The news search uses Parallel's after_date filter for the past 12 months. Dates are shown when supplied by Parallel.

Official API documentation: https://docs.parallel.ai/search/search-quickstart
Freshness filter: https://docs.parallel.ai/resources/source-policy

## How the concise briefing works

In the same server request, generateBriefing calls POST https://api.parallel.ai/v1/responses using the existing server-only key, model parallel, and medium reasoning effort. It asks for 2–3 overview sentences, three recent developments, and two conversation starters in fewer than 250 words.

The Responses request runs alongside the two Search requests. All three finish before the server returns one JSON response. This keeps one simple request flow; the faster Search results wait for the briefing or its timeout.

The actual API response contains message items in output, with output_text content and url_citation annotations. Each annotation includes a real source URL, title, and start_index/end_index into its text. The server preserves that text and sorts citations by end position. BriefingText inserts clickable numbered links at those positions. The source drawer lists the same annotations. We do not turn model-written URLs into citations or substitute Search links for missing Responses citations.

Official docs:

- https://docs.parallel.ai/responses-api/responses-quickstart
- https://docs.parallel.ai/responses-api/features/citations

## Loading, incomplete results, and errors

Search requests have a 20-second timeout. Responses has a 60-second timeout, and the browser waits up to 65 seconds. There are no automatic retries.

If a request fails, its error appears beside the successful results. Empty Search sections show an empty state. A partial Responses status shows a notice; briefing text without citations gets an explicit missing-citations notice. Unreadable briefing output does not discard successful Search results.

Errors carry a source label:

- Frontend: input validation, browser connection, or browser timeout.
- Server: invalid request, missing configuration, unexpected route failure, or unreadable server response.
- Parallel: rejected credentials, credits, rate limits, request timeout, or an invalid upstream response. HTTP status is included when available.

The server returns HTTP 400 for invalid input, 503 for a missing key, and 502 when all three Parallel requests fail.

## Interview tradeoffs

Company names can be ambiguous; use a full name or domain when needed. Generated briefings can be incomplete or mistaken. Follow the actual citation links to verify facts and dates; the original Search excerpts remain available below the briefing.

If time is short, prioritize the complete search flow, real citation links, and clear states. Caching, export, and saved research can be considered later.

To check the application:

    npm run build

To verify the briefing manually:

1. Run npm run dev, open http://localhost:3000, and research Stripe.
2. Check for an overview, three developments, and two conversation starters above the Search cards.
3. Click an inline citation and expand Briefing sources to see its title and original URL.
4. In browser DevTools, open Network → /api/research → Response. Compare the links with research.briefing.parts[].citations. The API key should never appear in that response.
5. Expand Read full excerpt on a Search card to see the original excerpt.
