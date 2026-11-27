const assert = require('assert');
const http = require('http');
const { checkEndpoint } = require('../src/checker');
const { validateResponse } = require('../src/validator');
const { renderTemplate } = require('../src/template');
const { resolveRecipients, buildRawMimeMessage } = require('../src/mailer');

async function runTests() {
  console.log('Running kanshi verification tests...');

  // 1. Test resolveRecipients: normal mode with deduplication
  const resNormal = resolveRecipients({
    serviceRecipients: ['alice@example.com', 'bob@example.com'],
    bccList: ['bob@example.com', 'charlie@example.com', 'ALICE@example.com'],
    enableBcc: true,
    isTesting: false,
  });
  assert.deepStrictEqual(resNormal.to, ['alice@example.com', 'bob@example.com']);
  assert.deepStrictEqual(resNormal.bcc, ['charlie@example.com']);

  // 2. Test resolveRecipients: IS_TESTING=true (only BCC, no To)
  const resTesting = resolveRecipients({
    serviceRecipients: ['alice@example.com'],
    bccList: ['charlie@example.com', 'alice@example.com'],
    enableBcc: true,
    isTesting: true,
  });
  assert.deepStrictEqual(resTesting.to, []);
  assert.deepStrictEqual(resTesting.bcc, ['charlie@example.com', 'alice@example.com']);

  // 2b. Test resolveRecipients: excludeBcc=true (warning emails go only to To, never BCC)
  const resWarning = resolveRecipients({
    serviceRecipients: ['alice@example.com'],
    bccList: ['charlie@example.com'],
    enableBcc: true,
    isTesting: true,
    excludeBcc: true,
  });
  assert.deepStrictEqual(resWarning.to, ['alice@example.com']);
  assert.deepStrictEqual(resWarning.bcc, []);

  // 2c. Test plain-text, regex, and wildcard JSON validation
  const plainOk = validateResponse(
    { expectedStatus: 200, expectedResponse: 'Healthy' },
    { ok: true, status: 200, data: 'Healthy\n', error: null }
  );
  assert.strictEqual(plainOk.healthy, true);

  const regexOk = validateResponse(
    { expectedStatus: 200, expectedResponse: 'regex:^v\\d+\\.\\d+\\.\\d+$' },
    { ok: true, status: 200, data: 'v5.3.0', error: null }
  );
  assert.strictEqual(regexOk.healthy, true);

  const wildcardOk = validateResponse(
    { expectedStatus: 200, expectedResponse: { status: 'ok', timestamp: '*', uptimeSeconds: '*' } },
    { ok: true, status: 200, data: { status: 'ok', timestamp: '2026-11-26T02:33:56Z', uptimeSeconds: 123.4, extra: true }, error: null }
  );
  assert.strictEqual(wildcardOk.healthy, true);

  const warnMismatch = validateResponse(
    { expectedStatus: 200, expectedResponse: 'Healthy' },
    { ok: true, status: 200, data: 'Degraded', error: null }
  );
  assert.strictEqual(warnMismatch.healthy, false);
  assert.strictEqual(warnMismatch.isWarning, true);

  // 3. Test template rendering
  const html = renderTemplate('', {
    displayName: 'Auth Portal',
    publicUrl: 'https://auth.example.com',
    description: 'Users cannot log in.',
    reason: 'HTTP status mismatch',
  }, 'down');
  assert(html.includes('Auth Portal'));
  assert(html.includes('Users cannot log in.'));
  assert(html.includes('HTTP status mismatch'));

  // 4. Test MIME builder
  const raw = buildRawMimeMessage({
    from: 'monitor@example.com',
    to: ['alice@example.com'],
    bcc: ['charlie@example.com'],
    subject: '[DOWN] Auth Portal',
    html,
  });
  assert(typeof raw === 'string' && raw.length > 0);

  // 5. Test checker + validator against local mock HTTP server
  let healthyMode = true;
  const server = http.createServer((req, res) => {
    if (healthyMode) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', db: 'connected', uptime: 123 }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'degraded', db: 'disconnected' }));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const service = {
    id: 'mock-svc',
    checkUrl: `http://127.0.0.1:${port}/healthz`,
    method: 'GET',
    timeoutMs: 2000,
    expectedStatus: 200,
    expectedJson: { status: 'ok', db: 'connected' },
  };

  try {
    const okRes = await checkEndpoint(service);
    const okVal = validateResponse(service, okRes);
    assert.strictEqual(okVal.healthy, true, `Expected healthy, got: ${okVal.reason}`);

    healthyMode = false;
    const failRes = await checkEndpoint(service);
    const failVal = validateResponse(service, failRes);
    assert.strictEqual(failVal.healthy, false);
    assert(failVal.reason.includes('JSON mismatch'));
  } finally {
    server.close();
  }

  console.log('All verification tests passed!');
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
