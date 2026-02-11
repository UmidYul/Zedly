// Career Test Page
(function () {
    'use strict';

    const API_URL = '/api';
    let questions = [];
    let interests = [];
    let radarChart = null;
    let currentResult = null;

    const scaleLabels = [
        { value: 1, key: 'career.scale1' },
        { value: 2, key: 'career.scale2' },
        { value: 3, key: 'career.scale3' },
        { value: 4, key: 'career.scale4' },
        { value: 5, key: 'career.scale5' }
    ];

    function t(key) {
        return window.ZedlyI18n?.translate(key) || key;
    }

    function getLang() {
        return window.ZedlyI18n?.getCurrentLang?.() || 'ru';
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

    function setStatus(message, isError = false) {
        const status = document.getElementById('careerFormStatus');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? 'var(--error-color)' : 'var(--text-secondary)';
    }

    function renderQuestions() {
        const container = document.getElementById('careerQuestions');
        if (!container) return;

        if (!questions.length) {
            container.innerHTML = `<p class="career-hint">${t('career.noQuestions')}</p>`;
            return;
        }

        const lang = getLang();
        container.innerHTML = questions.map((question, index) => {
            const text = lang === 'uz' ? question.text_uz : question.text_ru;
            const scale = scaleLabels.map((item) => {
                const label = t(item.key);
                return `
                    <label>
                        <input type="radio" name="q_${question.id}" value="${item.value}" />
                        <span>${label}</span>
                    </label>
                `;
            }).join('');

            return `
                <div class="career-question">
                    <div class="career-question-title">${index + 1}. ${text}</div>
                    <div class="career-scale">${scale}</div>
                </div>
            `;
        }).join('');
    }

    function renderResults(result) {
        const emptyState = document.getElementById('careerResultsEmpty');
        const chartEl = document.getElementById('careerRadarChart');
        const recommendations = document.getElementById('careerRecommendations');

        if (!emptyState || !chartEl || !recommendations) return;

        if (!result) {
            currentResult = null;
            emptyState.style.display = 'block';
            chartEl.style.display = 'none';
            recommendations.innerHTML = '';
            return;
        }

        currentResult = result;

        emptyState.style.display = 'none';
        chartEl.style.display = 'block';

        const lang = getLang();
        const labels = result.interests.map((interest) => (lang === 'uz' ? interest.name_uz : interest.name_ru));
        const values = result.interests.map((interest) => interest.score);

        renderRadarChart(labels, values);

        const recommended = result.recommended_subjects || {};
        const recommendedList = Array.isArray(recommended)
            ? recommended
            : (lang === 'uz' ? recommended.uz : recommended.ru) || [];

        const topInterests = [...result.interests]
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((interest) => (lang === 'uz' ? interest.name_uz : interest.name_ru));

        recommendations.innerHTML = `
            <div class="career-recommendations">
                <h3>${t('career.topInterests')}</h3>
                <p>${topInterests.join(', ') || '-'}</p>
                <h3>${t('career.recommendations')}</h3>
                ${recommendedList.length
                ? `<ul>${recommendedList.map((item) => `<li>${item}</li>`).join('')}</ul>`
                : `<p>${t('career.noRecommendations')}</p>`
            }
            </div>
        `;
    }

    async function renderRadarChart(labels, values) {
        await ensureChartJs();

        const ctx = document.getElementById('careerRadarChart');
        if (!ctx) return;

        if (radarChart) {
            radarChart.destroy();
        }

        radarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels,
                datasets: [{
                    label: t('career.chartLabel'),
                    data: values,
                    borderColor: 'rgba(59, 130, 246, 1)',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    pointBackgroundColor: 'rgba(59, 130, 246, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    function collectAnswers() {
        const answers = {};
        questions.forEach((question) => {
            const input = document.querySelector(`input[name="q_${question.id}"]:checked`);
            if (input) {
                answers[question.id] = Number(input.value);
            }
        });
        return answers;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setStatus('');

        const answers = collectAnswers();
        if (Object.keys(answers).length !== questions.length) {
            setStatus(t('career.answerAll'), true);
            return;
        }

        const submitBtn = document.getElementById('careerSubmitBtn');
        if (submitBtn) submitBtn.disabled = true;

        try {
            setStatus(t('career.submitting'));
            const response = await fetch(`${API_URL}/student/career/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ answers })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Submit failed');
            }

            const data = await response.json();
            setStatus(t('career.submitSuccess'));
            renderResults(data.result);
        } catch (error) {
            console.error('Career submit error:', error);
            setStatus(t('career.submitError'), true);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function loadData() {
        try {
            setStatus(t('career.loading'));

            const [questionsRes, resultsRes] = await Promise.all([
                fetch(`${API_URL}/student/career/questions`),
                fetch(`${API_URL}/student/career/results`)
            ]);

            if (!questionsRes.ok) {
                throw new Error('Failed to load questions');
            }

            const questionsData = await questionsRes.json();
            questions = questionsData.questions || [];
            interests = questionsData.interests || [];

            renderQuestions();

            if (resultsRes.ok) {
                const resultsData = await resultsRes.json();
                renderResults(resultsData.result);
            }

            setStatus('');
        } catch (error) {
            console.error('Career load error:', error);
            setStatus(t('career.loadError'), true);
        }
    }

    function bindEvents() {
        const form = document.getElementById('careerTestForm');
        if (form) {
            form.addEventListener('submit', handleSubmit);
        }
    }

    async function init() {
        if (!document.getElementById('careerTestForm')) return;
        await loadData();
        bindEvents();

        const langButtons = document.querySelectorAll('.lang-btn');
        langButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                setTimeout(() => {
                    renderQuestions();
                    renderResults(currentResult);
                }, 100);
            });
        });

        if (window.ZedlyI18n?.setLang) {
            window.ZedlyI18n.setLang(getLang());
        }
    }

    window.CareerManager = { init };
})();
