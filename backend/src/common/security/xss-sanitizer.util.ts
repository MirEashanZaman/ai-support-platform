export function sanitizeInput(input: string): string {
  if (!input) return '';
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')

    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}
