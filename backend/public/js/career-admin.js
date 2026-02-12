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
