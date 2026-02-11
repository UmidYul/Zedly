// Career Interests Management (SuperAdmin)
(function () {
    'use strict';

    const API_URL = '/api/superadmin/career/interests';

    function t(key) {
        return window.ZedlyI18n?.translate(key) || key;
    }

    window.CareerAdminManager = {
        searchTerm: '',
        interests: [],

        init: function () {
            this.loadInterests();
            this.setupEventListeners();
        },

        setupEventListeners: function () {
            const searchInput = document.getElementById('careerAdminSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value;
                    this.loadInterests();
                });
            }

            const addBtn = document.getElementById('addCareerInterestBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.showInterestModal());
            }
        },

        loadInterests: async function () {
            const container = document.getElementById('careerInterestsContainer');
            if (!container) return;

            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">${t('careerAdmin.loading')}</p>
                </div>
            `;

            try {
                const token = localStorage.getItem('access_token');
                const params = new URLSearchParams();
                if (this.searchTerm) {
                    params.set('search', this.searchTerm);
                }

                const response = await fetch(`${API_URL}?${params.toString()}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to load interests');
                }

                const data = await response.json();
                this.interests = data.interests || [];
                this.renderInterests(this.interests);
            } catch (error) {
                console.error('Load career interests error:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <p>${t('careerAdmin.loadError')}</p>
                    </div>
                `;
            }
        },

        renderInterests: function (interests) {
            const container = document.getElementById('careerInterestsContainer');
            if (!container) return;

            if (!interests.length) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-3xl);">
                        <p style="color: var(--text-secondary);">${t('careerAdmin.empty')}</p>
                    </div>
                `;
                return;
            }

            const rows = interests.map((interest) => {
                const desc = interest.description_ru || interest.description_uz || '';
                const shortDesc = desc.length > 80 ? `${desc.slice(0, 77)}...` : desc;
                return `
                    <tr>
                        <td>
                            <div class="career-admin-title">${interest.name_ru || '-'}</div>
                            <div class="career-admin-sub">${interest.name_uz || '-'}</div>
                        </td>
                        <td>${shortDesc || '-'}</td>
                        <td>
                            <span class="career-color" style="background:${interest.color || '#4A90E2'}"></span>
                        </td>
                        <td>
                            <div class="table-actions">
                                <button class="btn btn-outline" onclick="CareerAdminManager.editInterest('${interest.id}')">
                                    ${t('careerAdmin.edit')}
                                </button>
                                <button class="btn btn-outline" onclick="CareerAdminManager.deleteInterest('${interest.id}', '${(interest.name_ru || '').replace(/'/g, "\\'")}')">
                                    ${t('careerAdmin.delete')}
                                </button >
                            </div >
                        </td >
                    </tr >
                `;
            }).join('');

            container.innerHTML = `
                < div class="table-responsive" >
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${t('careerAdmin.name')}</th>
                                <th>${t('careerAdmin.description')}</th>
                                <th>${t('careerAdmin.color')}</th>
                                <th>${t('careerAdmin.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div >
                `;
        },

        showInterestModal: function (interest) {
            const isEdit = !!interest;

            const modalHtml = `
                < div class="modal-overlay" id = "careerInterestModal" >
                    <div class="modal">
                        <div class="modal-header">
                            <h2 class="modal-title">${isEdit ? t('careerAdmin.editTitle') : t('careerAdmin.addTitle')}</h2>
                            <button class="modal-close" onclick="CareerAdminManager.closeModal()">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="careerInterestForm">
                                <div class="form-group">
                                    <label class="form-label">${t('careerAdmin.nameRu')} <span class="required">*</span></label>
                                    <input class="form-input" name="name_ru" value="${interest?.name_ru || ''}" required />
                                </div>
                                <div class="form-group">
                                    <label class="form-label">${t('careerAdmin.nameUz')} <span class="required">*</span></label>
                                    <input class="form-input" name="name_uz" value="${interest?.name_uz || ''}" required />
                                </div>
                                <div class="form-group">
                                    <label class="form-label">${t('careerAdmin.descriptionRu')}</label>
                                    <textarea class="form-input" name="description_ru" rows="3">${interest?.description_ru || ''}</textarea>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">${t('careerAdmin.descriptionUz')}</label>
                                    <textarea class="form-input" name="description_uz" rows="3">${interest?.description_uz || ''}</textarea>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">${t('careerAdmin.icon')}</label>
                                        <input class="form-input" name="icon" value="${interest?.icon || ''}" />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">${t('careerAdmin.color')}</label>
                                        <input class="form-input" name="color" type="color" value="${interest?.color || '#4A90E2'}" />
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">${t('careerAdmin.subjects')}</label>
                                    <input class="form-input" name="subjects" value="${Array.isArray(interest?.subjects) ? interest.subjects.join(', ') : ''}" placeholder="${t('careerAdmin.subjectsHint')}" />
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-outline" onclick="CareerAdminManager.closeModal()">${t('careerAdmin.cancel')}</button>
                                    <button type="submit" class="btn btn-primary">${isEdit ? t('careerAdmin.save') : t('careerAdmin.create')}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div >
                `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            document.getElementById('careerInterestForm').addEventListener('submit', (event) => {
                event.preventDefault();
                this.submitInterest(interest?.id || null);
            });

            document.getElementById('careerInterestModal').addEventListener('click', (event) => {
                if (event.target.id === 'careerInterestModal') {
                    this.closeModal();
                }
            });
        },

        closeModal: function () {
            const modal = document.getElementById('careerInterestModal');
            if (modal) {
                modal.remove();
            }
        },

        editInterest: function (id) {
            const interest = this.interests.find((item) => item.id === id);
            if (!interest) {
                alert(t('careerAdmin.loadError'));
                return;
            }
            this.showInterestModal(interest);
        },

        deleteInterest: async function (id, name) {
            if (!confirm(`${t('careerAdmin.confirmDelete')} ${name || ''} `)) {
                return;
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(`${API_URL}/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to delete interest');
                }

                this.loadInterests();
            } catch (error) {
                console.error('Delete interest error:', error);
                alert(t('careerAdmin.deleteError'));
            }
        },

        submitInterest: async function (id) {
            const form = document.getElementById('careerInterestForm');
            if (!form) return;

            const formData = new FormData(form);
            const payload = {
                name_ru: formData.get('name_ru').trim(),
                name_uz: formData.get('name_uz').trim(),
                description_ru: formData.get('description_ru').trim(),
                description_uz: formData.get('description_uz').trim(),
                icon: formData.get('icon').trim(),
                color: formData.get('color').trim()
            };

            const subjectsRaw = formData.get('subjects').trim();
            if (subjectsRaw) {
                payload.subjects = subjectsRaw.split(',').map((item) => item.trim()).filter(Boolean);
            }

            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch(id ? `${API_URL}/${id}` : API_URL, {
                    method: id ? 'PUT' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || 'Save failed');
                }

                this.closeModal();
                this.loadInterests();
            } catch (error) {
                console.error('Save interest error:', error);
                alert(t('careerAdmin.saveError'));
            }
        }
    };
})();
