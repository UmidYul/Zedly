// School Comparison Manager
const SchoolComparisonManager = (function () {
    'use strict';

    let currentMetric = 'avg_score';
    let currentPeriod = 'month';
    let comparisonData = null;

    function showAlert(message, title = 'Error') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    async function init() {
        console.log('📊 Initializing School Comparison Manager...');
        attachEventListeners();
        await loadComparisonData();
    }

    function attachEventListeners() {
        // Metric selector
        const metricSelect = document.getElementById('comparisonMetric');
        if (metricSelect) {
            metricSelect.addEventListener('change', (e) => {
                currentMetric = e.target.value;
                loadComparisonData();
            });
        }

        // Period selector
        const periodSelect = document.getElementById('timePeriod');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                currentPeriod = e.target.value;
                loadComparisonData();
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportComparisonBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportReport);
        }
    }

    async function loadComparisonData() {
        try {
            const container = document.getElementById('comparisonContainer');
            if (!container) return;

            // Show loading
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-3xl);">
                    <div class="spinner" style="display: inline-block; width: 40px; height: 40px;"></div>
                    <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading comparison data...</p>
                </div>
            `;

            const params = new URLSearchParams({
                metric: currentMetric,
                period: currentPeriod
            });

            const response = await fetch(`/api/superadmin/comparison?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch comparison data');
            }

            comparisonData = await response.json();
            renderComparison(comparisonData);
        } catch (error) {
            console.error('Failed to load comparison data:', error);
            const container = document.getElementById('comparisonContainer');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p style="color: var(--text-danger);">Failed to load comparison data. Please try again.</p>
                    </div>
                `;
            }
        }
    }

    function renderComparison(data) {
        const container = document.getElementById('comparisonContainer');
        if (!container) return;

        const metricLabels = {
            avg_score: { name: 'Average Score', unit: '%', icon: 'chart' },
            test_completion: { name: 'Test Completion Rate', unit: '%', icon: 'clipboard' },
            student_count: { name: 'Student Count', unit: '', icon: 'users' },
            teacher_count: { name: 'Teacher Count', unit: '', icon: 'users' }
        };

        const metricInfo = metricLabels[data.metric] || metricLabels.avg_score;

        let html = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon blue">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Top Performer</div>
                        <div class="stat-value">${data.summary.top_performer || 'N/A'}</div>
                    </div>
                </div>
        `;

        if (data.metric === 'avg_score') {
            html += `
                <div class="stat-card">
                    <div class="stat-icon green">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">System Average</div>
                        <div class="stat-value">${data.summary.average}%</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon orange">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Total Attempts</div>
                        <div class="stat-value">${data.summary.total_attempts || 0}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon purple">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"></path>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Schools Compared</div>
                        <div class="stat-value">${data.schools.length}</div>
                    </div>
                </div>
            `;
        } else if (data.metric === 'test_completion') {
            html += `
                <div class="stat-card">
                    <div class="stat-icon green">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Avg Completion</div>
                        <div class="stat-value">${data.summary.average}%</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon orange">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Total Tests</div>
                        <div class="stat-value">${data.summary.total_tests || 0}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon purple">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"></path>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Schools</div>
                        <div class="stat-value">${data.schools.length}</div>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="stat-card">
                    <div class="stat-icon green">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Average</div>
                        <div class="stat-value">${data.summary.average || 0}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon orange">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Total</div>
                        <div class="stat-value">${data.summary.total || 0}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon purple">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"></path>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Schools</div>
                        <div class="stat-value">${data.schools.length}</div>
                    </div>
                </div>
            `;
        }

        html += '</div>';

        // Chart section
        html += `
            <div class="dashboard-section">
                <div class="section-header">
                    <h2 class="section-title">School Performance - ${metricInfo.name}</h2>
                </div>
                <div id="comparisonChart">
        `;

        if (data.schools.length === 0) {
            html += `
                <div style="text-align: center; padding: var(--spacing-3xl); color: var(--text-secondary);">
                    <p>No data available for the selected period.</p>
                </div>
            `;
        } else {
            html += renderBarChart(data.schools, metricInfo);
        }

        html += `
                </div>
            </div>
        `;

        // Table section
        html += `
            <div class="dashboard-section">
                <div class="section-header">
                    <h2 class="section-title">Detailed Breakdown</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>School</th>
                                <th>${metricInfo.name}</th>
        `;

        if (data.metric === 'avg_score') {
            html += '<th>Completed Tests</th>';
        } else if (data.metric === 'test_completion') {
            html += '<th>Total Tests</th><th>Completed</th>';
        }

        html += `
                            </tr>
                        </thead>
                        <tbody>
        `;

        data.schools.forEach((school, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${school.name}</td>
                    <td><strong>${school.value.toFixed(data.metric.includes('count') ? 0 : 2)}${metricInfo.unit}</strong></td>
            `;

            if (data.metric === 'avg_score') {
                html += `<td>${school.attempts || 0}</td>`;
            } else if (data.metric === 'test_completion') {
                html += `<td>${school.total || 0}</td><td>${school.completed || 0}</td>`;
            }

            html += '</tr>';
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    function renderBarChart(schools, metricInfo) {
        const maxValue = Math.max(...schools.map(s => s.value));
        const chartHeight = 400;
        const barWidth = Math.min(100, 800 / schools.length);

        let html = `
            <div style="padding: var(--spacing-xl); overflow-x: auto;">
                <div style="display: flex; align-items: flex-end; justify-content: space-around; height: ${chartHeight}px; gap: 10px; min-width: ${schools.length * (barWidth + 10)}px;">
        `;

        schools.forEach((school, index) => {
            const barHeight = maxValue > 0 ? (school.value / maxValue * (chartHeight - 80)) : 0;
            const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
            const color = colors[index % colors.length];

            html += `
                <div style="display: flex; flex-direction: column; align-items: center; flex: 0 0 ${barWidth}px;">
                    <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-primary); font-size: 16px;">
                        ${school.value.toFixed(metricInfo.unit === '%' ? 1 : 0)}${metricInfo.unit}
                    </div>
                    <div style="
                        width: ${barWidth}px;
                        height: ${barHeight}px;
                        background: ${color};
                        border-radius: 8px 8px 0 0;
                        transition: all 0.3s ease;
                        cursor: pointer;
                    " title="${school.name}: ${school.value}${metricInfo.unit}"></div>
                    <div style="
                        margin-top: 12px;
                        font-size: 12px;
                        color: var(--text-secondary);
                        text-align: center;
                        word-break: break-word;
                        max-width: ${barWidth + 20}px;
                    ">
                        ${school.name}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }

    async function exportReport() {
        if (!comparisonData) {
            showAlert('No data to export');
            return;
        }

        try {
            const metricLabels = {
                avg_score: 'Average Score',
                test_completion: 'Test Completion Rate',
                student_count: 'Student Count',
                teacher_count: 'Teacher Count'
            };

            const csv = convertToCSV(comparisonData, metricLabels[comparisonData.metric]);

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `school-comparison-${comparisonData.metric}-${comparisonData.period}-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export report:', error);
            showAlert('Failed to export report. Please try again.');
        }
    }

    function convertToCSV(data, metricName) {
        let headers = ['Rank', 'School', metricName];

        if (data.metric === 'avg_score') {
            headers.push('Completed Tests');
        } else if (data.metric === 'test_completion') {
            headers.push('Total Tests', 'Completed');
        }

        const rows = data.schools.map((school, index) => {
            let row = [
                index + 1,
                school.name,
                school.value.toFixed(data.metric.includes('count') ? 0 : 2)
            ];

            if (data.metric === 'avg_score') {
                row.push(school.attempts || 0);
            } else if (data.metric === 'test_completion') {
                row.push(school.total || 0, school.completed || 0);
            }

            return row;
        });

        return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    // Public API
    return {
        init
    };
})();

// Expose to window
window.SchoolComparisonManager = SchoolComparisonManager;
