/**
 * AI Support Platform — Embeddable Chat Widget (FR-6)
 * - Single <script src=".../widget.js" data-tenant-key="..." data-api-url="..."></script> loader
 * - Shadow DOM encapsulation so host website CSS never collides with widget styles
 * - Plain `fetch` only (zero external runtime dependencies to keep bundle tiny)
 * - Displays grounded source citations, confidence badges, and "Ask for a human" escalation
 */
(function () {
  'use strict';

  var STORAGE_KEY_PREFIX = 'ai_support_session_';

  function getOrCreateSessionId(tenantKey) {
    var key = STORAGE_KEY_PREFIX + tenantKey;
    try {
      var existing = window.localStorage.getItem(key);
      if (existing) return existing;
      var created =
        'sess_' +
        Math.random().toString(36).slice(2, 10) +
        '_' +
        Date.now().toString(36);
      window.localStorage.setItem(key, created);
      return created;
    } catch (_e) {
      return 'sess_mem_' + Math.random().toString(36).slice(2, 12);
    }
  }

  function createWidgetStyles(primaryColor) {
    var color = primaryColor || '#2563eb';
    return [
      ':host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; color: #0f172a; }',
      '* { box-sizing: border-box; }',
      '.aisp-launcher {',
      '  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;',
      '  width: 56px; height: 56px; border-radius: 9999px; border: none;',
      '  background: ' + color + '; color: #ffffff; cursor: pointer;',
      '  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);',
      '  display: flex; align-items: center; justify-content: center;',
      '  transition: transform 0.15s ease, box-shadow 0.15s ease;',
      '}',
      '.aisp-launcher:hover { transform: scale(1.05); }',
      '.aisp-panel {',
      '  position: fixed; right: 20px; bottom: 88px; z-index: 2147483000;',
      '  width: 370px; max-width: calc(100vw - 24px); height: 540px; max-height: calc(100vh - 110px);',
      '  background: #ffffff; border-radius: 16px; overflow: hidden;',
      '  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.22); border: 1px solid #e2e8f0;',
      '  display: flex; flex-direction: column;',
      '}',
      '.aisp-panel[hidden] { display: none !important; }',
      '.aisp-header {',
      '  background: ' + color + '; color: #ffffff; padding: 14px 16px;',
      '  display: flex; align-items: center; justify-content: space-between; gap: 8px;',
      '}',
      '.aisp-header-title { font-weight: 600; font-size: 15px; margin: 0; }',
      '.aisp-header-status { font-size: 11px; opacity: 0.9; margin-top: 2px; }',
      '.aisp-human-btn {',
      '  background: rgba(255, 255, 255, 0.18); color: #ffffff;',
      '  border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 999px;',
      '  padding: 5px 10px; font-size: 11px; font-weight: 500; cursor: pointer;',
      '}',
      '.aisp-human-btn:hover { background: rgba(255, 255, 255, 0.28); }',
      '.aisp-messages {',
      '  flex: 1; overflow-y: auto; padding: 14px; background: #f8fafc;',
      '  display: flex; flex-direction: column; gap: 10px;',
      '}',
      '.aisp-msg {',
      '  max-width: 85%; padding: 10px 12px; border-radius: 12px; line-height: 1.45; word-wrap: break-word;',
      '}',
      '.aisp-msg-bot {',
      '  align-self: flex-start; background: #ffffff; color: #0f172a; border: 1px solid #e2e8f0;',
      '}',
      '.aisp-msg-customer {',
      '  align-self: flex-end; background: ' + color + '; color: #ffffff;',
      '}',
      '.aisp-citations {',
      '  margin-top: 8px; padding-top: 6px; border-top: 1px solid #f1f5f9;',
      '  display: flex; flex-wrap: wrap; gap: 4px;',
      '}',
      '.aisp-citation-pill {',
      '  font-size: 11px; background: #eff6ff; color: #1d4ed8;',
      '  border: 1px solid #bfdbfe; border-radius: 6px; padding: 2px 6px;',
      '}',
      '.aisp-confidence-pill {',
      '  font-size: 11px; background: #f0fdf4; color: #15803d;',
      '  border: 1px solid #bbf7d0; border-radius: 6px; padding: 2px 6px;',
      '}',
      '.aisp-escalated-pill {',
      '  font-size: 11px; background: #fef3c7; color: #b45309;',
      '  border: 1px solid #fde68a; border-radius: 6px; padding: 2px 6px;',
      '}',
      '.aisp-footer {',
      '  padding: 10px 12px; background: #ffffff; border-top: 1px solid #e2e8f0;',
      '  display: flex; gap: 8px;',
      '}',
      '.aisp-input {',
      '  flex: 1; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 12px;',
      '  font-size: 13px; outline: none; color: #0f172a; background: #ffffff;',
      '}',
      '.aisp-send-btn {',
      '  background: ' + color + '; color: #ffffff; border: none; border-radius: 10px;',
      '  padding: 0 14px; font-weight: 600; font-size: 13px; cursor: pointer;',
      '}',
      '@media (max-width: 480px) {',
      '  .aisp-panel { right: 12px; left: 12px; bottom: 82px; width: auto; height: 75vh; }',
      '}',
    ].join('\n');
  }

  function initAiSupportWidget(options) {
    var tenantKey = options.tenantKey;
    var apiBaseUrl = (options.apiUrl || 'http://localhost:4000').replace(/\/+$/, '');
    if (!tenantKey) {
      console.warn('[AISupportWidget] Missing data-tenant-key attribute');
      return null;
    }

    var customerSession = getOrCreateSessionId(tenantKey);
    var state = {
      open: false,
      botName: options.botName || 'AI Support',
      primaryColor: options.primaryColor || '#2563eb',
      welcomeMessage:
        options.welcomeMessage || 'Hi! How can we help you today?',
      status: 'bot',
    };

    var hostEl = document.createElement('div');
    hostEl.setAttribute('data-ai-support-widget', tenantKey);
    document.body.appendChild(hostEl);

    var shadow = hostEl.attachShadow({ mode: 'open' });
    var styleEl = document.createElement('style');
    styleEl.textContent = createWidgetStyles(state.primaryColor);
    shadow.appendChild(styleEl);

    var panel = document.createElement('section');
    panel.className = 'aisp-panel';
    panel.hidden = true;

    var header = document.createElement('header');
    header.className = 'aisp-header';

    var titleWrap = document.createElement('div');
    var titleEl = document.createElement('h3');
    titleEl.className = 'aisp-header-title';
    titleEl.textContent = state.botName;

    var statusEl = document.createElement('div');
    statusEl.className = 'aisp-header-status';
    statusEl.textContent = 'Answers grounded in official docs';
    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(statusEl);

    var humanBtn = document.createElement('button');
    humanBtn.type = 'button';
    humanBtn.className = 'aisp-human-btn';
    humanBtn.textContent = 'Talk to human';

    header.appendChild(titleWrap);
    header.appendChild(humanBtn);

    var messagesEl = document.createElement('div');
    messagesEl.className = 'aisp-messages';

    var formEl = document.createElement('form');
    formEl.className = 'aisp-footer';

    var inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'aisp-input';
    inputEl.placeholder = 'Ask a question...';
    inputEl.maxLength = 2000;

    var sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'aisp-send-btn';
    sendBtn.textContent = 'Send';

    formEl.appendChild(inputEl);
    formEl.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(messagesEl);
    panel.appendChild(formEl);

    var launcherBtn = document.createElement('button');
    launcherBtn.type = 'button';
    launcherBtn.className = 'aisp-launcher';
    launcherBtn.setAttribute('aria-label', 'Open support chat');
    launcherBtn.textContent = 'Chat';

    shadow.appendChild(panel);
    shadow.appendChild(launcherBtn);

    function appendMessage(sender, text, citations, confidence, escalated) {
      var msgEl = document.createElement('div');
      msgEl.className =
        'aisp-msg ' +
        (sender === 'customer' ? 'aisp-msg-customer' : 'aisp-msg-bot');

      var contentEl = document.createElement('div');
      contentEl.textContent = text;
      msgEl.appendChild(contentEl);

      var hasCitations = Array.isArray(citations) && citations.length > 0;
      var hasConfidence = typeof confidence === 'number';

      if (sender !== 'customer' && (hasCitations || hasConfidence || escalated)) {
        var citeWrap = document.createElement('div');
        citeWrap.className = 'aisp-citations';

        if (hasCitations) {
          for (var i = 0; i < citations.length; i++) {
            var pill = document.createElement('span');
            pill.className = 'aisp-citation-pill';
            pill.textContent = 'Source: ' + (citations[i].documentName || 'Doc');
            if (citations[i].snippet) {
              pill.title = citations[i].snippet;
            }
            citeWrap.appendChild(pill);
          }
        }

        if (escalated) {
          var escPill = document.createElement('span');
          escPill.className = 'aisp-escalated-pill';
          escPill.textContent = 'Escalated to human agent';
          citeWrap.appendChild(escPill);
        } else if (hasConfidence && confidence > 0) {
          var confPill = document.createElement('span');
          confPill.className = 'aisp-confidence-pill';
          confPill.textContent =
            'Confidence: ' + Math.round(confidence * 100) + '%';
          citeWrap.appendChild(confPill);
        }

        msgEl.appendChild(citeWrap);
      }

      messagesEl.appendChild(msgEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    appendMessage('bot', state.welcomeMessage, []);

    function setOpen(nextOpen) {
      state.open = Boolean(nextOpen);
      panel.hidden = !state.open;
      launcherBtn.textContent = state.open ? '×' : 'Chat';
      if (state.open) inputEl.focus();
    }

    launcherBtn.addEventListener('click', function () {
      setOpen(!state.open);
    });

    async function sendChatMessage(text) {
      if (!text || !text.trim()) return;
      if (!state.open) {
        setOpen(true);
      }
      var clean = text.trim();
      appendMessage('customer', clean, []);
      inputEl.value = '';

      try {
        var response = await window.fetch(
          apiBaseUrl + '/chat/' + encodeURIComponent(tenantKey) + '/messages',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerSession: customerSession,
              message: clean,
            }),
          },
        );

        if (!response.ok) {
          appendMessage(
            'bot',
            'Unable to reach support right now. Please try again shortly.',
            [],
          );
          return;
        }

        var data = await response.json();
        var isEscalated =
          data.status === 'waiting' || data.status === 'human';
        if (isEscalated) {
          statusEl.textContent = 'Escalated to live support agent';
        }
        if (data.reply && data.reply.content) {
          appendMessage(
            'bot',
            data.reply.content,
            data.reply.citations || [],
            data.reply.confidence,
            isEscalated,
          );
        }
      } catch (_err) {
        appendMessage(
          'bot',
          'Connection error. Please check your network and try again.',
          [],
        );
      }
    }

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      sendChatMessage(inputEl.value);
    });

    humanBtn.addEventListener('click', function () {
      sendChatMessage('Please connect me with a human support agent.');
    });

    // Fetch remote tenant widget customization (botName, primaryColor, welcomeMessage)
    if (typeof window.fetch === 'function') {
      window
        .fetch(
          apiBaseUrl + '/chat/' + encodeURIComponent(tenantKey) + '/config',
        )
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (cfg) {
          if (!cfg || !cfg.widgetConfig) return;
          if (cfg.widgetConfig.botName) {
            titleEl.textContent = cfg.widgetConfig.botName;
          }
          if (cfg.widgetConfig.primaryColor) {
            styleEl.textContent = createWidgetStyles(
              cfg.widgetConfig.primaryColor,
            );
          }
          if (
            cfg.widgetConfig.welcomeMessage &&
            messagesEl.children.length === 1
          ) {
            messagesEl.children[0].firstChild.textContent =
              cfg.widgetConfig.welcomeMessage;
          }
        })
        .catch(function () {
          // Keep default appearance when offline
        });
    }

    var instance = {
      hostEl: hostEl,
      shadowRoot: shadow,
      open: function () {
        setOpen(true);
      },
      sendChatMessage: sendChatMessage,
    };
    if (typeof window !== 'undefined' && window.AISupportWidget) {
      window.AISupportWidget.activeInstance = instance;
    }
    return instance;
  }

  if (typeof window !== 'undefined') {
    window.AISupportWidget = { init: initAiSupportWidget };

    var currentScript =
      document.currentScript ||
      document.querySelector('script[data-tenant-key]');
    if (currentScript) {
      var tenantKey = currentScript.getAttribute('data-tenant-key');
      var apiUrl = currentScript.getAttribute('data-api-url');
      if (tenantKey) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function () {
            initAiSupportWidget({ tenantKey: tenantKey, apiUrl: apiUrl });
          });
        } else {
          initAiSupportWidget({ tenantKey: tenantKey, apiUrl: apiUrl });
        }
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initAiSupportWidget: initAiSupportWidget,
      createWidgetStyles: createWidgetStyles,
    };
  }
})();
