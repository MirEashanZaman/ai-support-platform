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
    var color = primaryColor || '#1d4ed8';
    return [
      ':host { all: initial; font-family: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; color: #171717; }',
      '* { box-sizing: border-box; }',
      '.aisp-launcher {',
      '  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;',
      '  height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.14);',
      '  background: ' + color + '; color: #ffffff; cursor: pointer;',
      '  font-size: 13px; font-weight: 500;',
      '  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);',
      '  display: flex; align-items: center; justify-content: center; gap: 8px;',
      '  transition: background-color 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.22, 1, 0.36, 1);',
      '}',
      '.aisp-launcher:active { transform: scale(0.97); }',
      '.aisp-panel {',
      '  position: fixed; right: 20px; bottom: 76px; z-index: 2147483000;',
      '  width: 368px; max-width: calc(100vw - 24px); height: 528px; max-height: calc(100vh - 104px);',
      '  background: #ffffff; border-radius: 16px; overflow: hidden;',
      '  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); border: 1px solid rgba(23, 23, 23, 0.1);',
      '  display: flex; flex-direction: column;',
      '}',
      '.aisp-panel[hidden] { display: none !important; }',
      '.aisp-header {',
      '  background: #141415; color: #ededed; padding: 16px;',
      '  border-bottom: 1px solid rgba(237, 237, 237, 0.08);',
      '  display: flex; align-items: center; justify-content: space-between; gap: 12px;',
      '}',
      '.aisp-header-title { font-weight: 500; font-size: 15px; margin: 0; line-height: 1.25; }',
      '.aisp-header-status { font-size: 12px; color: #a1a1a6; margin-top: 2px; }',
      '.aisp-human-btn {',
      '  background: #232325; color: #ededed;',
      '  border: 1px solid rgba(237, 237, 237, 0.14); border-radius: 8px;',
      '  height: 32px; padding: 0 12px; font-size: 12px; font-weight: 500; cursor: pointer;',
      '  transition: background-color 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.22, 1, 0.36, 1);',
      '}',
      '.aisp-human-btn:hover { background: #2d2d30; }',
      '.aisp-human-btn:active { transform: scale(0.97); }',
      '.aisp-messages {',
      '  flex: 1; overflow-y: auto; padding: 16px; background: #fafafa;',
      '  display: flex; flex-direction: column; gap: 12px;',
      '}',
      '.aisp-msg {',
      '  max-width: 84%; padding: 12px; border-radius: 10px; line-height: 1.5; word-wrap: break-word; font-size: 13px;',
      '}',
      '.aisp-msg-bot {',
      '  align-self: flex-start; background: #ffffff; color: #171717; border: 1px solid rgba(23, 23, 23, 0.09);',
      '}',
      '.aisp-msg-customer {',
      '  align-self: flex-end; background: ' + color + '; color: #ffffff;',
      '}',
      '.aisp-citations {',
      '  margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(23, 23, 23, 0.08);',
      '  display: flex; flex-wrap: wrap; gap: 6px;',
      '}',
      '.aisp-citation-pill {',
      '  font-family: "IBM Plex Mono", ui-monospace, monospace;',
      '  font-size: 11px; background: rgba(29, 78, 216, 0.08); color: #1d4ed8;',
      '  border: 1px solid rgba(29, 78, 216, 0.18); border-radius: 6px; padding: 2px 8px;',
      '}',
      '.aisp-confidence-pill {',
      '  font-family: "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums;',
      '  font-size: 11px; background: rgba(22, 163, 74, 0.09); color: #16a34a;',
      '  border: 1px solid rgba(22, 163, 74, 0.2); border-radius: 6px; padding: 2px 8px;',
      '}',
      '.aisp-escalated-pill {',
      '  font-family: "IBM Plex Mono", ui-monospace, monospace;',
      '  font-size: 11px; background: rgba(180, 83, 9, 0.09); color: #b45309;',
      '  border: 1px solid rgba(180, 83, 9, 0.2); border-radius: 6px; padding: 2px 8px;',
      '}',
      '.aisp-footer {',
      '  padding: 12px; background: #ffffff; border-top: 1px solid rgba(23, 23, 23, 0.09);',
      '  display: flex; gap: 8px;',
      '}',
      '.aisp-input {',
      '  flex: 1; height: 36px; border: 1px solid rgba(23, 23, 23, 0.16); border-radius: 8px; padding: 0 12px;',
      '  font-size: 13px; color: #171717; background: #ffffff;',
      '}',
      '.aisp-input:focus-visible { outline: 2px solid ' + color + '; outline-offset: 1px; }',
      '.aisp-send-btn {',
      '  height: 36px; background: #171717; color: #ffffff; border: none; border-radius: 8px;',
      '  padding: 0 16px; font-weight: 500; font-size: 13px; cursor: pointer;',
      '  transition: background-color 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.22, 1, 0.36, 1);',
      '}',
      '.aisp-send-btn:hover { background: #2b2b2b; }',
      '.aisp-send-btn:active { transform: scale(0.97); }',
      '@media (max-width: 480px) {',
      '  .aisp-panel { right: 12px; left: 12px; bottom: 72px; width: auto; height: 75vh; }',
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
      botName: options.botName || 'Support Assistant',
      primaryColor: options.primaryColor || '#1d4ed8',
      welcomeMessage:
        options.welcomeMessage || 'Ask a question about our documents and policies.',
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
    inputEl.placeholder = 'Ask a question';
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
