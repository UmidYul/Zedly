// Messages page scaffold (API-first with mock fallback)
(function () {
    'use strict';

    const U = window.ZedlyDiaryUtils;
    const state = {
        integrationStatus: 'mock',
        endpoint: '',
        conversations: []
    };

    function getMockData() {
        return {
            conversations: [
                { id: 'c1', title: 'Class 7A - Mathematics', last_message: 'Homework updated', unread_count: 2, updated_at: '2026-03-01T12:25:00Z' },
                { id: 'c2', title: 'Parent: Karimov A.', last_message: 'Question about grades', unread_count: 0, updated_at: '2026-03-01T10:15:00Z' },
                { id: 'c3', title: 'School admin announcements', last_message: 'Schedule changes', unread_count: 1, updated_at: '2026-02-28T16:45:00Z' }
            ]
        };
    }

    async function loadData() {
        const query = document.getElementById('messagesSearchInput')?.value?.trim() || '';
        const endpoint = `/api/v1/messages/conversations?search=${encodeURIComponent(query)}`;
        const result = await U.fetchWithFallback(endpoint, getMockData, { method: 'GET' });
        state.integrationStatus = result.integrationStatus;
        state.endpoint = result.endpoint;
        state.conversations = Array.isArray(result.data?.conversations) ? result.data.conversations : [];
    }

    function renderList() {
        if (!state.conversations.length) {
            return U.renderState('empty', 'No conversations yet');
        }

        return `
            <div class="table-responsive mobile-stack-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Conversation</th>
                            <th>Last message</th>
                            <th>Updated</th>
                            <th>Unread</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.conversations.map((row) => `
                            <tr>
                                <td>${U.escapeHtml(row.title || '-')}</td>
                                <td>${U.escapeHtml(row.last_message || '-')}</td>
                                <td>${U.escapeHtml(new Date(row.updated_at).toLocaleString())}</td>
                                <td>${U.escapeHtml(row.unread_count ?? 0)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function render() {
        const root = document.getElementById('messagesRoot');
        if (!root) return;
        root.innerHTML = U.renderState('loading', 'Loading conversations...');
        await loadData();
        root.innerHTML = `
            ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
            ${renderList()}
        `;
    }

    function bindControls() {
        const searchInput = document.getElementById('messagesSearchInput');
        const newDialogBtn = document.getElementById('messagesNewDialogBtn');
        if (searchInput) {
            searchInput.oninput = () => render();
        }
        if (newDialogBtn) {
            newDialogBtn.onclick = () => {
                state.conversations = [
                    {
                        id: `new-${Date.now()}`,
                        title: 'New conversation',
                        last_message: 'Created from UI scaffold',
                        unread_count: 0,
                        updated_at: new Date().toISOString()
                    },
                    ...state.conversations
                ];
                const root = document.getElementById('messagesRoot');
                if (root) {
                    root.innerHTML = `
                        ${U.renderIntegrationBadge(state.integrationStatus, state.endpoint)}
                        ${renderList()}
                    `;
                }
            };
        }
    }

    function init() {
        if (!window.ZedlyDiaryUtils) return;
        bindControls();
        render().catch((error) => {
            const root = document.getElementById('messagesRoot');
            if (root) root.innerHTML = U.renderState('error', error.message || 'Failed to load conversations');
        });
    }

    window.MessagesPage = { init };
})();
