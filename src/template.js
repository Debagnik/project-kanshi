const DEFAULT_DOWN_TEMPLATE = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f6f8; padding:24px; color:#1f2937;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb;">
    <div style="background:#dc2626; color:#ffffff; padding:16px 24px;">
      <span style="display:inline-block; background:#991b1b; padding:4px 10px; border-radius:4px; font-size:12px; font-weight:700; letter-spacing:0.5px;">SERVICE DOWN</span>
      <h2 style="margin:8px 0 0 0; font-size:20px;">{{displayName}}</h2>
    </div>
    <div style="padding:24px;">
      <p style="margin-top:0;">The health check for <strong>{{displayName}}</strong> (<a href="{{publicUrl}}">{{publicUrl}}</a>) has failed.</p>
      <p style="background:#18181b; padding:12px; border-left:3px solid #da532c; border-radius:4px;"><strong>Impact / Description:</strong> {{description}}</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:14px;">
        <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb; color:#6b7280;">Timestamp</td><td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{timestamp}}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb; color:#6b7280;">Reason</td><td style="padding:8px; border-bottom:1px solid #e5e7eb; color:#dc2626; font-weight:600;">{{reason}}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb; color:#6b7280;">Expected Status</td><td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{expectedStatus}}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb; color:#6b7280;">Actual Status</td><td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{actualStatus}}</td></tr>
      </table>
      <p style="font-size:13px; color:#6b7280; margin-bottom:4px;">Expected JSON Contract:</p>
      <pre style="background:#f9fafb; padding:12px; border-radius:6px; font-size:12px; overflow-x:auto;">{{expectedJson}}</pre>
      <p style="font-size:13px; color:#6b7280; margin-bottom:4px;">Actual Response:</p>
      <pre style="background:#f9fafb; padding:12px; border-radius:6px; font-size:12px; overflow-x:auto;">{{actualResponse}}</pre>
    </div>
  </div>
</body>
</html>`;

const DEFAULT_RESTORED_TEMPLATE = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f6f8; padding:24px; color:#1f2937;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb;">
    <div style="background:#16a34a; color:#ffffff; padding:16px 24px;">
      <span style="display:inline-block; background:#166534; padding:4px 10px; border-radius:4px; font-size:12px; font-weight:700; letter-spacing:0.5px;">SERVICE RESTORED</span>
      <h2 style="margin:8px 0 0 0; font-size:20px;">{{displayName}}</h2>
    </div>
    <div style="padding:24px;">
      <p style="margin-top:0;"><strong>{{displayName}}</strong> (<a href="{{publicUrl}}">{{publicUrl}}</a>) is back online and passing health checks.</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:14px;">
        <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb; color:#6b7280;">Time of Death</td><td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{timeOfDeath}}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb; color:#6b7280;">Time of Revival</td><td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{timeOfRevival}}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb; color:#6b7280;">Downtime Duration</td><td style="padding:8px; border-bottom:1px solid #e5e7eb; font-weight:600;">{{duration}}</td></tr>
      </table>
      <p style="font-size:14px; color:#374151;">{{message}}</p>
    </div>
  </div>
</body>
</html>`;

const DEFAULT_WARNING_TEMPLATE = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#000000; padding:24px; color:#f3f4f6;">
  <div style="max-width:600px; margin:0 auto; background:#111111; border-radius:8px; overflow:hidden; border:1px solid #262626;">
    <div style="background:#d97706; color:#ffffff; padding:16px 24px;">
      <span style="display:inline-block; background:rgba(0,0,0,0.3); padding:4px 10px; border-radius:4px; font-size:12px; font-weight:700;">WARNING</span>
      <h2 style="margin:8px 0 0 0; font-size:20px;">{{displayName}}</h2>
    </div>
    <div style="padding:24px;">
      <p style="margin-top:0;"><strong>{{displayName}}</strong> (<a href="{{publicUrl}}" style="color:#da532c;">{{publicUrl}}</a>) returned HTTP {{actualStatus}}, but the response did not match the expected contract.</p>
      <p><strong>Reason:</strong> {{reason}}</p>
      <p style="font-size:13px; color:#9ca3af;">Expected: <pre style="background:#18181b; padding:10px; border-radius:6px;">{{expectedResponse}}</pre></p>
      <p style="font-size:13px; color:#9ca3af;">Actual: <pre style="background:#1c1917; padding:10px; border-radius:6px;">{{actualResponse}}</pre></p>
    </div>
  </div>
</body>
</html>`;

/**
 * Replaces {{key}} placeholders in a template string.
 */
function renderTemplate(templateStr, variables, fallbackType = 'down') {
  const base =
    templateStr && templateStr.trim()
      ? templateStr
      : fallbackType === 'restored'
        ? DEFAULT_RESTORED_TEMPLATE
        : fallbackType === 'warning'
          ? DEFAULT_WARNING_TEMPLATE
          : DEFAULT_DOWN_TEMPLATE;

  return base.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] !== undefined && variables[key] !== null
      ? String(variables[key])
      : '';
  });
}

module.exports = { renderTemplate, DEFAULT_DOWN_TEMPLATE, DEFAULT_RESTORED_TEMPLATE, DEFAULT_WARNING_TEMPLATE };
