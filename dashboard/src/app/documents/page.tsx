'use client';

import React, { useEffect, useState } from 'react';
import {
  DocumentChunkItem,
  DocumentItem,
  documentsApi,
  getStoredTenantInfo,
  workspaceApi,
} from '../../lib/api-client';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [tenantKey, setTenantKey] = useState<string>('oil-supply');
  const [name, setName] = useState('');
  const [type, setType] = useState<'pdf' | 'txt' | 'md' | 'url'>('pdf');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawContent, setRawContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [chunksByDocId, setChunksByDocId] = useState<
    Record<string, DocumentChunkItem[]>
  >({});
  const [loadingChunksDocId, setLoadingChunksDocId] = useState<string | null>(
    null,
  );

  const [testQuestion, setTestQuestion] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    question: string;
    answer: string;
    citations: Array<{ documentName: string; snippet?: string }>;
    confidence: number | null;
    status: string;
  } | null>(null);

  const embedScriptTag = `<script src="http://localhost:4000/widget.js" data-tenant-key="${tenantKey}" async></script>`;

  async function handleCopyScriptTag() {
    try {
      await navigator.clipboard.writeText(embedScriptTag);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      setStatusMessage('Copied script tag to clipboard.');
    }
  }

  async function loadDocuments() {
    try {
      const list = await documentsApi.listDocuments();
      setDocuments(list);
      setTenantKey(getStoredTenantInfo().tenantKey);
    } catch {

    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);

    try {
      if (selectedFile) {
        if (selectedFile.size > 10 * 1024 * 1024) {
          setStatusMessage('Error: File exceeds the 10 MB limit.');
          return;
        }
        const uploaded = await documentsApi.uploadMultipartFile(
          selectedFile,
          name.trim() || selectedFile.name,
        );
        setStatusMessage(
          `Uploaded & indexed "${uploaded.name}" (${uploaded.status})!`,
        );
        setSelectedFile(null);
        setName('');
        await loadDocuments();
        return;
      }

      const resolvedName =
        name.trim() || (type === 'url' ? sourceUrl.trim() : '');
      if (!resolvedName) {
        setStatusMessage('Please select a file, enter a URL, or provide a document name.');
        return;
      }

      const created = await documentsApi.createTextOrUrlDocument({
        name: resolvedName,
        type,
        rawContent: rawContent.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setStatusMessage(
        `Added & indexed "${created.name}" (${created.status})!`,
      );
      setName('');
      setRawContent('');
      setSourceUrl('');
      await loadDocuments();
    } catch (err) {
      setStatusMessage(
        (err as Error)?.message || 'Upload failed. Check file size (<10 MB) and format.',
      );
    }
  }

  async function handleDelete(id: string) {
    await documentsApi.deleteDocument(id);
    if (expandedDocId === id) {
      setExpandedDocId(null);
    }
    setStatusMessage('Deleted document and removed its vector embeddings.');
    await loadDocuments();
  }

  async function handleToggleChunks(docId: string) {
    if (expandedDocId === docId) {
      setExpandedDocId(null);
      return;
    }
    setExpandedDocId(docId);
    if (!chunksByDocId[docId]) {
      setLoadingChunksDocId(docId);
      try {
        const chunks = await documentsApi.listDocumentChunks(docId);
        setChunksByDocId((prev) => ({ ...prev, [docId]: chunks }));
      } catch {
        setChunksByDocId((prev) => ({ ...prev, [docId]: [] }));
      } finally {
        setLoadingChunksDocId(null);
      }
    }
  }

  async function handleAskTestQuestion(e: React.FormEvent) {
    e.preventDefault();
    const q = testQuestion.trim();
    if (!q) return;
    setTestLoading(true);
    try {
      const sessionKey = `doc-test-${Date.now().toString(36)}`;
      const res = await workspaceApi.askAiBot(q, sessionKey);
      setTestResult({
        question: q,
        answer:
          res.reply?.content ||
          'Escalated to human agent inbox.',
        citations: res.reply?.citations || [],
        confidence: res.reply?.confidence ?? null,
        status: res.status,
      });
    } catch {
      setTestResult({
        question: q,
        answer: 'Could not query AI bot. Please check your connection.',
        citations: [],
        confidence: null,
        status: 'bot',
      });
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>
        Knowledge Base Documents &amp; Embeddable Widget
      </h1>

      <section
        style={{
          background: '#ffffff',
          padding: 20,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>
          Website Chat Widget Embed Code
        </h2>
        <p style={{ margin: '4px 0 12px', fontSize: 13, color: '#64748b' }}>
          Paste this snippet before the closing <code>&lt;/body&gt;</code> tag of your website to enable the live support widget.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            maxWidth: 860,
          }}
        >
          <code
            style={{
              flex: 1,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              color: '#0f172a',
              wordBreak: 'break-all',
            }}
          >
            {embedScriptTag}
          </code>
          <button
            type="button"
            onClick={handleCopyScriptTag}
            style={{
              background: copiedScript ? '#059669' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {copiedScript ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      </section>

      <section
        style={{
          background: '#ffffff',
          padding: 20,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>
          Upload Document File (PDF, TXT, Markdown max 10 MB) or Add Web Page URL
        </h2>
        <form
          onSubmit={handleUpload}
          style={{ display: 'grid', gap: 12, maxWidth: 680 }}
        >

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px dashed #94a3b8',
              background: '#f8fafc',
            }}
          >
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              1. Choose File (.pdf, .txt, .md — max 10 MB):
            </label>
            <input
              type="file"
              accept=".pdf,.txt,.md,.markdown"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setSelectedFile(f);
                if (f && !name) {
                  setName(f.name);
                }
              }}
              style={{ fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Document title (e.g., Oil_Supply_Policy.pdf or FAQ URL)"
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
              }}
            />
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as 'pdf' | 'txt' | 'md' | 'url')
              }
              style={{
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
              }}
            >
              <option value="pdf">PDF (.pdf)</option>
              <option value="md">Markdown (.md)</option>
              <option value="txt">Text (.txt)</option>
              <option value="url">Web Page URL</option>
            </select>
          </div>

          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => {
              setSourceUrl(e.target.value);
              if (e.target.value && type !== 'url') {
                setType('url');
              }
            }}
            placeholder="2. Or enter a Web Page URL (https://oil-supply-and-delivery-management.vercel.app/faq)"
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
            }}
          />

          <textarea
            rows={4}
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            placeholder="3. Or paste Markdown / plain text document content directly..."
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
            }}
          />

          <button
            type="submit"
            style={{
              justifySelf: 'start',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Upload &amp; Index Document
          </button>
          {statusMessage && (
            <div style={{ fontSize: 13, color: '#0284c7', fontWeight: 500 }}>
              {statusMessage}
            </div>
          )}
        </form>
      </section>

      <section
        style={{
          background: '#ffffff',
          padding: 20,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>
          Uploaded Documents ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>
            No documents uploaded yet.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {documents.map((doc) => {
              const isExpanded = expandedDocId === doc.id;
              const docChunks = chunksByDocId[doc.id] || [];
              const isLoadingChunks = loadingChunksDocId === doc.id;

              return (
                <div
                  key={doc.id}
                  style={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div>
                      <strong>{doc.name}</strong>{' '}
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        ({doc.type.toUpperCase()})
                      </span>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#059669',
                          marginTop: 4,
                        }}
                      >
                        Status: {doc.status}
                        {typeof doc.chunkCount === 'number'
                          ? ` · ${doc.chunkCount} indexed chunk${doc.chunkCount === 1 ? '' : 's'}`
                          : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleToggleChunks(doc.id)}
                        style={{
                          background: isExpanded ? '#e0f2fe' : '#f1f5f9',
                          color: isExpanded ? '#0369a1' : '#334155',
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isExpanded
                          ? 'Hide Indexed Text'
                          : 'View Indexed Text'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        style={{
                          background: '#fee2e2',
                          color: '#b91c1c',
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Delete Document
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        background: '#f8fafc',
                        borderTop: '1px solid #e2e8f0',
                        padding: 14,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#475569',
                        }}
                      >
                        Extracted &amp; Indexed Knowledge Chunks ({docChunks.length}):
                      </div>
                      {isLoadingChunks ? (
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          Loading extracted chunks...
                        </div>
                      ) : docChunks.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          No text chunks were extracted from this document.
                        </div>
                      ) : (
                        docChunks.map((chunk) => (
                          <div
                            key={chunk.id}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: 6,
                              padding: '10px 12px',
                              fontSize: 13,
                              lineHeight: 1.5,
                              color: '#0f172a',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#2563eb',
                                marginBottom: 4,
                              }}
                            >
                              Chunk #{chunk.chunkIndex + 1}
                            </div>
                            {chunk.content}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        style={{
          background: '#ffffff',
          padding: 20,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>
          Test Ask AI About Your Uploaded Documents
        </h2>
        <p style={{ margin: '4px 0 12px', fontSize: 13, color: '#64748b' }}>
          Ask any question from your uploaded PDFs, Markdown files, or URLs to verify the AI retrieves and cites the right document.
        </p>
        <form
          onSubmit={handleAskTestQuestion}
          style={{ display: 'flex', gap: 10, maxWidth: 860 }}
        >
          <input
            type="text"
            value={testQuestion}
            onChange={(e) => setTestQuestion(e.target.value)}
            placeholder="Ask a question from your uploaded PDF or document..."
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            disabled={testLoading}
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {testLoading ? 'Searching...' : 'Test Ask AI'}
          </button>
        </form>

        {testResult && (
          <div
            style={{
              marginTop: 14,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 14,
              maxWidth: 860,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
              Question: &ldquo;{testResult.question}&rdquo;
            </div>
            <div
              style={{
                fontSize: 14,
                color: '#0f172a',
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              <strong>AI Answer:</strong> {testResult.answer}
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 8,
                fontSize: 12,
              }}
            >
              {testResult.citations.map((c, idx) => (
                <span
                  key={idx}
                  style={{
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontWeight: 600,
                  }}
                >
                  Source: {c.documentName}
                </span>
              ))}
              {testResult.status === 'waiting' ? (
                <span
                  style={{
                    background: '#fef3c7',
                    color: '#b45309',
                    border: '1px solid #fde68a',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontWeight: 600,
                  }}
                >
                  Escalated to Live Agent Inbox
                </span>
              ) : (
                <span
                  style={{
                    background: '#f0fdf4',
                    color: '#15803d',
                    border: '1px solid #bbf7d0',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontWeight: 600,
                  }}
                >
                  Confidence:{' '}
                  {Math.round((testResult.confidence ?? 0.9) * 100)}%
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
