import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const authToken = __ENV.AUTH_TOKEN || '';
const thinkTime = Number(__ENV.THINK_TIME || 0.2);

const failRate = new Rate('failed_requests');

const commonHeaders = {
  'Content-Type': 'application/json',
};

if (authToken) {
  commonHeaders.Authorization = `Bearer ${authToken}`;
}

export const options = {
  scenarios: {
    smoke_public: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.SMOKE_RPS || 20),
      timeUnit: '1s',
      duration: __ENV.SMOKE_DURATION || '1m',
      preAllocatedVUs: Number(__ENV.SMOKE_VUS || 20),
      maxVUs: Number(__ENV.SMOKE_MAX_VUS || 100),
      tags: { test_type: 'smoke' },
    },
    load_public: {
      executor: 'ramping-arrival-rate',
      startRate: Number(__ENV.LOAD_START_RPS || 30),
      timeUnit: '1s',
      preAllocatedVUs: Number(__ENV.LOAD_VUS || 50),
      maxVUs: Number(__ENV.LOAD_MAX_VUS || 300),
      stages: [
        { target: Number(__ENV.LOAD_STAGE1_RPS || 80), duration: __ENV.LOAD_STAGE1_DURATION || '2m' },
        { target: Number(__ENV.LOAD_STAGE2_RPS || 120), duration: __ENV.LOAD_STAGE2_DURATION || '2m' },
        { target: Number(__ENV.LOAD_STAGE3_RPS || 160), duration: __ENV.LOAD_STAGE3_DURATION || '2m' },
        { target: 0, duration: __ENV.LOAD_COOLDOWN || '30s' },
      ],
      tags: { test_type: 'load' },
      startTime: __ENV.LOAD_START_TIME || '1m10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    failed_requests: ['rate<0.02'],
    http_req_duration: ['p(95)<1200', 'p(99)<2500'],
    checks: ['rate>0.98'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

function hit(path, expectedStatus, params = {}) {
  const res = http.get(`${baseUrl}${path}`, { headers: commonHeaders, ...params });

  const ok = check(res, {
    [`${path} status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${path} latency < 2000ms`]: (r) => r.timings.duration < 2000,
  });

  failRate.add(!ok || res.status >= 500);
  return res;
}

export default function () {
  hit('/', 200);
  hit('/api/health', 200);

  // DB-bound endpoint in this project often fails when DB is unavailable.
  // Accept 200/500/429 so you can still observe behavior under stress.
  const statsRes = http.get(`${baseUrl}/api/public/landing-stats`, { headers: commonHeaders });
  const statsOk = check(statsRes, {
    'landing-stats expected status': (r) => [200, 429, 500].includes(r.status),
  });
  failRate.add(!statsOk || statsRes.status >= 500);

  sleep(thinkTime);
}
