(function () {
    'use strict';

    const API_URL = '/api';
    const SCALE_ITEMS = [1, 2, 3, 4, 5];

    const state = {
        questions: [],
        answers: {},
        currentIndex: 0,
        latestResult: null,
        radarChart: null,
        radarThemeObserver: null
    };

    function getLang() {
        return window.ZedlyI18n?.getCurrentLang?.() || 'ru';
    }

    function getLocale() {
        return getLang() === 'uz' ? 'uz-UZ' : 'ru-RU';
    }

    function t(key, fallback, params) {
        const translated = window.ZedlyI18n?.translate?.(key, params);
        if (!translated || translated === key) {
            return fallback || key;
        }
        return translated;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function detectIconKey(value) {
        const text = String(value || '').toLowerCase();
        if (text.includes('it') || text.includes('информ') || text.includes('програм')) return 'code';
        if (text.includes('наук') || text.includes('биолог') || text.includes('хим') || text.includes('физ')) return 'flask';
        if (text.includes('инжен') || text.includes('черч')) return 'gear';
        if (text.includes('медиц') || text.includes('здоров')) return 'heart';
        if (text.includes('бизнес') || text.includes('эконом') || text.includes('предприним')) return 'briefcase';
        if (text.includes('право') || text.includes('закон') || text.includes('обществ')) return 'scale';
        if (text.includes('язык') || text.includes('литер') || text.includes('гуманитар')) return 'book';
        if (text.includes('искус') || text.includes('дизайн') || text.includes('музык')) return 'palette';
        if (text.includes('психол') || text.includes('образован') || text.includes('воспит')) return 'users';
        if (text.includes('спорт') || text.includes('физичес')) return 'activity';
        return 'target';
    }

    function iconSvg(key) {
        const icons = {
            code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8 4 12l4 4M16 8l4 4-4 4M14 4l-4 16"/></svg>',
            flask: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 17l-5-9V2M8 14h8"/></svg>',
            gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 8 1 1.7 2 .5-.5 2L16 14l-1.5 1.8.5 2-2 .5L12 20l-1-1.7-2-.5.5-2L8 14l1.5-1.8-.5-2 2-.5L12 8z"/><circle cx="12" cy="14" r="2.5"/></svg>',
            heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.6-9-9.3C1.8 8.6 4 5.5 7.3 5.2A5.1 5.1 0 0 1 12 7.6a5.1 5.1 0 0 1 4.7-2.4C20 5.5 22.2 8.6 21 11.7 19 16.4 12 21 12 21z"/></svg>',
            briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>',
            scale: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v16M7 7h10M5 7 3 11h4L5 7zm14 0-2 4h4l-2-4zM8 21h8"/></svg>',
            book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v17H6a2 2 0 0 0-2 2V5z"/><path d="M18 3v17"/></svg>',
            palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2.3 2.3 0 0 0 0-4.6H12a3 3 0 0 1 0-6h2a4 4 0 0 0 4-4A3.5 3.5 0 0 0 14.5 3H12z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>',
            users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19a6 6 0 0 1 12 0M14 19a4 4 0 0 1 8 0"/></svg>',
            activity: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.5-5 5 10 2.5-5H21"/></svg>',
            target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></svg>'
        };
        return icons[key] || icons.target;
    }

    function truncateLabel(value, maxLen = 22) {
        const text = String(value || '').trim();
        if (!text) return '-';
        return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
    }

    function wrapLabel(value, maxLineLen = 14) {
        const words = String(value || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return ['-'];
        const lines = [];
        let current = '';
        words.forEach((word) => {
            const next = current ? `${current} ${word}` : word;
            if (next.length <= maxLineLen) {
                current = next;
            } else {
                if (current) lines.push(current);
                current = word;
            }
        });
        if (current) lines.push(current);
        return lines.slice(0, 3).map((line, idx, arr) => {
            if (idx === arr.length - 1 && line.length > maxLineLen) {
                return truncateLabel(line, maxLineLen);
            }
            return line;
        });
    }

    function getCareerRadarPalette() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            return {
                borderColor: 'rgba(2, 132, 199, 1)',
                backgroundColor: 'rgba(14, 116, 144, 0.20)',
                pointBackgroundColor: 'rgba(3, 105, 161, 1)',
                pointBorderColor: '#e2f2ff',
                ticksColor: '#334155',
                ticksBackdropColor: 'rgba(248, 250, 252, 0.85)',
                pointLabelsColor: '#0f172a',
                gridColor: 'rgba(100, 116, 139, 0.35)',
                angleLinesColor: 'rgba(100, 116, 139, 0.30)',
                legendColor: '#0f172a',
                tooltipBackground: 'rgba(255, 255, 255, 0.96)',
                tooltipTitleColor: '#0f172a',
                tooltipBodyColor: '#1e293b',
                tooltipBorderColor: 'rgba(15, 23, 42, 0.15)'
            };
        }

        return {
            borderColor: 'rgba(56, 189, 248, 1)',
            backgroundColor: 'rgba(59, 130, 246, 0.24)',
            pointBackgroundColor: 'rgba(14, 165, 233, 1)',
            pointBorderColor: '#0f172a',
            ticksColor: '#93c5fd',
            ticksBackdropColor: 'rgba(15, 23, 42, 0.72)',
            pointLabelsColor: '#dbeafe',
            gridColor: 'rgba(148, 163, 184, 0.25)',
            angleLinesColor: 'rgba(148, 163, 184, 0.22)',
            legendColor: '#dbeafe',
            tooltipBackground: 'rgba(15, 23, 42, 0.95)',
            tooltipTitleColor: '#e2e8f0',
            tooltipBodyColor: '#bfdbfe',
            tooltipBorderColor: 'rgba(96, 165, 250, 0.35)'
        };
    }

    function applyRadarTheme(chart, palette) {
        if (!chart) return;

        const dataset = chart.data?.datasets?.[0];
        if (dataset) {
            dataset.borderColor = palette.borderColor;
            dataset.backgroundColor = palette.backgroundColor;
            dataset.pointBackgroundColor = palette.pointBackgroundColor;
            dataset.pointBorderColor = palette.pointBorderColor;
            dataset.pointHoverBackgroundColor = palette.pointBackgroundColor;
            dataset.pointHoverBorderColor = palette.pointBorderColor;
        }

        const radarScale = chart.options?.scales?.r;
        if (radarScale?.ticks) {
            radarScale.ticks.color = palette.ticksColor;
            radarScale.ticks.backdropColor = palette.ticksBackdropColor;
        }
        if (radarScale?.pointLabels) {
            radarScale.pointLabels.color = palette.pointLabelsColor;
        }
        if (radarScale?.grid) {
            radarScale.grid.color = palette.gridColor;
        }
        if (radarScale?.angleLines) {
            radarScale.angleLines.color = palette.angleLinesColor;
        }

        const legendLabels = chart.options?.plugins?.legend?.labels;
        if (legendLabels) {
            legendLabels.color = palette.legendColor;
        }

        const tooltip = chart.options?.plugins?.tooltip;
        if (tooltip) {
            tooltip.backgroundColor = palette.tooltipBackground;
            tooltip.titleColor = palette.tooltipTitleColor;
            tooltip.bodyColor = palette.tooltipBodyColor;
            tooltip.borderColor = palette.tooltipBorderColor;
        }
    }

    function bindRadarThemeObserver() {
        if (state.radarThemeObserver) return;
        state.radarThemeObserver = new MutationObserver(() => {
            if (!state.radarChart) return;
            applyRadarTheme(state.radarChart, getCareerRadarPalette());
            state.radarChart.update('none');
        });
        state.radarThemeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    function getAuthToken() {
        return window.ZedlyAuth?.getAuthToken?.() || 'cookie-session';
    }

    function getCookie(name) {
        const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function ensureCsrfToken() {
        const existing = getCookie('zedly_csrf_token');
        if (existing) return existing;
        try {
            const response = await fetch('/api/auth/csrf-token', {
                method: 'GET',
                credentials: 'include',
                headers: { Authorization: `Bearer ${getAuthToken()}` }
            });
            if (!response.ok) return '';
            const data = await response.json().catch(() => ({}));
            return data?.csrf_token || getCookie('zedly_csrf_token') || '';
        } catch (_) {
            return '';
        }
    }

    async function apiFetch(url, options = {}) {
        const method = String(options.method || 'GET').toUpperCase();
        const headers = {
            Authorization: `Bearer ${getAuthToken()}`,
            ...(options.headers || {})
        };

        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const csrf = await ensureCsrfToken();
            if (csrf) headers['X-CSRF-Token'] = csrf;
        }

        return fetch(url, {
            credentials: 'include',
            ...options,
            method,
            headers
        });
    }

    async function ensureChartJs() {
        if (window.Chart) return;
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function startCareerTestPage() {
        window.location.href = '/career-test.html';
    }

    function formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString(getLocale(), {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function inferInterestDescription(interest) {
        const lang = getLang();
        const raw = lang === 'uz'
            ? (interest.description_uz || interest.name_uz || interest.name_ru || '')
            : (interest.description_ru || interest.name_ru || interest.name_uz || '');
        const trimmed = String(raw || '').trim();
        if (!trimmed) return t('career.interestFallback', 'Сфера с высоким потенциалом развития.');
        return trimmed.length > 100 ? `${trimmed.slice(0, 97)}...` : trimmed;
    }

    function inferSubjectHint(subjectName) {
        const lower = String(subjectName || '').toLowerCase();
        if (lower.includes('матем') || lower.includes('algebra') || lower.includes('геометр')) {
            return t('career.subjectHint.math', 'Развивает аналитическое мышление и решение задач.');
        }
        if (lower.includes('физ')) return t('career.subjectHint.physics', 'Помогает понимать технологические и инженерные процессы.');
        if (lower.includes('информ') || lower.includes('програм') || lower.includes('it')) {
            return t('career.subjectHint.informatics', 'Формирует цифровые и программные навыки.');
        }
        if (lower.includes('биолог')) return t('career.subjectHint.biology', 'Укрепляет понимание живых систем и медицины.');
        if (lower.includes('хими')) return t('career.subjectHint.chemistry', 'Полезна для научных и медицинских направлений.');
        if (lower.includes('истор')) return t('career.subjectHint.history', 'Учит анализировать процессы и причинно-следственные связи.');
        return t('career.subjectHint.language', 'Развивает коммуникацию и академическое письмо.');
    }

    function parseRecommendedSubjects(result) {
        const lang = getLang();
        const src = result?.recommended_subjects;
        if (Array.isArray(src)) return src;
        if (src && typeof src === 'object') {
            const list = lang === 'uz' ? src.uz : src.ru;
            return Array.isArray(list) ? list : [];
        }
        return [];
    }

    function getResultInterests(result) {
        if (Array.isArray(result?.interests)) return result.interests;
        const scores = result?.interests_scores || {};
        return Object.keys(scores).map((name) => ({
            name_ru: name,
            name_uz: name,
            score: Number(scores[name] || 0)
        }));
    }

    async function renderDashboardCharts(latestResult) {
        const radarEl = document.getElementById('careerRadarChart');
        const empty = document.getElementById('careerResultsEmpty');
        if (!radarEl || !empty) return;

        const interests = getResultInterests(latestResult);
        if (!interests.length) {
            empty.style.display = 'grid';
            radarEl.style.display = 'none';
            return;
        }

        empty.style.display = 'none';
        radarEl.style.display = 'block';

        await ensureChartJs();

        if (state.radarChart) state.radarChart.destroy();
        const labels = interests.map((it) => {
            const raw = getLang() === 'uz' ? (it.name_uz || it.name_ru || '-') : (it.name_ru || it.name_uz || '-');
            return wrapLabel(raw, 13);
        });
        const values = interests.map((it) => Number(it.score || 0));
        const palette = getCareerRadarPalette();
        state.radarChart = new Chart(radarEl, {
            type: 'radar',
            data: {
                labels,
                datasets: [{
                    label: t('career.chartLabel', 'Уровень интереса'),
                    data: values,
                    borderColor: palette.borderColor,
                    backgroundColor: palette.backgroundColor,
                    pointBackgroundColor: palette.pointBackgroundColor,
                    pointBorderColor: palette.pointBorderColor,
                    borderWidth: 2,
                    pointRadius: 2.5,
                    pointHoverRadius: 4,
                    pointBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    intersect: false
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            color: palette.ticksColor,
                            showLabelBackdrop: true,
                            backdropColor: palette.ticksBackdropColor,
                            backdropPadding: 4,
                            z: 1,
                            font: {
                                size: 11,
                                family: 'Manrope, Inter, Segoe UI, Arial, sans-serif',
                                weight: '600'
                            }
                        },
                        pointLabels: {
                            color: palette.pointLabelsColor,
                            font: {
                                size: 11,
                                family: 'Manrope, Inter, Segoe UI, Arial, sans-serif',
                                weight: '500'
                            }
                        },
                        grid: {
                            color: palette.gridColor
                        },
                        angleLines: {
                            color: palette.angleLinesColor
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: palette.legendColor,
                            boxWidth: 28,
                            boxHeight: 12,
                            padding: 12,
                            font: {
                                size: 12,
                                family: 'Manrope, Inter, Segoe UI, Arial, sans-serif',
                                weight: '600'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: palette.tooltipBackground,
                        titleColor: palette.tooltipTitleColor,
                        bodyColor: palette.tooltipBodyColor,
                        borderColor: palette.tooltipBorderColor,
                        borderWidth: 1,
                        padding: 10
                    }
                }
            }
        });
        bindRadarThemeObserver();
    }

    function renderDashboardCards(latestResult) {
        const topWrap = document.getElementById('careerTopInterestsCards');
        const subjWrap = document.getElementById('careerRecommendedCards');
        const reliabilityEl = document.getElementById('careerReliabilityBadge');
        const lastDateEl = document.getElementById('careerLastDate');
        if (!topWrap || !subjWrap || !reliabilityEl || !lastDateEl) return;

        const interests = getResultInterests(latestResult)
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
            .slice(0, 3);

        topWrap.innerHTML = interests.length
            ? interests.map((interest, idx) => {
                const title = getLang() === 'uz' ? (interest.name_uz || interest.name_ru || '-') : (interest.name_ru || interest.name_uz || '-');
                const icon = iconSvg(detectIconKey(title));
                return `
                    <article class="career-top-item">
                        <h4><span class="career-icon-badge" aria-hidden="true">${icon}</span>${escapeHtml(title)}</h4>
                        <p>${escapeHtml(inferInterestDescription(interest))}</p>
                        <div class="career-top-score">${Math.round(Number(interest.score || 0))}%</div>
                    </article>
                `;
            }).join('')
            : `<article class="career-top-item"><p>${escapeHtml(t('career.results.noInterests', 'Пока нет данных по интересам.'))}</p></article>`;

        const subjects = parseRecommendedSubjects(latestResult);
        subjWrap.innerHTML = subjects.length
            ? subjects.map((subject) => `
                <article class="career-subject-item">
                    <h4><span class="career-icon-badge" aria-hidden="true">${iconSvg(detectIconKey(subject))}</span>${escapeHtml(subject)}</h4>
                    <p>${escapeHtml(inferSubjectHint(subject))}</p>
                </article>
            `).join('')
            : `<article class="career-subject-item"><p>${escapeHtml(t('career.results.noRecommendations', 'Пока нет рекомендаций по предметам.'))}</p></article>`;

        const reliability = latestResult?.reliability?.level || '-';
        const low = latestResult?.reliability?.low_confidence === true;
        reliabilityEl.textContent = t('career.results.reliability', 'Достоверность: {level}', { level: reliability });
        reliabilityEl.style.color = low ? 'var(--warning)' : 'var(--text-secondary)';
        lastDateEl.textContent = t('career.results.lastAttempt', 'Последняя попытка: {date}', { date: formatDateTime(latestResult?.completed_at) });
    }

    async function loadDashboardCareer() {
        const emptyState = document.getElementById('careerEmptyState');
        const resultsState = document.getElementById('careerResultsState');
        const startBtn = document.getElementById('careerStartBtn');
        const retakeBtn = document.getElementById('careerRetakeBtn');
        const pdfBtn = document.getElementById('careerPdfExportBtn');

        if (startBtn) startBtn.addEventListener('click', startCareerTestPage);
        if (retakeBtn) retakeBtn.addEventListener('click', startCareerTestPage);
        if (pdfBtn) pdfBtn.addEventListener('click', () => window.open(`${API_URL}/student/career/report.pdf`, '_blank'));

        const resultRes = await apiFetch(`${API_URL}/student/career/results`);
        const resultData = resultRes.ok ? await resultRes.json() : {};
        state.latestResult = resultData?.result || null;

        if (!state.latestResult) {
            if (state.radarChart) {
                state.radarChart.destroy();
                state.radarChart = null;
            }
            if (emptyState) emptyState.style.display = 'block';
            if (resultsState) resultsState.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (resultsState) resultsState.style.display = 'block';
        renderDashboardCards(state.latestResult);
        await renderDashboardCharts(state.latestResult);
    }

    function setStandaloneStatus(message, isError = false) {
        const el = document.getElementById('careerFormStatus');
        if (!el) return;
        const text = String(message || '').trim();
        el.textContent = text;
        el.style.color = isError ? 'var(--error-color)' : 'var(--text-secondary)';
        el.classList.toggle('is-visible', text.length > 0);
    }

    function selectedAnswerForCurrent() {
        const question = state.questions[state.currentIndex];
        if (!question) return null;
        return state.answers[String(question.id)] ?? null;
    }

    function setProgress() {
        const total = state.questions.length;
        const current = total ? state.currentIndex + 1 : 0;
        const percent = total ? Math.round((current / total) * 100) : 0;

        const label = document.getElementById('careerProgressLabel');
        const percentEl = document.getElementById('careerProgressPercent');
        const bar = document.getElementById('careerProgressBar');
        if (label) label.textContent = t('careerTest.progress', 'Вопрос {current} из {total}', { current, total });
        if (percentEl) percentEl.textContent = `${percent}%`;
        if (bar) bar.style.width = `${percent}%`;
    }

    function renderCurrentQuestion() {
        const question = state.questions[state.currentIndex];
        const titleEl = document.getElementById('careerQuestionTitle');
        const indexEl = document.getElementById('careerQuestionIndex');
        const optionsEl = document.getElementById('careerQuestionOptions');
        const prevBtn = document.getElementById('careerPrevBtn');
        const nextBtn = document.getElementById('careerNextBtn');
        const submitBtn = document.getElementById('careerSubmitBtn');

        if (!question || !titleEl || !indexEl || !optionsEl || !prevBtn || !nextBtn || !submitBtn) return;

        const lang = getLang();
        const text = lang === 'uz' ? (question.text_uz || question.text_ru || '-') : (question.text_ru || question.text_uz || '-');
        titleEl.textContent = text;
        indexEl.textContent = String(state.currentIndex + 1);

        const selected = selectedAnswerForCurrent();
        optionsEl.innerHTML = SCALE_ITEMS.map((value) => {
            const checked = Number(selected) === value;
            const optionText = t(`career.scale${value}`, `scale${value}`);
            return `
                <label class="career-step-option ${checked ? 'is-selected' : ''}">
                    <input type="radio" name="career_current" value="${value}" ${checked ? 'checked' : ''} />
                    <span>${escapeHtml(optionText)}</span>
                </label>
            `;
        }).join('');

        optionsEl.querySelectorAll('input[type="radio"]').forEach((input) => {
            input.addEventListener('change', () => {
                state.answers[String(question.id)] = Number(input.value);
                renderCurrentQuestion();
            });
        });

        prevBtn.disabled = state.currentIndex === 0;
        const isLast = state.currentIndex >= state.questions.length - 1;
        nextBtn.style.display = isLast ? 'none' : 'inline-flex';
        submitBtn.style.display = isLast ? 'inline-flex' : 'none';
        setProgress();
    }

    async function submitStandaloneTest() {
        const submitBtn = document.getElementById('careerSubmitBtn');
        if (submitBtn) submitBtn.disabled = true;
        try {
            setStandaloneStatus(t('career.submitting', 'Отправка...'));
            const response = await apiFetch(`${API_URL}/student/career/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers: state.answers })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || t('career.submitError', 'Ошибка отправки'));
            }

            setStandaloneStatus(t('career.submitSuccess', 'Результаты сохранены'));
            window.location.href = '/dashboard#career';
        } catch (error) {
            console.error('Career submit error:', error);
            setStandaloneStatus(error.message || t('career.submitError', 'Ошибка отправки'), true);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function initStandaloneTestPage() {
        window.i18n?.translate?.();
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const label = t('theme.toggleAria', 'Переключить тему');
            themeToggle.setAttribute('aria-label', label);
        }

        document.getElementById('careerBackBtn')?.addEventListener('click', () => {
            window.location.href = '/dashboard#career';
        });

        document.getElementById('careerPrevBtn')?.addEventListener('click', () => {
            if (state.currentIndex > 0) {
                state.currentIndex -= 1;
                renderCurrentQuestion();
            }
        });

        document.getElementById('careerNextBtn')?.addEventListener('click', () => {
            const currentQuestion = state.questions[state.currentIndex];
            const currentAnswer = currentQuestion ? state.answers[String(currentQuestion.id)] : null;
            if (!currentAnswer) {
                setStandaloneStatus(t('career.answerAll', 'Пожалуйста, ответьте на все вопросы'), true);
                return;
            }
            setStandaloneStatus('');
            if (state.currentIndex < state.questions.length - 1) {
                state.currentIndex += 1;
                renderCurrentQuestion();
            }
        });

        document.getElementById('careerTestForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const unanswered = state.questions.some((question) => !state.answers[String(question.id)]);
            if (unanswered) {
                setStandaloneStatus(t('career.answerAll', 'Пожалуйста, ответьте на все вопросы'), true);
                return;
            }
            await submitStandaloneTest();
        });

        setStandaloneStatus(t('career.loading', 'Загружаем вопросы...'));
        const questionsRes = await apiFetch(`${API_URL}/student/career/questions`);
        if (!questionsRes.ok) {
            setStandaloneStatus(t('career.loadError', 'Не удалось загрузить данные'), true);
            return;
        }
        const data = await questionsRes.json();
        state.questions = Array.isArray(data?.questions) ? data.questions : [];

        if (!state.questions.length) {
            setStandaloneStatus(t('career.noQuestions', 'Вопросы пока не настроены'), true);
            return;
        }

        setStandaloneStatus('');
        state.currentIndex = 0;
        state.answers = {};
        renderCurrentQuestion();

        window.addEventListener('zedly:lang-changed', () => {
            window.i18n?.translate?.();
            const themeToggleEl = document.getElementById('themeToggle');
            if (themeToggleEl) {
                themeToggleEl.setAttribute('aria-label', t('theme.toggleAria', 'Переключить тему'));
            }
            renderCurrentQuestion();
        });
    }

    async function initDashboardCareerPage() {
        try {
            await loadDashboardCareer();
        } catch (error) {
            console.error('Career dashboard load error:', error);
            const emptyState = document.getElementById('careerEmptyState');
            if (emptyState) {
                emptyState.style.display = 'block';
                emptyState.innerHTML = `
                    <div class="career-hero-icon" aria-hidden="true">⚠️</div>
                    <h2 class="career-hero-title">${escapeHtml(t('career.failedLoadTitle', 'Не удалось загрузить данные профориентации'))}</h2>
                    <p class="career-hero-text">${escapeHtml(t('career.failedLoadText', 'Обновите страницу и попробуйте снова.'))}</p>
                    <div class="career-hero-actions">
                        <button class="btn btn-primary" id="careerRetryBtn" type="button">${escapeHtml(t('common.refresh', 'Обновить'))}</button>
                    </div>
                `;
                document.getElementById('careerRetryBtn')?.addEventListener('click', () => window.location.reload());
                window.i18n?.translate?.();
            }
        }
    }

    async function init() {
        if (document.getElementById('careerStandaloneRoot')) {
            await initStandaloneTestPage();
            return;
        }

        if (document.getElementById('careerHub')) {
            await initDashboardCareerPage();
        }
    }

    window.CareerManager = { init };
})();
