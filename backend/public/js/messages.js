// Messages page (rich scaffold, API-first + mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        conversations: [],
        messagesByConversation: {},
        selectedConversationId: null,
        search: ''
    };

    function nowIso() {
        return new Date().toISOString();
    }

    function mockConversations() {
        return [
            { id: 'c1', title: 'Class 7A · Mathematics', last_message: 'Homework has been updated', unread_count: 2, updated_at: '2026-03-01T12:25:00Z' },
            { id: 'c2', title: 'Parent: Karimov A.', last_message: 'Question about marks', unread_count: 0, updated_at: '2026-03-01T10:15:00Z' },
            { id: 'c3', title: 'School announcements', last_message: 'Schedule changes tomorrow', unread_count: 1, updated_at: '2026-02-28T16:45:00Z' }
        ];
    }

    function mockMessages() {
        return {
            c1: [
                { id: 'm1', from_me: false, text: 'Please check homework #3.', created_at: '2026-03-01T09:20:00Z' },
                { id: 'm2', from_me: true, text: 'Done, I also added reminders.', created_at: '2026-03-01T09:28:00Z' }
            ],
            c2: [
                { id: 'm3', from_me: false, text: 'Can we discuss latest grade?', created_at: '2026-03-01T10:05:00Z' },
                { id: 'm4', from_me: true, text: 'Yes, we can schedule a short call.', created_at: '2026-03-01T10:20:00Z' }
            ],
            c3: [
                { id: 'm5', from_me: false, text: 'School-wide schedule update was published.', created_at: '2026-02-28T16:45:00Z' }
            ]
        };
    }

    function ensureSelection() {
        if (!state.selectedConversationId && state.conversations.length) {
            state.selectedConversationId = state.conversations[0].id;
        }
    }

    async function loadConversations() {
        const endpoint = `/api/v1/messages/conversations?search=${encodeURIComponent(state.search)}`;
        const result = await U.fetchWithFallback(endpoint, () => ({ conversations: mockConversations() }), { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.conversations = Array.isArray(result.data?.conversations) ? result.data.conversations : [];
        if (state.integrationStatus === 'mock' && Object.keys(state.messagesByConversation).length === 0) {
            state.messagesByConversation = mockMessages();
        }
        ensureSelection();
    }

    async function loadMessages(conversationId) {
        if (!conversationId) return;
        const endpoint = `/api/v1/messages/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`;
        const result = await U.fetchWithFallback(endpoint, () => ({ messages: state.messagesByConversation[conversationId] || [] }), { method: 'GET' });
        if (!Array.isArray(result.data?.messages)) return;
        state.messagesByConversation[conversationId] = result.data.messages;
    }

    function renderConversationList() {
        if (!state.conversations.length) return U.renderState('empty', 'No conversations found');
        return `
            <div class="diary-list">
                ${state.conversations.map((conv) => `
                    <article class="diary-list-item ${String(conv.id) === String(state.selectedConversationId) ? 'active' : ''}" data-conv-id="${U.escapeHtml(conv.id)}">
                        <h4>${U.escapeHtml(conv.title || 'Untitled')}</h4>
                        <p>${U.escapeHtml(conv.last_message || 'No messages')}</p>
                        <div style="display:flex; justify-content:space-between; margin-top:8px; align-items:center;">
                            <small>${U.escapeHtml(new Date(conv.updated_at).toLocaleString())}</small>
                            ${Number(conv.unread_count || 0) > 0 ? `<span class="diary-badge diary-badge-warning">${U.escapeHtml(conv.unread_count)}</span>` : ''}
                        </div>
                    </article>
                `).join('')}
            </div>
        `;
    }

    function renderChat() {
        const conv = state.conversations.find((item) => String(item.id) === String(state.selectedConversationId));
        if (!conv) return U.renderState('empty', 'Select a conversation');
        const messages = state.messagesByConversation[conv.id] || [];
        return `
            <div class="diary-chat-box">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0;">${U.escapeHtml(conv.title)}</h3>
                        <p style="margin:4px 0 0;">${U.escapeHtml(conv.last_message || 'No last message')}</p>
                    </div>
                    <span class="diary-badge diary-badge-info">${messages.length} msgs</span>
                </div>
                <div class="diary-chat-feed" id="messagesFeed">
                    ${messages.map((msg) => `
                        <div class="diary-msg ${msg.from_me ? 'mine' : 'theirs'}">
                            ${U.escapeHtml(msg.text || '')}
                            <small>${U.escapeHtml(new Date(msg.created_at).toLocaleString())}</small>
                        </div>
                    `).join('')}
                </div>
                <div class="diary-chat-input">
                    <input id="messagesComposerInput" class="form-input" type="text" placeholder="Type a message">
                    <button class="btn btn-primary" id="messagesSendBtn" type="button">Send</button>
                </div>
            </div>
        `;
    }

    function render() {
        const root = document.getElementById('messagesRoot');
        if (!root) return;
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            <div class="diary-split">
                <div class="diary-panel">
                    <h3>Conversations</h3>
                    ${renderConversationList()}
                </div>
                ${renderChat()}
            </div>
        `;
    }

    async function refreshAndRender() {
        await loadConversations();
        if (state.selectedConversationId) await loadMessages(state.selectedConversationId);
        render();
    }

    function sendMessage() {
        const input = document.getElementById('messagesComposerInput');
        if (!input) return;
        const text = String(input.value || '').trim();
        if (!text || !state.selectedConversationId) return;
        const list = state.messagesByConversation[state.selectedConversationId] || [];
        list.push({ id: `m-${Date.now()}`, from_me: true, text, created_at: nowIso() });
        state.messagesByConversation[state.selectedConversationId] = list;

        state.conversations = state.conversations.map((conv) => {
            if (String(conv.id) !== String(state.selectedConversationId)) return conv;
            return { ...conv, last_message: text, updated_at: nowIso() };
        });
        input.value = '';
        render();
    }

    function bindEvents() {
        const searchInput = document.getElementById('messagesSearchInput');
        const newDialogBtn = document.getElementById('messagesNewDialogBtn');
        const root = document.getElementById('messagesRoot');

        if (searchInput) {
            searchInput.oninput = async () => {
                state.search = searchInput.value || '';
                await refreshAndRender();
            };
        }

        if (newDialogBtn) {
            newDialogBtn.onclick = () => {
                const id = `c-${Date.now()}`;
                state.conversations = [
                    { id, title: 'New dialog', last_message: 'Conversation created', unread_count: 0, updated_at: nowIso() },
                    ...state.conversations
                ];
                state.messagesByConversation[id] = [
                    { id: `m-${Date.now()}`, from_me: true, text: 'Hello! This is a new thread.', created_at: nowIso() }
                ];
                state.selectedConversationId = id;
                render();
            };
        }

        if (root) {
            root.onclick = async (event) => {
                const convItem = event.target.closest('[data-conv-id]');
                if (convItem) {
                    const id = convItem.getAttribute('data-conv-id');
                    if (id && String(id) !== String(state.selectedConversationId)) {
                        state.selectedConversationId = id;
                        await loadMessages(id);
                        render();
                    }
                    return;
                }

                const sendBtn = event.target.closest('#messagesSendBtn');
                if (sendBtn) {
                    sendMessage();
                }
            };

            root.onkeydown = (event) => {
                if (event.key === 'Enter' && event.target && event.target.id === 'messagesComposerInput') {
                    event.preventDefault();
                    sendMessage();
                }
            };
        }
    }

    async function init() {
        if (!U) return;
        const root = document.getElementById('messagesRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading conversations...');
        bindEvents();
        try {
            await refreshAndRender();
        } catch (error) {
            root.innerHTML = U.renderState('error', error.message || 'Failed to load messages');
        }
    }

    window.MessagesPage = { init };
})();
