'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  FileText,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DocumentChunkItem,
  DocumentItem,
  documentsApi,
  getStoredTenantInfo,
  workspaceApi,
} from '../../lib/api-client';
import {
  EASE_OUT_EXPO,
  PageMotion,
  SpotlightCard,
} from '../../components/motion-primitives';

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

  const apiBaseUrl = (
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  ).replace(/\/+$/, '');
  const embedScriptTag = `<script src="${apiBaseUrl}/widget.js" data-tenant-key="${tenantKey}" async></script>`;

  async function handleCopyScriptTag() {
    try {
      await navigator.clipboard.writeText(embedScriptTag);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      setStatusMessage('Copied embed script to clipboard');
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
          setStatusMessage('File exceeds the 10 MB limit');
          return;
        }
        const uploaded = await documentsApi.uploadMultipartFile(
          selectedFile,
          name.trim() || selectedFile.name,
        );
        setStatusMessage(`Indexed "${uploaded.name}" (${uploaded.status})`);
        setSelectedFile(null);
        setName('');
        await loadDocuments();
        return;
      }

      const resolvedName =
        name.trim() || (type === 'url' ? sourceUrl.trim() : '');
      if (!resolvedName) {
        setStatusMessage('Select a file, enter a URL, or provide a document title');
        return;
      }

      const created = await documentsApi.createTextOrUrlDocument({
        name: resolvedName,
        type,
        rawContent: rawContent.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setStatusMessage(`Indexed "${created.name}" (${created.status})`);
      setName('');
      setRawContent('');
      setSourceUrl('');
      await loadDocuments();
    } catch (err) {
      setStatusMessage(
        (err as Error)?.message || 'Upload failed. Check file size and format.',
      );
    }
  }

  async function handleDelete(id: string) {
    await documentsApi.deleteDocument(id);
    if (expandedDocId === id) {
      setExpandedDocId(null);
    }
    setStatusMessage('Removed document and its vector embeddings');
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
        answer: res.reply?.content || 'Escalated to live agent inbox.',
        citations: res.reply?.citations || [],
        confidence: res.reply?.confidence ?? null,
        status: res.status,
      });
    } catch {
      setTestResult({
        question: q,
        answer: 'Could not query the assistant. Check your connection.',
        citations: [],
        confidence: null,
        status: 'bot',
      });
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <PageMotion>
      <div className="page-header">
        <div>
          <h1 className="page-title">Documents and widget</h1>
          <p className="page-subtitle">
            Upload files or URLs into your tenant knowledge base and copy your website embed snippet.
          </p>
        </div>
        <div className="sig-meta tabular">
          <span className="sig-dot sig-dot-accent" />
          <span>Tenant: {tenantKey}</span>
        </div>
      </div>

      <SpotlightCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Code2 size={16} strokeWidth={1.6} color="var(--text-secondary)" />
          <h2 className="card-title">Website widget embed code</h2>
        </div>
        <p className="card-desc">
          Paste this tag before the closing <code className="mono">&lt;/body&gt;</code> tag of your website.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 860 }}>
          <code
            className="mono"
            style={{
              flex: 1,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-hairline)',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text-primary)',
              wordBreak: 'break-all',
            }}
          >
            {embedScriptTag}
          </code>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleCopyScriptTag}
            className={copiedScript ? 'btn btn-primary' : 'btn btn-accent'}
          >
            {copiedScript ? (
              <Check size={14} strokeWidth={2} />
            ) : (
              <Copy size={14} strokeWidth={1.7} />
            )}
            <span>{copiedScript ? 'Copied' : 'Copy code'}</span>
          </motion.button>
        </div>
      </SpotlightCard>

      <div className="split-2-asym">
        <SpotlightCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={16} strokeWidth={1.6} color="var(--text-secondary)" />
            <h2 className="card-title">Add knowledge document</h2>
          </div>
          <p className="card-desc">
            Upload a PDF, Markdown, or TXT file (up to 10 MB), add a web URL, or paste text directly.
          </p>
          <form onSubmit={handleUpload} style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                border: '1px dashed var(--border-control)',
                background: 'var(--bg-page)',
              }}
            >
              <label className="field-label" htmlFor="doc-file">
                File upload (.pdf, .md, .txt)
              </label>
              <input
                id="doc-file"
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Document title"
              />
              <select
                className="select"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as 'pdf' | 'txt' | 'md' | 'url')
                }
              >
                <option value="pdf">PDF</option>
                <option value="md">Markdown</option>
                <option value="txt">Text</option>
                <option value="url">Web URL</option>
              </select>
            </div>

            <input
              type="url"
              className="input"
              value={sourceUrl}
              onChange={(e) => {
                setSourceUrl(e.target.value);
                if (e.target.value && type !== 'url') {
                  setType('url');
                }
              }}
              placeholder="Or enter a web page URL"
            />

            <textarea
              rows={4}
              className="textarea"
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="Or paste Markdown or plain text content"
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <motion.button
                type="submit"
                whileTap={{ scale: 0.97 }}
                className="btn btn-primary"
              >
                <Upload size={14} strokeWidth={1.7} />
                <span>Upload and index</span>
              </motion.button>
              <AnimatePresence>
                {statusMessage && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="sig-meta"
                  >
                    {statusMessage}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </form>
        </SpotlightCard>

        <SpotlightCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={16} strokeWidth={1.6} color="var(--text-secondary)" />
            <h2 className="card-title">Verify uploaded knowledge</h2>
          </div>
          <p className="card-desc">
            Ask a question from your newly uploaded PDF or Markdown file to confirm retrieval and citations.
          </p>
          <form onSubmit={handleAskTestQuestion} style={{ display: 'grid', gap: 12 }}>
            <input
              type="text"
              className="input"
              value={testQuestion}
              onChange={(e) => setTestQuestion(e.target.value)}
              placeholder="Ask a question from your documents"
            />
            <div>
              <motion.button
                type="submit"
                disabled={testLoading}
                whileTap={{ scale: 0.97 }}
                className="btn btn-accent"
              >
                <Search size={14} strokeWidth={1.7} />
                <span>{testLoading ? 'Searching' : 'Test retrieval'}</span>
              </motion.button>
            </div>
          </form>

          <AnimatePresence>
            {testResult && (
              <motion.div
                key={testResult.question + testResult.answer.slice(0, 12)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                style={{
                  marginTop: 16,
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {testResult.question}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: 'var(--text-primary)',
                    marginTop: 8,
                    lineHeight: 1.55,
                  }}
                >
                  {testResult.answer}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {testResult.citations.map((c, idx) => (
                    <span key={idx} className="sig-tag sig-tag-accent">
                      {c.documentName}
                    </span>
                  ))}
                  {testResult.status === 'waiting' ? (
                    <span className="sig-tag sig-tag-warning">
                      <span className="sig-dot sig-dot-waiting" />
                      <span>Escalated to inbox</span>
                    </span>
                  ) : (
                    <span className="sig-tag sig-tag-positive tabular">
                      <span className="sig-dot sig-dot-ready" />
                      <span>{Math.round((testResult.confidence ?? 0.9) * 100)}% signal</span>
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SpotlightCard>
      </div>

      <SpotlightCard>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} strokeWidth={1.6} color="var(--text-secondary)" />
            <h2 className="card-title">Indexed documents</h2>
          </div>
          <span className="sig-meta tabular">{documents.length} total</span>
        </div>

        {documents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            No documents indexed yet.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {documents.map((doc) => {
              const isExpanded = expandedDocId === doc.id;
              const docChunks = chunksByDocId[doc.id] || [];
              const isLoadingChunks = loadingChunksDocId === doc.id;

              return (
                <motion.div
                  key={doc.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                  style={{
                    borderRadius: 8,
                    border: '1px solid var(--border-hairline)',
                    overflow: 'hidden',
                    background: 'var(--bg-card)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 500, fontSize: 14 }}>
                          {doc.name}
                        </span>
                        <span className="sig-tag">{doc.type}</span>
                      </div>
                      <div className="sig-meta tabular" style={{ marginTop: 4 }}>
                        <span className="sig-dot sig-dot-ready" />
                        <span>
                          {doc.status}
                          {typeof doc.chunkCount === 'number'
                            ? ` · ${doc.chunkCount} chunk${doc.chunkCount === 1 ? '' : 's'}`
                            : ''}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => void handleToggleChunks(doc.id)}
                        className="btn btn-secondary btn-sm"
                      >
                        <motion.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                          style={{ display: 'inline-flex' }}
                        >
                          <ChevronDown size={14} strokeWidth={1.7} />
                        </motion.span>
                        <span>
                          {isExpanded ? 'Hide text' : 'View indexed text'}
                        </span>
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => void handleDelete(doc.id)}
                        className="btn btn-danger btn-sm"
                      >
                        <Trash2 size={13} strokeWidth={1.7} />
                        <span>Delete</span>
                      </motion.button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="chunk-drawer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                        style={{
                          overflow: 'hidden',
                          background: 'var(--bg-page)',
                          borderTop: '1px solid var(--border-hairline)',
                        }}
                      >
                        <div style={{ padding: 16, display: 'grid', gap: 8 }}>
                          <div className="sig-meta tabular">
                            <span>Extracted chunks ({docChunks.length})</span>
                          </div>
                          {isLoadingChunks ? (
                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                              Loading chunks
                            </div>
                          ) : docChunks.length === 0 ? (
                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                              No text chunks were extracted from this document.
                            </div>
                          ) : (
                            docChunks.map((chunk) => (
                              <div
                                key={chunk.id}
                                style={{
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--border-hairline)',
                                  borderRadius: 6,
                                  padding: 12,
                                  fontSize: 13,
                                  lineHeight: 1.55,
                                  color: 'var(--text-primary)',
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                <div
                                  className="mono"
                                  style={{
                                    fontSize: 11,
                                    color: 'var(--text-muted)',
                                    marginBottom: 4,
                                  }}
                                >
                                  Chunk {chunk.chunkIndex + 1}
                                </div>
                                {chunk.content}
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </SpotlightCard>
    </PageMotion>
  );
}
