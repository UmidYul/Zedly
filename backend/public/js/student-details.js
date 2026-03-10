(function () {
    'use strict';

    const API_URL = '/api';
    const state = {
        currentUser: null,
        studentId: null,
        sourceClassId: null,
        teacherHomeroomClassId: null,
        report: null,
        subjectSearch: '',
        subjectSort: 'avg_desc',
        progressRange: '30'
    };
    let careerChart = null;
    let careerThemeObserver = null;

    function t(key, fallback, params) {
        return window.ZedlyI18n?.translate?.(key, params) || fallback || key;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function showAlert(message, title = t('common.info', 'Info')) {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    function showConfirm(message, title = t('common.confirmation', 'Confirmation')) {
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title });
        }
        return Promise.resolve(confirm(message));
    }

    function showTempPassword(password, studentName) {
        if (window.ZedlyDialog?.temporaryPassword) {
            return window.ZedlyDialog.temporaryPassword({
                title: t('studentDetails.tempPasswordTitle', 'Temporary password'),
                subtitle: t('studentDetails.tempPasswordFor', 'Password for {name}', { name: studentName }),
                password: password || '',
                passwordLabel: t('studentDetails.tempPasswordLabel', 'Temporary password'),
                copyText: t('studentDetails.copy', 'Copy'),
                hint: t('studentDetails.tempPasswordHint', 'Student must change this password after next login.')
            });
        }

        return showAlert(
            t('studentDetails.tempPasswordValue', 'Temporary password: {password}', { password: password || '-' }),
            t('studentDetails.passwordResetTitle', 'Password reset')
        );
    }

    function safeText(value, fallback = '-') {
        if (value === null || value === undefined || value === '') return fallback;
        return String(value);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function toNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
    }

    function toPercent(value, digits = 1) {
        return `${toNumber(value).toFixed(digits)}%`;
    }

    function getCurrentLocale() {
        const lang = window.ZedlyI18n?.getCurrentLang?.() || 'ru';
        return lang === 'uz' ? 'uz-UZ' : 'ru-RU';
    }

    function formatDateTime(isoValue) {
        if (!isoValue) return '-';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString(getCurrentLocale());
    }

    function formatShortDate(isoValue) {
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString(getCurrentLocale());
    }

    function getInitials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'S';
        if (parts.length === 1) return parts[0][0].toUpperCase();
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    function wrapRadarLabel(value, maxLineLen = 13) {
        const text = String(value || '').trim();
        if (!text) return ['-'];
        if (text.length <= maxLineLen) return [text];
        const words = text.split(/\s+/).filter(Boolean);
        if (words.length <= 1) return [text];

        const lines = [];
        let current = '';
        words.forEach((word) => {
            if (!current) {
                current = word;
                return;
            }
            if ((current.length + 1 + word.length) <= maxLineLen) {
                current += ` ${word}`;
                return;
            }
            lines.push(current);
            current = word;
        });
        if (current) lines.push(current);
        return lines.length ? lines : [text];
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

    function applyCareerRadarTheme(chart, palette) {
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

    function bindCareerThemeRefresh() {
        if (careerThemeObserver) {
            careerThemeObserver.disconnect();
        }

        careerThemeObserver = new MutationObserver(() => {
            if (!careerChart) return;
            applyCareerRadarTheme(careerChart, getCareerRadarPalette());
            careerChart.update('none');
        });

        careerThemeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    function applyStaticI18n() {
        window.i18n?.translate?.();

        const pageTitle = t('studentDetails.pageTitle', 'Student Profile - ZEDLY');
        const pageTitleEl = document.getElementById('pageTitle');
        if (pageTitleEl) pageTitleEl.textContent = pageTitle;
        document.title = pageTitle;

        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.setAttribute('aria-label', t('studentDetails.back', 'Back'));
        }

        const tabsBar = document.getElementById('tabsBar');
        if (tabsBar) {
            tabsBar.setAttribute('aria-label', t('studentDetails.tabsAriaLabel', 'Student report tabs'));
        }
    }

    async function fetchCurrentUser() {
        const cached = localStorage.getItem('user');
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed?.id) return parsed;
            } catch (_) {
                // ignore parse error
            }
        }

        const response = await fetch(`${API_URL}/auth/me`, {
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('auth_required');
            }
            throw new Error(t('studentDetails.failedFetchCurrentUser', 'Failed to fetch current user'));
        }

        const data = await response.json();
        localStorage.setItem('user', JSON.stringify(data));
        return data;
    }

    function resolveStudentId(currentUser) {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get('id');
        if (fromQuery) return String(fromQuery);
        if (currentUser?.role === 'student') return String(currentUser.id);
        return null;
    }

    function resolveSourceClassId() {
        const params = new URLSearchParams(window.location.search);
        const classId = params.get('class_id');
        return classId ? String(classId) : null;
    }

    async function fetchStudentReport() {
        const response = await fetch(`${API_URL}/analytics/student/${encodeURIComponent(state.studentId)}/report`, {
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 403) throw new Error(t('studentDetails.accessDeniedStudent', 'Access denied for this student'));
            if (response.status === 404) throw new Error(t('studentDetails.studentNotFound', 'Student not found'));
            throw new Error(t('studentDetails.failedLoadReport', 'Failed to load student report'));
        }

        return response.json();
    }

    async function fetchTeacherHomeroomClassId() {
        const response = await fetch(`${API_URL}/teacher/homeroom-class`, {
            credentials: 'include'
        });
        if (!response.ok) return null;
        const data = await response.json().catch(() => ({}));
        return data?.class?.id ? String(data.class.id) : null;
    }

    function renderHero() {
        const student = state.report?.student || {};
        const fullName = `${safeText(student.first_name, '').trim()} ${safeText(student.last_name, '').trim()}`.trim()
            || t('studentDetails.studentFallback', 'Student');
        const classPart = safeText(student.class_name, t('studentDetails.noClass', 'No class'));
        const gradePart = safeText(student.grade_level, '-');
        const emailPart = safeText(student.email, t('studentDetails.noEmail', 'No email'));

        setText('studentFullName', fullName);
        setText('studentMeta', t('studentDetails.metaTemplate', 'Class: {class} • Grade: {grade} • Email: {email}', {
            class: classPart,
            grade: gradePart,
            email: emailPart
        }));
        setText('studentAvatar', getInitials(fullName));
        setText('updatedAt', formatDateTime(new Date().toISOString()));
    }

    function renderKpis() {
        const overall = state.report?.overall || {};
        const ranking = state.report?.ranking || {};
        const attempts = toNumber(overall.total_attempts);
        const passed = toNumber(overall.passed_count);
        const passRate = attempts > 0 ? (passed / attempts) * 100 : 0;
        const rank = toNumber(ranking.rank);
        const totalStudents = toNumber(ranking.total_students);

        setText('kpiAttempts', String(attempts));
        setText('kpiAvgScore', toPercent(overall.avg_score));
        setText('kpiPassRate', toPercent(passRate));
        setText('kpiRank', rank > 0 ? `#${rank}/${totalStudents}` : '-');
        setText('kpiAvgTime', `${toNumber(overall.avg_time_minutes).toFixed(1)}${t('studentDetails.minutesSuffix', 'm')}`);
    }

    function getFilteredSubjects() {
        const list = Array.isArray(state.report?.by_subject) ? [...state.report.by_subject] : [];
        const query = state.subjectSearch.trim().toLowerCase();
        let filtered = list;

        if (query) {
            filtered = filtered.filter((row) => String(row.subject || '').toLowerCase().includes(query));
        }

        const sortKey = state.subjectSort;
        filtered.sort((a, b) => {
            if (sortKey === 'avg_desc') return toNumber(b.avg_score) - toNumber(a.avg_score);
            if (sortKey === 'avg_asc') return toNumber(a.avg_score) - toNumber(b.avg_score);
            if (sortKey === 'attempts_desc') return toNumber(b.attempts) - toNumber(a.attempts);
            if (sortKey === 'pass_desc') return toNumber(b.pass_rate) - toNumber(a.pass_rate);
            return String(a.subject || '').localeCompare(String(b.subject || ''));
        });

        return filtered;
    }

    function renderSubjects() {
        const body = document.getElementById('subjectsBody');
        const rows = getFilteredSubjects();
        const subjectLabel = t('studentDetails.colSubject', 'Предмет');
        const attemptsLabel = t('studentDetails.colAttempts', 'Попытки');
        const avgScoreLabel = t('studentDetails.colAvgScore', 'Средний балл');
        const bestLabel = t('studentDetails.colBest', 'Лучший');
        const worstLabel = t('studentDetails.colWorst', 'Худший');
        const passRateLabel = t('studentDetails.colPassRate', 'Прохождение');

        if (!rows.length) {
            body.innerHTML = `<tr><td class="empty-row" colspan="6">${escapeHtml(t('studentDetails.noSubjectRecords', 'No subject records found.'))}</td></tr>`;
            return;
        }

        body.innerHTML = rows.map((row) => `
            <tr>
                <td data-label="${subjectLabel}">${escapeHtml(row.subject || '-')}</td>
                <td data-label="${attemptsLabel}">${toNumber(row.attempts)}</td>
                <td data-label="${avgScoreLabel}">${toPercent(row.avg_score)}</td>
                <td data-label="${bestLabel}">${toPercent(row.best_score)}</td>
                <td data-label="${worstLabel}">${toPercent(row.worst_score)}</td>
                <td data-label="${passRateLabel}">${toPercent(row.pass_rate)}</td>
            </tr>
        `).join('');
    }

    function getProgressRows() {
        const rows = Array.isArray(state.report?.progress) ? [...state.report.progress] : [];
        if (state.progressRange === 'all') return rows;

        const days = Number(state.progressRange);
        const now = new Date();
        return rows.filter((row) => {
            const week = new Date(row.week);
            if (Number.isNaN(week.getTime())) return false;
            const diff = now.getTime() - week.getTime();
            const ageDays = diff / (1000 * 60 * 60 * 24);
            return ageDays <= days;
        });
    }

    function buildChartSvg(rows) {
        if (!rows.length) {
            return `<div class="chart-empty">${escapeHtml(t('studentDetails.noProgressData', 'No progress data for selected range.'))}</div>`;
        }

        const width = 920;
        const height = 260;
        const left = 42;
        const right = 16;
        const top = 20;
        const bottom = 30;
        const innerWidth = width - left - right;
        const innerHeight = height - top - bottom;

        const points = rows.map((row, index) => {
            const x = left + (index * innerWidth) / Math.max(1, rows.length - 1);
            const y = top + innerHeight - (Math.max(0, Math.min(100, toNumber(row.avg_score))) / 100) * innerHeight;
            return { x, y, raw: row };
        });

        const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
        const gridLines = [0, 25, 50, 75, 100].map((v) => {
            const y = top + innerHeight - (v / 100) * innerHeight;
            return `<g class="chart-axis"><line class="chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line><text x="4" y="${y + 4}">${v}%</text></g>`;
        }).join('');

        const dots = points.map((point) => {
            const label = t('studentDetails.progressPointLabel', '{date} - {score} ({attempts} attempts)', {
                date: formatShortDate(point.raw.week),
                score: toPercent(point.raw.avg_score),
                attempts: toNumber(point.raw.attempts)
            });
            return `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="5"><title>${escapeHtml(label)}</title></circle>`;
        }).join('');

        const labels = points.map((point, index) => {
            if (rows.length > 10 && index % 2 === 1) return '';
            return `<text x="${point.x}" y="${height - 8}" text-anchor="middle">${escapeHtml(formatShortDate(point.raw.week))}</text>`;
        }).join('');

        return `
            <svg class="progress-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(t('studentDetails.progressChartAria', 'Student progress chart'))}">
                ${gridLines}
                <path class="chart-line" d="${path}"></path>
                ${dots}
                <g class="chart-axis">${labels}</g>
            </svg>
        `;
    }

    function renderProgress() {
        const visual = document.getElementById('progressVisual');
        const rows = getProgressRows();
        visual.innerHTML = buildChartSvg(rows);
    }

    function renderInsights() {
        const strengths = Array.isArray(state.report?.strengths) ? state.report.strengths : [];
        const weaknesses = Array.isArray(state.report?.weaknesses) ? state.report.weaknesses : [];
        const ranking = state.report?.ranking || {};

        const strengthsList = document.getElementById('strengthsList');
        const weaknessesList = document.getElementById('weaknessesList');
        const rankDetail = document.getElementById('rankDetail');
        const rankNote = document.getElementById('rankNote');

        const noDataLabel = t('studentDetails.notEnoughData', 'Not enough data yet');
        strengthsList.innerHTML = strengths.length
            ? strengths.map((item) => `<span class="tag good">${escapeHtml(item.subject || '-')} • ${toPercent(item.avg_score)}</span>`).join('')
            : `<span class="tag">${escapeHtml(noDataLabel)}</span>`;

        weaknessesList.innerHTML = weaknesses.length
            ? weaknesses.map((item) => `<span class="tag bad">${escapeHtml(item.subject || '-')} • ${toPercent(item.avg_score)}</span>`).join('')
            : `<span class="tag">${escapeHtml(noDataLabel)}</span>`;

        const rank = toNumber(ranking.rank);
        const total = toNumber(ranking.total_students);
        if (rank > 0 && total > 0) {
            rankDetail.textContent = `#${rank}`;
            rankNote.textContent = t('studentDetails.rankOutOf', 'Out of {total} students in class.', { total });
        } else {
            rankDetail.textContent = '-';
            rankNote.textContent = t('studentDetails.noClassRankData', 'No class ranking data yet.');
        }
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

    function setCareerChartEmptyState(showEmpty) {
        const canvas = document.getElementById('careerDetailsRadarChart');
        const empty = document.getElementById('careerRadarEmpty');
        if (canvas) {
            canvas.style.display = showEmpty ? 'none' : 'block';
        }
        if (empty) {
            empty.style.display = showEmpty ? 'flex' : 'none';
        }
    }

    function renderCareerRadar(labels, values) {
        const canvas = document.getElementById('careerDetailsRadarChart');
        if (!canvas || !window.Chart || !labels.length) return;

        if (careerChart) {
            careerChart.destroy();
        }

        const wrappedLabels = labels.map((label) => wrapRadarLabel(label, 13));
        const palette = getCareerRadarPalette();

        careerChart = new Chart(canvas, {
            type: 'radar',
            data: {
                labels: wrappedLabels,
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
    }

    async function renderCareer() {
        const latestMeta = document.getElementById('careerLatestMeta');
        const recSubjects = document.getElementById('careerRecommendedSubjects');
        const topInterests = document.getElementById('careerTopInterests');
        const historyBody = document.getElementById('careerHistoryBody');

        if (!latestMeta || !recSubjects || !topInterests || !historyBody) return;

        const career = state.report?.career || {};
        const latest = career.latest || null;
        const history = Array.isArray(career.history) ? career.history : [];
        const indexLabel = '#';
        const dateLabel = t('common.date', 'Дата');
        const reliabilityLabel = t('career.reliability', 'Достоверность');
        const interestsLabel = t('career.topInterests', 'Топ интересы');

        if (!latest) {
            if (careerChart) {
                careerChart.destroy();
                careerChart = null;
            }
            setCareerChartEmptyState(true);
            latestMeta.innerHTML = `<span class="tag">${escapeHtml(t('career.noResults', 'Пока нет результатов. Пройдите тест.'))}</span>`;
            recSubjects.innerHTML = `<span class="tag">${escapeHtml(t('career.noRecommendations', 'Рекомендаций пока нет'))}</span>`;
            topInterests.innerHTML = `<span class="tag">${escapeHtml(t('career.noResults', 'Пока нет результатов. Пройдите тест.'))}</span>`;
            historyBody.innerHTML = '<tr><td colspan="4" class="empty-row">Нет попыток</td></tr>';
            return;
        }

        const reliability = latest.reliability?.level || '-';
        const lowConfidence = latest.reliability?.low_confidence === true;
        latestMeta.innerHTML = `
            <span class="tag">${escapeHtml(`Попытка #${latest.attempt_no || '-'}`)}</span>
            <span class="tag">${escapeHtml(`Дата: ${formatDateTime(latest.completed_at)}`)}</span>
            <span class="tag ${lowConfidence ? 'bad' : 'good'}">${escapeHtml(`Достоверность: ${reliability}`)}</span>
        `;

        const latestSubjects = latest.recommended_subjects?.ru
            || latest.recommended_subjects?.uz
            || [];
        recSubjects.innerHTML = latestSubjects.length
            ? latestSubjects.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join('')
            : `<span class="tag">${escapeHtml(t('career.noRecommendations', 'Рекомендаций пока нет'))}</span>`;

        const top = Array.isArray(latest.top_interests) ? latest.top_interests : [];
        topInterests.innerHTML = top.length
            ? top.map((item) => `<span class="tag good">${escapeHtml(item)}</span>`).join('')
            : `<span class="tag">${escapeHtml('-')}</span>`;

        historyBody.innerHTML = history.length
            ? history.map((attempt, idx) => {
                const rel = attempt.reliability?.level || '-';
                const topAttempt = Array.isArray(attempt.top_interests) ? attempt.top_interests.slice(0, 3).join(', ') : '-';
                return `
                    <tr>
                        <td data-label="${indexLabel}">${idx + 1}</td>
                        <td data-label="${dateLabel}">${escapeHtml(formatDateTime(attempt.completed_at))}</td>
                        <td data-label="${reliabilityLabel}">${escapeHtml(rel)}</td>
                        <td data-label="${interestsLabel}">${escapeHtml(topAttempt || '-')}</td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="4" class="empty-row">Нет попыток</td></tr>';

        const labels = Array.isArray(latest.interests)
            ? latest.interests.map((interest) => interest.name_ru || interest.name_uz || interest.id)
            : Object.keys(latest.interests_scores || {});
        const values = Array.isArray(latest.interests)
            ? latest.interests.map((interest) => Number(interest.score) || 0)
            : labels.map((key) => Number((latest.interests_scores || {})[key]) || 0);
        if (labels.length) {
            setCareerChartEmptyState(false);
            await ensureChartJs();
            renderCareerRadar(labels, values);
        } else {
            if (careerChart) {
                careerChart.destroy();
                careerChart = null;
            }
            setCareerChartEmptyState(true);
        }
    }

    function renderAll() {
        renderHero();
        renderKpis();
        renderSubjects();
        renderProgress();
        renderInsights();
        renderCareer().catch((error) => {
            console.error('Career render error:', error);
        });
    }

    function setTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach((btn) => {
            const active = btn.dataset.tab === tabId;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('.tab-panel').forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.panel === tabId);
        });
    }

    async function handleResetPassword() {
        if (!state.currentUser || !state.studentId) return;
        const role = state.currentUser.role;
        if (!['school_admin', 'teacher'].includes(role)) {
            return showAlert(
                t('studentDetails.resetAccessDeniedRole', 'Only school admin or teacher can reset student password.'),
                t('common.error', 'Error')
            );
        }
        if (role === 'teacher') {
            const sourceClassId = state.sourceClassId ? String(state.sourceClassId) : '';
            const homeroomClassId = state.teacherHomeroomClassId ? String(state.teacherHomeroomClassId) : '';
            if (!sourceClassId || !homeroomClassId || sourceClassId !== homeroomClassId) {
                return showAlert(
                    t('studentDetails.resetAccessDeniedClass', 'You can reset password only for students from your homeroom class.'),
                    t('common.error', 'Error')
                );
            }
        }

        const studentName = document.getElementById('studentFullName')?.textContent || t('studentDetails.studentGenitive', 'student');
        const approved = await showConfirm(
            t('studentDetails.confirmResetPassword', 'Reset password for {name}?', { name: studentName }),
            t('common.confirmation', 'Confirmation')
        );
        if (!approved) return;

        const endpoint = role === 'teacher'
            ? `${API_URL}/teacher/students/${encodeURIComponent(state.studentId)}/reset-password?class_id=${encodeURIComponent(state.sourceClassId || '')}`
            : `${API_URL}/admin/users/${encodeURIComponent(state.studentId)}/reset-password`;

        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include'
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.message || t('studentDetails.failedResetPassword', 'Failed to reset password'));
        }

        await showTempPassword(payload.tempPassword || '', studentName);
    }

    function downloadJsonReport() {
        const studentName = (document.getElementById('studentFullName')?.textContent || 'student')
            .toLowerCase()
            .replace(/\s+/g, '_');
        const filename = `${studentName}_report.json`;
        const blob = new Blob([JSON.stringify(state.report || {}, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function exportCareerPdf() {
        if (!state.studentId) return;
        const url = `${API_URL}/analytics/student/${encodeURIComponent(state.studentId)}/career/report.pdf`;
        window.open(url, '_blank');
    }

    async function copyEmail() {
        const email = state.report?.student?.email;
        if (!email) {
            await showAlert(
                t('studentDetails.studentEmailEmpty', 'Student email is empty.'),
                t('common.info', 'Info')
            );
            return;
        }

        try {
            await navigator.clipboard.writeText(String(email));
            await showAlert(
                t('studentDetails.emailCopied', 'Email copied to clipboard.'),
                t('common.success', 'Success')
            );
        } catch (_) {
            await showAlert(`Email: ${email}`, t('studentDetails.copyFailed', 'Copy failed'));
        }
    }

    function bindEvents() {
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                history.back();
            });
        }

        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => setTab(btn.dataset.tab));
        });

        const subjectSearch = document.getElementById('subjectSearch');
        if (subjectSearch) {
            subjectSearch.addEventListener('input', (event) => {
                state.subjectSearch = event.target.value || '';
                renderSubjects();
            });
        }

        const subjectSort = document.getElementById('subjectSort');
        if (subjectSort) {
            subjectSort.addEventListener('change', (event) => {
                state.subjectSort = event.target.value || 'avg_desc';
                renderSubjects();
            });
        }

        document.querySelectorAll('.segment-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.progressRange = btn.dataset.range || '30';
                document.querySelectorAll('.segment-btn').forEach((item) => {
                    item.classList.toggle('is-active', item === btn);
                });
                renderProgress();
            });
        });

        document.getElementById('exportJsonBtn')?.addEventListener('click', downloadJsonReport);
        document.getElementById('exportCareerPdfBtn')?.addEventListener('click', exportCareerPdf);
        document.getElementById('printBtn')?.addEventListener('click', () => window.print());
        document.getElementById('copyEmailBtn')?.addEventListener('click', () => {
            copyEmail().catch((error) => showAlert(error.message || t('studentDetails.failedCopyEmail', 'Failed to copy email'), t('common.error', 'Error')));
        });
        document.getElementById('resetPasswordBtn')?.addEventListener('click', () => {
            handleResetPassword().catch((error) => showAlert(error.message || t('studentDetails.failedResetPassword', 'Failed to reset password'), t('common.error', 'Error')));
        });

        window.addEventListener('zedly:lang-changed', () => {
            applyStaticI18n();
            if (state.report) renderAll();
        });
    }

    function setupRoleActions() {
        const btn = document.getElementById('resetPasswordBtn');
        if (!btn) return;

        if (!state.currentUser || !['school_admin', 'teacher'].includes(state.currentUser.role)) {
            btn.style.display = 'none';
            return;
        }

        if (state.currentUser.role === 'teacher') {
            const sourceClassId = state.sourceClassId ? String(state.sourceClassId) : '';
            const homeroomClassId = state.teacherHomeroomClassId ? String(state.teacherHomeroomClassId) : '';
            if (!sourceClassId || !homeroomClassId || sourceClassId !== homeroomClassId) {
                btn.style.display = 'none';
                return;
            }
        }
    }

    async function init() {
        try {
            applyStaticI18n();
            state.currentUser = await fetchCurrentUser();
            state.studentId = resolveStudentId(state.currentUser);
            state.sourceClassId = resolveSourceClassId();
            if (state.currentUser.role === 'teacher') {
                state.teacherHomeroomClassId = await fetchTeacherHomeroomClassId();
            }

            if (!state.studentId) {
                throw new Error(t('studentDetails.studentIdRequired', 'Student id is required in URL (?id=...) for this role'));
            }

            bindEvents();
            bindCareerThemeRefresh();
            setupRoleActions();
            state.report = await fetchStudentReport();
            renderAll();
        } catch (error) {
            console.error('Student details init error:', error);
            if (error?.message === 'auth_required') {
                window.location.href = '/login';
                return;
            }
            setText('studentFullName', t('studentDetails.failedLoadProfile', 'Failed to load student profile'));
            setText('studentMeta', error.message || t('studentDetails.unknownError', 'Unknown error'));
            showAlert(error.message || t('studentDetails.failedOpenPage', 'Failed to open student page'), t('common.error', 'Error'));
        }
    }

    window.addEventListener('DOMContentLoaded', init);
})();
