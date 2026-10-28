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

    Company input → POST /api/research → Parallel Search → JSON → React UI

- app/page.tsx holds the form, loading/error/result state, and result cards.
- app/api/research/route.ts validates the input and contains the complete Parallel integration in searchParallel.
- app/globals.css styles the page. app/layout.tsx is the standard Next.js document wrapper.

There are no additional runtime libraries, databases, authentication, or persisted state.

## Why Parallel Search?

Search returns source excerpts and URLs directly. That is enough to show company context and news without adding another model or generating claims that lack sources.

The server runs two independent searches at the same time: a company overview and recent developments. Each response maps directly to its UI section. The news search uses Parallel's after_date filter for the past 12 months. Dates are shown when supplied by Parallel.

Official API documentation: https://docs.parallel.ai/search/search-quickstart
Freshness filter: https://docs.parallel.ai/resources/source-policy

## Loading, incomplete results, and errors

Each Parallel request has a 20-second timeout. The browser waits up to 25 seconds. There are no automatic retries.

If one search fails, its error appears beside the other search's results. If neither search finds sources, both sections show an empty state.

Errors carry a source label:

- Frontend: input validation, browser connection, or browser timeout.
- Server: invalid request, missing configuration, unexpected route failure, or unreadable server response.
- Parallel: rejected credentials, credits, rate limits, request timeout, or an invalid upstream response. HTTP status is included when available.

The server returns HTTP 400 for invalid input, 503 for a missing key, and 502 when both Parallel searches fail.

## Interview tradeoffs

Results are original source excerpts rather than a generated summary. Company names can be ambiguous; use a full name or domain when needed. Excerpts and publication dates can be incomplete, so every result links to its source.

If time is short, prioritize the complete search flow, source links, and clear states. Summarization, caching, export, and saved research can be considered later.

To check the application:

    npm run build
