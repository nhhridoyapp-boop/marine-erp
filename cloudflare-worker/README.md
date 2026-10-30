# San Marine OCR — Cloudflare Worker (Free Tier)

This Worker proxies Gemini Vision OCR calls so the **Gemini API key stays server-side** and the Base44 app consumes **zero Integration Credits** for OCR.

## Simple setup (no editing the ERP source)

Open San Marine → System Settings → Free Gemini OCR for Bengali step-by-step instructions, a standalone Worker download, and the shared Worker URL field.

1. Create a Gemini key at https://aistudio.google.com/apikey; keep the Google project on the Free tier if you want free-tier usage.
2. Create a Cloudflare Worker on its Free plan. Download the standalone OCR Worker from System Settings, paste its full source into the Cloudflare editor, and Deploy.
3. Set `GEMINI_API_KEY` as a Worker **Secret**, never as frontend code or a Setting record.
4. Save the resulting HTTPS Worker URL in San Marine System Settings. Every user reads the same Setting; no app rebuild is needed for changing this URL.
5. Remove any old `GEMINI_MODEL` variable or set it to `gemini-3.1-flash-lite`. On the published app, use “মডেল ও OCR যাচাই”: it checks model generation methods and reads a synthetic DMT-12-3456 image, consuming one OCR request from the free quota without sending user paperwork. A model list alone does not prove generation works.

For CLI deployment, this folder's `ocr-worker.js` imports the same canonical Worker source used by the download. Run Wrangler deployment locally; secrets are entered only in your own Cloudflare account.

The Worker defaults to the published app origin. For a custom domain or preview, set `ALLOWED_ORIGINS` to comma-separated exact origins (no trailing slash). CORS is not user authentication; configure abuse protection / appropriate Cloudflare rate limits before public use.

## Free tier and privacy

Google publishes free text/image input and output tiers for `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`, and `gemini-2.5-flash`. The Worker only selects these exact models when `models.list` reports support for `generateContent`; retired 1.5/2.0 models, moving aliases, and paid-only models are not used. Project-specific quotas apply: https://aistudio.google.com/rate-limit. Keep the Google project on the **Free** billing tier and Cloudflare on its Free plan. A key from a paid project can still incur charges for these models; the Worker cannot detect the billing tier. Quota errors stop OCR, leaving manual entry available; no automatic paid fallback is used.

Gemini Free inputs may be used to improve Google's products. Get permission before sending sensitive paperwork. OCR uses no Base44 InvokeLLM call; existing image uploads, signed access and other app usage remain subject to Base44 limits.

The Worker accepts inline JPEG/PNG/WebP bytes rather than fetching caller-controlled URLs. Images are transmitted transiently to Cloudflare/Gemini; keys and images are not logged by the Worker. Optional `GEMINI_MODEL` text variable: `gemini-3.1-flash-lite` (default), `gemini-2.5-flash-lite`, or `gemini-2.5-flash`. Leave it unset to use the current default.

See https://ai.google.dev/gemini-api/docs/pricing and https://developers.cloudflare.com/workers/platform/pricing/ for current conditions.