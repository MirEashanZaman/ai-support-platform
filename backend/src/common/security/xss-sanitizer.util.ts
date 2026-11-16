/**
 * Input Sanitization Utility (PRD Section 8 Security & Tech Decisions Section 2):
 * Strips <script> blocks, inline event handlers (onerror, onload, onclick),
 * javascript: URIs, HTML tags, and control characters from untrusted user input.
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}
