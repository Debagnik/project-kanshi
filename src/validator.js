/**
 * Recursively checks that every key/value in `expected` exists and matches in `actual`.
 * Supports `"*"` (any non-null/defined value) and `"regex:<pattern>"`.
 */
function matchPartialJson(expected, actual, path = '') {
  const mismatches = [];

  if (expected === '*') {
    if (actual === undefined || actual === null) {
      mismatches.push(`Missing/null value at "${path || 'root'}" (expected any non-null value)`);
    }
    return mismatches;
  }

  if (typeof expected === 'string' && expected.startsWith('regex:')) {
    const pattern = expected.slice('regex:'.length);
    const re = new RegExp(pattern);
    if (!re.test(String(actual ?? ''))) {
      mismatches.push(
        `Regex mismatch at "${path || 'root'}": "${actual}" did not match /${pattern}/`
      );
    }
    return mismatches;
  }

  if (expected === null || typeof expected !== 'object') {
    if (expected !== actual) {
      mismatches.push(
        `JSON mismatch at "${path || 'root'}": expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
    return mismatches;
  }

  if (actual === null || typeof actual !== 'object') {
    mismatches.push(
      `JSON type mismatch at "${path || 'root'}": expected object/array, got ${actual === null ? 'null' : typeof actual}`
    );
    return mismatches;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      mismatches.push(`JSON mismatch at "${path || 'root'}": expected array, got object`);
      return mismatches;
    }
    expected.forEach((item, idx) => {
      const childPath = path ? `${path}[${idx}]` : `[${idx}]`;
      mismatches.push(...matchPartialJson(item, actual[idx], childPath));
    });
    return mismatches;
  }

  for (const key of Object.keys(expected)) {
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in actual)) {
      mismatches.push(`Missing JSON key "${childPath}" (expected ${JSON.stringify(expected[key])})`);
    } else {
      mismatches.push(...matchPartialJson(expected[key], actual[key], childPath));
    }
  }

  return mismatches;
}

/**
 * Validates the HTTP response against expectedStatus and expectedResponse.
 * Returns { healthy: boolean, isWarning: boolean, reason: string }.
 */
function validateResponse(service, result) {
  if (!result.ok) {
    return {
      healthy: false,
      isWarning: false,
      reason: `Network/request error: ${result.error}`,
    };
  }

  if (result.status !== service.expectedStatus) {
    return {
      healthy: false,
      isWarning: false,
      reason: `HTTP status mismatch: expected ${service.expectedStatus}, got ${result.status}`,
    };
  }

  const expected = service.expectedResponse !== undefined ? service.expectedResponse : service.expectedJson;

  if (expected !== null && expected !== undefined && expected !== '') {
    if (typeof expected === 'string') {
      const actualStr =
        typeof result.data === 'string'
          ? result.data.trim()
          : result.data !== null && result.data !== undefined
            ? JSON.stringify(result.data)
            : '';

      if (expected.startsWith('regex:')) {
        const pattern = expected.slice('regex:'.length);
        if (!new RegExp(pattern).test(actualStr)) {
          return {
            healthy: false,
            isWarning: true,
            reason: `Response text mismatch: "${actualStr}" did not match /${pattern}/`,
          };
        }
      } else if (actualStr !== expected.trim()) {
        return {
          healthy: false,
          isWarning: true,
          reason: `Response text mismatch: expected "${expected.trim()}", got "${actualStr}"`,
        };
      }
    } else {
      const mismatches = matchPartialJson(expected, result.data);
      if (mismatches.length > 0) {
        return {
          healthy: false,
          isWarning: true,
          reason: mismatches.join('; '),
        };
      }
    }
  }

  return { healthy: true, isWarning: false, reason: 'OK' };
}

module.exports = { validateResponse, matchPartialJson };
