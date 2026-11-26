# ARA — Autonomous Research Assistant

ARA is a web-based research assistant built with JavaScript, Node.js, Express, and OpenRouter.

## Current version

**v0.2.0 — Research workspace upgrade**

- Responsive research chat interface
- Node.js / Express backend
- OpenRouter chat-completions integration
- API key kept on the server in an environment file
- Research-focused system instructions
- Basic health/configuration endpoint
- Local browser autosave for recent conversation context
- Quick, Research, and Deep Research modes
- Vision-based image analysis when the selected model supports images
- CSV descriptive analysis and correlation summaries
- PDF reading and PDF/DOCX/XLSX/PPTX report export

## Requirements

- Node.js 20 or newer
- An OpenRouter API key: https://openrouter.ai/keys

## Setup

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a local environment file:

   - Windows PowerShell: `Copy-Item .env.example .env`
   - macOS / Linux: `cp .env.example .env`

4. Open `.env` and set `OPENROUTER_API_KEY`.
5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open http://localhost:3000.

For production, use `npm start`.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Secret API key | Required |
| `OPENROUTER_MODEL` | OpenRouter model/router slug | `openrouter/free` |
| `PORT` | Local server port | `3000` |
| `APP_URL` | Optional OpenRouter referrer header | `http://localhost:3000` |

Never put the OpenRouter API key in frontend JavaScript or commit your real `.env` file.

## API

### `GET /api/health`

Returns the server status and whether an OpenRouter key is configured.

### `POST /api/chat`

Request body:

```json
{
  "messages": [
    { "role": "user", "content": "Explain causal finitism." }
  ]
}
```

The endpoint accepts recent user/assistant messages and returns:

```json
{ "answer": "..." }
```

## Roadmap

- [ ] Streaming responses
- [ ] Model selector and provider error handling
- [x] Scholarly metadata search through OpenAlex and Crossref
- [x] CSV descriptive statistics, missing-value counts, categorical frequencies, and Pearson correlations
- [x] Image understanding through a vision-capable OpenRouter model
- [x] Specialist review workflow (logic/methodology and evidence/citation review)
- [x] Upload PDFs and extract selectable text for analysis (up to 3 files, 8 MB and 40 pages each)
- [x] Ask questions about uploaded PDFs and compare their contents
- [ ] OCR for scanned/image-only PDFs
- [x] Local browser conversation autosave (not cloud memory or cross-device sync)
- [x] Bounded agent tool-calling loop
- [x] Display retrieved bibliographic records with DOI/source links
- [ ] Automated citation/source verification workflow
- [x] Export assistant responses as PDF, Word (DOCX), Excel (XLSX), and PowerPoint (PPTX)
- [x] Quick, Research, and Deep Research modes

## Important limitation

ARA can export responses as PDF, DOCX, XLSX, and PPTX, extract selectable text from uploaded PDFs, search OpenAlex and Crossref metadata, and run a specialist review workflow. Quick, Research, and Deep Research modes control search and review effort. Users can attach up to 3 PDFs (8 MB and 40 pages each) and ask for summaries, critical analysis, comparisons, and reference extraction. On Windows, PDF export attempts to use the installed Nirmala UI font for Bengali text. Scanned/image-only PDFs are not OCR-processed yet, and citation verification is not automatic. Scholarly search retrieves bibliographic metadata from OpenAlex and Crossref; it does not independently fetch or inspect full-text papers. Text extracted from uploaded PDFs is supplied to the model as user-provided source material, not independently verified evidence.
