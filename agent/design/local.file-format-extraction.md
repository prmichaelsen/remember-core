# File Format Extraction

**Concept**: Pluggable file-to-text extraction pipeline for PDF, DOCX, images, HTML, and structured data — integrated into the import job flow
**Created**: 2026-03-05
**Status**: Design Specification
**Source**: agent/clarifications/clarification-6-file-format-import-support.md, agent/clarifications/clarification-7-file-format-import-tradeoffs.md

---

## Overview

The import pipeline today accepts only raw text strings. Users want to import files in various formats — PDFs, Word documents, images, HTML pages, and structured data. This design adds a pluggable extraction layer to remember-core that converts file content to text before feeding it into the existing chunking and memory creation pipeline.

Extraction lives in remember-core as a set of format-specific extractors behind a common interface. The `ImportJobWorker` gains an extraction step that downloads files via signed HTTPS URLs, extracts text, then proceeds with the existing chunk-and-import flow. Extraction libraries are optional peer dependencies to keep the core package lightweight.

---

## Problem Statement

- `ImportService` only accepts `ImportItem.content` as a raw string — consumers must pre-resolve files to text
- No mechanism exists in the stack to extract text from PDFs, DOCX, images, or other binary formats
- Without a centralized extraction layer, each consumer (agentbase.me, MCP server) would need to implement format parsing independently
- Users want to attach files in chat and have them imported as memories, which requires format-aware text extraction

---

## Solution

### Architecture

```
Consumer (agentbase.me)
  |
  ├─ Upload file to GCS bucket
  ├─ Generate signed download URL (1-hour TTL)
  ├─ POST /api/svc/v1/memories/import
  │    body: { items: [{ file_url: "https://storage.googleapis.com/...?X-Goog-Signature=...", mime_type: "application/pdf" }] }
  │    → 202 Accepted { job_id }
  |
  └─ Poll GET /api/svc/v1/jobs/:id

ImportJobWorker (Cloud Run Job)
  |
  ├─ Step 0: Validate file type (MIME whitelist)
  ├─ Step 1: Download file via signed URL (plain HTTP GET)
  ├─ Step 2: Extract text via FileExtractor
  │    ├─ PDF (text-layer)  → unpdf
  │    ├─ PDF (scanned)     → Google Document AI (fallback)
  │    ├─ DOCX              → mammoth + Turndown
  │    ├─ Images            → Google Vision API
  │    ├─ HTML              → Turndown
  │    ├─ TXT/Markdown      → passthrough (read as UTF-8)
  │    └─ CSV/JSON/YAML     → passthrough (read as UTF-8)
  ├─ Step 3-N: Chunk text and create memories (existing flow)
  ├─ Generate parent summary
  ├─ Link relationships
  └─ Job complete
```

### Key Design Decisions

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| Extraction location | remember-core | Single source of truth, transport-agnostic |
| Input mechanism | Signed HTTPS URLs | Consumer uploads to cloud storage, generates a time-limited signed download URL, passes it to import endpoint. Worker downloads via plain HTTP GET — no GCS credentials needed. Storage-agnostic (any HTTPS URL works) |
| PDF text-layer | unpdf (npm) | Modern, ESM, TypeScript, Cloud Run-friendly, free, in-process |
| PDF scanned | Google Document AI (fallback) | 98% OCR accuracy, GCP-native, $1.50/1K pages |
| DOCX | mammoth + Turndown | Only viable Node.js option, well-maintained, good Markdown output |
| Image OCR | Google Vision API | Already set up, 98% accuracy, $1.50/1K images |
| HTML | Turndown | Already a dependency for DOCX pipeline |
| Structured data (CSV/JSON/YAML) | Raw text passthrough, chunked as-is | User expects data imported exactly as sent |
| TXT/Markdown | UTF-8 passthrough | No conversion needed |
| DOCX formatting | Preserve as Markdown | Tables as Markdown tables, headings preserved |
| Dependencies | Optional peer dependencies | Keeps core lightweight, follows existing `jsonwebtoken` pattern |
| Job architecture | Extraction as step within ImportJobWorker | Single job, simpler consumer, Option A from clar-7 |
| Malware scanning | Skip for MVP | Files discarded after extraction, not stored. unpdf (PDF.js) well-audited. Revisit if files stored later |
| Prompt injection | Metadata tagging (`source:file_import`) | Downstream consumers decide trust level |
| Error handling | Fail job on unsupported/corrupted files | `extraction_failed` error code, correct job status |
| Pre-import validation | Before 202 response | Check MIME type against whitelist, reject immediately |
| File storage | Discard after extraction | No persistent file storage |
| Section-aware chunking | If feasible | Use document headers to influence chunk boundaries when available |
| Page numbers | In chunk markers | `[CHUNK 00003 | Pages 5-7]` when source provides page info |
| Document metadata | Stored as tags on parent summary | Title, author, creation date from PDF/DOCX properties |

### Alternatives Considered

- **Consumer-side extraction**: Let agentbase.me parse files before calling import. Rejected — duplicates logic across consumers, remember-core already owns import orchestration.
- **Multipart file upload**: REST endpoint accepts file bytes directly. Rejected — signed URL reference is simpler, avoids request size limits, and fits the existing async job pattern.
- **Direct GCS `gs://` URLs**: Worker would need GCS credentials to access consumer's bucket. Rejected — signed HTTPS URLs are storage-agnostic and require no cross-project IAM configuration.
- **Regular dependencies**: Bundle extraction libraries with every install. Rejected — adds ~3.5MB to all consumers, most don't use import.
- **Separate subpath export** (`remember-core/import`): Clean separation but adds package.json complexity. Rejected in favor of simpler peer dependency pattern already used for `jsonwebtoken`.
- **tesseract.js for OCR**: Free local alternative. Rejected — ~85% accuracy vs 98% for Google Vision, high memory usage, poor on handwriting.
- **ClamAV malware scanning**: GCP-native solution. Deferred — files are transient (downloaded, extracted, discarded), not stored. Risk is limited to parser exploits, mitigated by using well-audited libraries.

---

## Implementation

### 1. FileExtractor Interface

```typescript
// src/services/extractors/types.ts

export interface ExtractionResult {
  /** Extracted plain text / Markdown content */
  text: string;
  /** Document metadata (title, author, page count, etc.) */
  metadata: Record<string, string>;
  /** Page boundaries for chunk markers (index = page number, value = char offset) */
  page_boundaries?: number[];
}

export interface FileExtractor {
  /** MIME types this extractor handles */
  readonly supportedMimeTypes: string[];
  /** Extract text from file content */
  extract(content: Buffer, mimeType: string): Promise<ExtractionResult>;
}
```

### 2. Extractor Implementations

```typescript
// src/services/extractors/pdf.extractor.ts
export class PdfExtractor implements FileExtractor {
  readonly supportedMimeTypes = ['application/pdf'];

  constructor(
    private documentAiClient?: DocumentAiClient, // optional, for scanned fallback
    private logger?: Logger,
  ) {}

  async extract(content: Buffer, mimeType: string): Promise<ExtractionResult> {
    // 1. Try unpdf (text-layer extraction)
    const { extractText } = await import('unpdf');
    const { text, metadata } = await extractText(content);

    // 2. If text is empty/near-empty, fall back to Document AI OCR
    if (text.trim().length < 50 && this.documentAiClient) {
      this.logger?.info('PDF has no text layer, falling back to Document AI OCR');
      return this.extractWithDocumentAi(content);
    }

    return { text, metadata };
  }

  private async extractWithDocumentAi(content: Buffer): Promise<ExtractionResult> {
    // Call Google Document AI OCR processor
    // Returns extracted text with page boundaries
  }
}

// src/services/extractors/docx.extractor.ts
export class DocxExtractor implements FileExtractor {
  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  async extract(content: Buffer): Promise<ExtractionResult> {
    const mammoth = await import('mammoth');
    const TurndownService = (await import('turndown')).default;

    // 1. Convert DOCX to HTML (semantic, clean)
    const { value: html } = await mammoth.convertToHtml({ buffer: content });

    // 2. Convert HTML to Markdown
    const turndown = new TurndownService({ headingStyle: 'atx' });
    const markdown = turndown.turndown(html);

    return { text: markdown, metadata: {} };
  }
}

// src/services/extractors/image.extractor.ts
export class ImageExtractor implements FileExtractor {
  readonly supportedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff'];

  constructor(private visionClient: VisionClient) {}

  async extract(content: Buffer, mimeType: string): Promise<ExtractionResult> {
    // Call Google Vision API for OCR
    const text = await this.visionClient.detectText(content);
    return { text, metadata: {} };
  }
}

// src/services/extractors/html.extractor.ts
export class HtmlExtractor implements FileExtractor {
  readonly supportedMimeTypes = ['text/html'];

  async extract(content: Buffer): Promise<ExtractionResult> {
    const TurndownService = (await import('turndown')).default;
    const turndown = new TurndownService({ headingStyle: 'atx' });
    const markdown = turndown.turndown(content.toString('utf-8'));
    return { text: markdown, metadata: {} };
  }
}

// src/services/extractors/plaintext.extractor.ts
export class PlaintextExtractor implements FileExtractor {
  readonly supportedMimeTypes = [
    'text/plain', 'text/markdown', 'text/csv',
    'application/json', 'application/x-yaml', 'text/yaml',
  ];

  async extract(content: Buffer): Promise<ExtractionResult> {
    return { text: content.toString('utf-8'), metadata: {} };
  }
}
```

### 3. ExtractorRegistry

```typescript
// src/services/extractors/registry.ts

export class ExtractorRegistry {
  private extractors: FileExtractor[] = [];

  register(extractor: FileExtractor): void {
    this.extractors.push(extractor);
  }

  getExtractor(mimeType: string): FileExtractor | null {
    return this.extractors.find(e => e.supportedMimeTypes.includes(mimeType)) ?? null;
  }

  getSupportedMimeTypes(): string[] {
    return this.extractors.flatMap(e => e.supportedMimeTypes);
  }
}

/**
 * Create a registry with all built-in extractors.
 * Cloud clients are optional — if not provided, those extractors are skipped.
 */
export function createDefaultRegistry(deps?: {
  documentAiClient?: DocumentAiClient;
  visionClient?: VisionClient;
  logger?: Logger;
}): ExtractorRegistry {
  const registry = new ExtractorRegistry();
  registry.register(new PlaintextExtractor());
  registry.register(new HtmlExtractor());
  registry.register(new PdfExtractor(deps?.documentAiClient, deps?.logger));
  if (deps?.visionClient) {
    registry.register(new ImageExtractor(deps.visionClient));
  }
  // DOCX extractor requires mammoth + turndown as peer deps
  try {
    registry.register(new DocxExtractor());
  } catch {
    deps?.logger?.warn('mammoth/turndown not installed, DOCX extraction unavailable');
  }
  return registry;
}
```

### 4. Updated ImportItem Type

```typescript
// Extend existing ImportItem in src/services/import.service.ts

export interface ImportItem {
  /** Raw text content (existing — for backward compatibility) */
  content?: string;
  /** Signed HTTPS URL for file-based import (new) */
  file_url?: string;
  /** MIME type of the file (required when file_url is provided) */
  mime_type?: string;
  /** Original filename, for metadata */
  source_filename?: string;
}
```

One of `content` or `file_url` must be provided. If `content` is provided, extraction is skipped (existing behavior). If `file_url` is provided, `mime_type` is required.

### 5. ImportJobWorker Changes

The existing `ImportJobWorker.execute()` gains extraction steps:

```
execute(jobId, userId, params):
  for each item in params.items:
    if item.file_url:
      // Step 0: Validate MIME type
      if !registry.getExtractor(item.mime_type):
        job.fail({ code: 'unsupported_format', message: `${item.mime_type} not supported` })
        return

      // Step 1: Download via signed URL
      buffer = await downloadFile(item.file_url)

      // Step 2: Extract text
      extractor = registry.getExtractor(item.mime_type)
      { text, metadata, page_boundaries } = await extractor.extract(buffer, item.mime_type)

      // Tag parent summary with document metadata
      item.content = text
      item.extraction_metadata = metadata
      item.page_boundaries = page_boundaries

    // Step 3-N: Existing chunk-and-import flow
    // (uses item.content, now populated from extraction)
```

### 6. Pre-Import Validation

Before returning 202, the REST handler validates:

```typescript
// In route handler, before job creation
for (const item of input.items) {
  if (item.file_url && !item.mime_type) {
    return res.status(400).json({ error: 'mime_type required when file_url provided' });
  }
  if (item.file_url && !registry.getExtractor(item.mime_type)) {
    return res.status(400).json({
      error: `Unsupported file type: ${item.mime_type}`,
      supported: registry.getSupportedMimeTypes(),
    });
  }
  if (!item.content && !item.file_url) {
    return res.status(400).json({ error: 'Either content or file_url must be provided' });
  }
}
```

### 7. Metadata and Chunk Markers

When extraction provides metadata and page boundaries:

- **Document metadata** → stored as tags on the parent summary memory:
  - `doc:title:{title}`, `doc:author:{author}`, `doc:created:{date}`
- **Page numbers** → included in chunk markers when page boundaries are available:
  - `[CHUNK 00003 | Pages 5-7]` instead of `[CHUNK 00003]`
- **Source tagging** → all memories from file import get `source:file_import` tag for prompt injection awareness

### 8. Section-Aware Chunking (Best-Effort)

When extracted text contains Markdown headings (from DOCX, HTML, or text-layer PDFs), the chunking logic can use them as preferred split points:

```
Enhanced chunkByTokens(text, maxTokensPerChunk):
  Split on heading boundaries (# / ## / ###) first
  Within each section, split on paragraph boundaries as today
  If a single section exceeds budget, fall back to paragraph splitting
```

This is best-effort — if the complexity is too high, paragraph splitting remains the fallback.

### 9. MIME Type Whitelist

Allowed MIME types for import:

```typescript
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/html',
  'text/plain',
  'text/markdown',
  // Images (OCR)
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/tiff',
  // Structured data
  'text/csv',
  'application/json',
  'application/x-yaml',
  'text/yaml',
];
```

### 10. Peer Dependencies

```json
{
  "peerDependencies": {
    "jsonwebtoken": "^9.0.0",
    "unpdf": "^0.12.0",
    "mammoth": "^1.8.0",
    "turndown": "^7.2.0"
  },
  "peerDependenciesMeta": {
    "jsonwebtoken": { "optional": true },
    "unpdf": { "optional": true },
    "mammoth": { "optional": true },
    "turndown": { "optional": true }
  }
}
```

Consumers that use file import install these. Consumers that only use text import don't need them. Runtime errors are caught in `createDefaultRegistry()` and logged as warnings.

### 11. File Download Utility

```typescript
// src/services/extractors/download.ts

export async function downloadFile(fileUrl: string): Promise<Buffer> {
  // Plain HTTP GET — works with any signed URL (GCS, S3, Azure, etc.)
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
```

No cloud SDK required — signed URLs are just HTTPS endpoints. The consumer (agentbase.me) generates a time-limited signed URL from its own GCS credentials. The worker downloads via plain `fetch()`. This makes remember-core completely storage-agnostic.

**Signed URL TTL**: Consumer should generate URLs with at least 1-hour expiry to allow for job queue delay + processing time.

### 12. File Structure

```
src/services/extractors/
  types.ts                    # FileExtractor interface, ExtractionResult
  registry.ts                 # ExtractorRegistry, createDefaultRegistry()
  pdf.extractor.ts            # PdfExtractor (unpdf + Document AI fallback)
  pdf.extractor.spec.ts       # Unit tests
  docx.extractor.ts           # DocxExtractor (mammoth + Turndown)
  docx.extractor.spec.ts      # Unit tests
  image.extractor.ts          # ImageExtractor (Google Vision API)
  image.extractor.spec.ts     # Unit tests
  html.extractor.ts           # HtmlExtractor (Turndown)
  html.extractor.spec.ts      # Unit tests
  plaintext.extractor.ts      # PlaintextExtractor (passthrough)
  plaintext.extractor.spec.ts # Unit tests
  download.ts                 # File download utility (plain fetch)
  download.spec.ts            # Unit tests
  index.ts                    # Barrel exports

src/services/
  import.service.ts           # Updated ImportItem type (add file_url, mime_type)
  import-job.worker.ts        # Updated with extraction steps

docs/
  openapi.yaml                # Updated ImportInput schema (file_url, mime_type)
```

### 13. OpenAPI Spec Updates

```yaml
ImportItem:
  type: object
  properties:
    content:
      type: string
      description: Raw text content (mutually exclusive with file_url)
    file_url:
      type: string
      description: Signed HTTPS URL for file download (mutually exclusive with content)
    mime_type:
      type: string
      description: MIME type of the file (required when file_url is provided)
    source_filename:
      type: string
      description: Original filename for metadata
```

---

## Benefits

- **Single source of truth** — extraction logic lives in remember-core, not duplicated across consumers
- **Pluggable** — new formats added by implementing `FileExtractor` interface and registering
- **Lightweight** — peer dependencies keep the core package small for consumers who don't use file import
- **Hybrid PDF strategy** — free/fast for text-layer PDFs, cloud OCR only when needed
- **GCP-native** — Document AI and Vision API integrate with existing stack (IAM auth, same region)
- **Backward compatible** — `ImportItem.content` still works, `file_url` is additive
- **Observable** — extraction is a tracked step in the import job, visible via polling

---

## Trade-offs

- **Peer dependency complexity** — consumers must install `unpdf`, `mammoth`, `turndown` to use file import. Runtime errors if deps missing. Mitigated by clear error messages and documentation.
- **Cloud API costs** — Document AI ($1.50/1K pages) and Vision API ($1.50/1K images) add cost for scanned PDFs and images. Mitigated by free tiers (1K/month each) and hybrid strategy (unpdf handles most PDFs for free).
- **Signed URL expiry** — if the job is delayed beyond the URL's TTL, download fails. Mitigated by recommending 1-hour TTL and failing the job with a clear `download_expired` error code.
- **mammoth limitations** — won't preserve embedded charts, SmartArt, or complex nested tables from DOCX. Good enough for typical documents (text, headings, lists, basic tables).
- **No malware scanning** — files are transient but a crafted PDF could exploit the parser. Mitigated by using well-audited libraries (unpdf/PDF.js backed by Mozilla). Revisit if threat model changes.
- **Section-aware chunking complexity** — may be non-trivial for some document formats. Falls back to paragraph splitting if too complex.

---

## Dependencies

### New Optional Peer Dependencies
- `unpdf` (~1MB) — PDF text-layer extraction (wraps PDF.js)
- `mammoth` (~2MB) — DOCX to HTML conversion
- `turndown` (~0.5MB) — HTML to Markdown conversion

### Cloud APIs (already in stack)
- Google Vision API — image OCR (already set up)
- Google Document AI — scanned PDF OCR (may need processor setup)

### No New Required Dependencies
All extraction libraries are optional peer dependencies. File download uses native `fetch()` — no cloud SDK needed.

---

## Testing Strategy

- **Unit: FileExtractor implementations** — mock file content, verify extracted text matches expected output, test edge cases (empty PDF, corrupted DOCX, rotated image)
- **Unit: ExtractorRegistry** — register/lookup by MIME type, unsupported type returns null, supported types list
- **Unit: PdfExtractor fallback** — mock unpdf returning empty text, verify Document AI fallback is called
- **Unit: ImportJobWorker extraction steps** — mock extractors, verify step tracking, verify extraction failure sets correct job error
- **Unit: Pre-import validation** — unsupported MIME type returns 400, missing mime_type returns 400, missing both content and file_url returns 400
- **Unit: Section-aware chunking** — verify heading-based splits, verify fallback to paragraph splitting
- **Unit: downloadFile** — mock fetch, verify Buffer returned, verify error on non-200, verify error on expired signed URL
- **Integration** — end-to-end: upload file, generate signed URL, call import, verify memories created with correct content and metadata tags
- **Edge cases** — zero-byte file, password-protected PDF, DOCX with only images, image with no text, CSV with 10K rows

---

## Migration Path

1. **Add extractor types and interface** — new files, no breaking changes
2. **Implement extractors** — one per format, behind peer dependencies
3. **Add ExtractorRegistry** — factory with graceful fallback for missing deps
4. **Update ImportItem type** — add `file_url` and `mime_type` (additive, backward compatible)
5. **Update ImportJobWorker** — add extraction steps before chunking
6. **Update OpenAPI spec** — add file_url/mime_type to ImportInput schema
7. **Regenerate SVC client types** — `npm run generate:types:svc`
8. **Add pre-import validation** — MIME whitelist check in route handler
9. **Update agentbase.me** — file attachment in chat, upload to GCS, generate signed URL, pass to import endpoint
10. **Set up Google Document AI processor** — if not already provisioned in GCP project

---

## Future Considerations

- **EPUB support** — ZIP of HTML files, relatively easy to add since HTML extraction already exists
- **Semantic chunking** — use LLM to split on topic boundaries instead of token count
- **Malware scanning** — ClamAV on Cloud Run if files start being stored persistently
- **URL validation** — optionally restrict allowed URL domains (e.g., only `storage.googleapis.com`) to prevent SSRF
- **Batch extraction** — process multiple files in parallel within a single job
- **Format-specific chunk strategies** — different chunk sizes or strategies per format (e.g., smaller chunks for dense academic papers)
- **Content deduplication** — detect if imported file content already exists as memories
- **Extraction caching** — cache extracted text for re-import without re-extraction

---

**Status**: Design Specification
**Recommendation**: Implement as a new milestone in remember-core. Start with extractor interface + plaintext/HTML extractors, then add PDF (unpdf + Document AI), then DOCX (mammoth + Turndown), then image OCR (Vision API).
**Related Documents**:
- agent/design/local.import-service.md (existing import design — extended by this)
- agent/design/local.job-tracking-system.md (job architecture — extraction integrates as a step)
- agent/clarifications/clarification-6-file-format-import-support.md (requirements)
- agent/clarifications/clarification-7-file-format-import-tradeoffs.md (tradeoff decisions)
- agent/design/core-sdk.architecture.md (service layer pattern)
