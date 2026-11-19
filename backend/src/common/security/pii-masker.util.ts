const EMAIL_REGEX = /\b([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
const PHONE_REGEX = /(\+?\d{1,3}[\s-]?)?\(?\d{3,4}\)?[\s-]?\d{3}[\s-]?\d{3,4}/g;

export function maskPii(input: string): string {
  if (!input) return input;
  return input
    .replace(EMAIL_REGEX, '$1***@$2')
    .replace(PHONE_REGEX, (match) => {
      const digitsOnly = match.replace(/\D/g, '');
      if (digitsOnly.length < 7) return match;
      return `${match.slice(0, 3)}***${match.slice(-3)}`;
    });
}

export function wrapUntrustedDocumentContext(
  chunks: Array<{ chunkId: string; documentName: string; content: string }>,
): string {
  const serialized = chunks
    .map(
      (c, idx) =>
        `<document_chunk index="${idx + 1}" id="${c.chunkId}" source="${c.documentName}">\n${c.content}\n</document_chunk>`,
    )
    .join('\n\n');

  return `<untrusted_business_data>\n${serialized}\n</untrusted_business_data>`;
}
