'use client';

import React, { useEffect, useState } from 'react';
import {
  DocumentItem,
  documentsApi,
  getStoredTenantInfo,
} from '../../lib/api-client';

/**
 * Document Management & Widget Embed Script Page (FR-2 & FR-6):
 * - Owner can upload PDF, TXT, Markdown files via file picker (max 10 MB), add web page URLs, or paste text
 * - Shows status for each document: Uploaded, Processing, Ready, Failed
 * - Deleting a document also deletes its pgvector embeddings
 * - Provides the 1-line <script> widget snippet
 */
export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [tenantKey, setTenantKey] = useState<string>('oil-supply');
  const [name, setName] = useState('');
  const [type, setType] = useState<'pdf' | 'txt' | 'md' | 'url'>('pdf');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawContent, setRawContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function loadDocuments() {
    try {
      const list = await documentsApi.listDocuments();
      setDocuments(list);
      setTenantKey(getStoredTenantInfo().tenantKey);
    } catch {
      // Keep local list when offline
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
          setStatusMessage('Error: File exceeds the 10 MB limit (FR-2).');
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
    setStatusMessage('Deleted document and removed its pgvector embeddings.');
    await loadDocuments();
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>
        Knowledge Base Documents &amp; Embeddable Widget
      </h1>

      {/* One-Script-Tag Embed Box (FR-6) */}
      <section
        style={{
          background: '#0f172a',
          color: '#f8fafc',
          padding: 20,
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
          Embeddable Chat Widget Script Tag (FR-6 — Paste into your website)
        </div>
        <code
          style={{
            display: 'block',
            background: '#1e293b',
            padding: 12,
            borderRadius: 8,
            fontSize: 13,
            color: '#38bdf8',
          }}
        >
          {`<script src="http://localhost:4000/widget.js" data-tenant-key="${tenantKey}" async></script>`}
        </code>
      </section>

      {/* Document Upload Form (FR-2: File Picker for PDF/TXT/MD max 10 MB + URL field + Text) */}
      <section
        style={{
          background: '#ffffff',
          padding: 20,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>
          Upload Document File (PDF, TXT, Markdown max 10 MB) or Add Web Page URL (FR-2)
        </h2>
        <form
          onSubmit={handleUpload}
          style={{ display: 'grid', gap: 12, maxWidth: 680 }}
        >
          {/* File Picker for PDF, TXT, Markdown */}
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

          {/* URL Field (always accessible or highlighted when URL is selected) */}
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
            Upload &amp; Index in pgvector
          </button>
          {statusMessage && (
            <div style={{ fontSize: 13, color: '#0284c7', fontWeight: 500 }}>
              {statusMessage}
            </div>
          )}
        </form>
      </section>

      {/* Document Status List */}
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
            {documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <strong>{doc.name}</strong>{' '}
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    ({doc.type.toUpperCase()})
                  </span>
                  <div style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>
                    Status: {doc.status}
                  </div>
                </div>
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
                  Delete Document &amp; Embeddings
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
