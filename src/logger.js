/**
 * Verbose structured logger for kanshi.
 * Logs timestamps, levels, and optional structured context.
 */

function formatTimestamp() {
  return new Date().toISOString();
}

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) return '';
  try {
    return ' ' + JSON.stringify(meta);
  } catch {
    return ' [unserializable meta]';
  }
}

function log(level, scope, message, meta) {
  const line = `[${formatTimestamp()}] [${level}] [${scope}] ${message}${formatMeta(meta)}`;
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  info: (scope, message, meta) => log('INFO', scope, message, meta),
  warn: (scope, message, meta) => log('WARN', scope, message, meta),
  error: (scope, message, meta) => log('ERROR', scope, message, meta),
  debug: (scope, message, meta) => log('DEBUG', scope, message, meta),
};
