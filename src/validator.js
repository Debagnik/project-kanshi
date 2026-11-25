/**
 * Recursively checks that every key/value in `expected` exists and matches in `actual`.
 * Returns an array of human-readable mismatch descriptions.
 */
function matchPartialJson(expected, actual, path = '') {
  const mismatches = [];

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
 * Validates the HTTP response against the service's expectedStatus and expectedJson.
 * Returns { healthy: boolean, reason: string }.
 */
function validateResponse(service, result) {
  if (!result.ok) {
    return {
      healthy: false,
      reason: `Network/request error: ${result.error}`,
    };
  }

  if (result.status !== service.expectedStatus) {
    return {
      healthy: false,
      reason: `HTTP status mismatch: expected ${service.expectedStatus}, got ${result.status}`,
    };
  }

  if (service.expectedJson !== null && service.expectedJson !== undefined) {
    const mismatches = matchPartialJson(service.expectedJson, result.data);
    if (mismatches.length > 0) {
      return {
        healthy: false,
        reason: mismatches.join('; '),
      };
    }
  }

  return { healthy: true, reason: 'OK' };
}

module.exports = { validateResponse, matchPartialJson };
