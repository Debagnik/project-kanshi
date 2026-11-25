const { google } = require('googleapis');
const { getAuthClient } = require('./googleAuth');
const logger = require('./logger');

/**
 * Computes final To and Bcc lists respecting IS_TESTING, ENABLE_BCC, and deduplication.
 */
function resolveRecipients({ serviceRecipients = [], bccList = [], enableBcc, isTesting }) {
  const normalizedTo = serviceRecipients.map((e) => e.trim()).filter(Boolean);
  const toSet = new Set(normalizedTo.map((e) => e.toLowerCase()));

  if (isTesting) {
    // In testing mode, ONLY BCC recipients receive the email; To recipients are skipped.
    return {
      to: [],
      bcc: [...new Set(bccList.map((e) => e.trim()).filter(Boolean))],
    };
  }

  if (!enableBcc) {
    return {
      to: normalizedTo,
      bcc: [],
    };
  }

  // Deduplicate: exclude any BCC address already present in To
  const deduplicatedBcc = bccList
    .map((e) => e.trim())
    .filter((email) => email && !toSet.has(email.toLowerCase()));

  return {
    to: normalizedTo,
    bcc: [...new Set(deduplicatedBcc)],
  };
}

/**
 * Builds a base64url-encoded RFC 2822 MIME message.
 */
function buildRawMimeMessage({ from, to, bcc, subject, html }) {
  const headers = [
    `From: ${from}`,
    to.length > 0 ? `To: ${to.join(', ')}` : `To: ${from}`,
    bcc.length > 0 ? `Bcc: ${bcc.join(', ')}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ]
    .filter(Boolean)
    .join('\r\n');

  const body = Buffer.from(html, 'utf-8').toString('base64');
  const raw = `${headers}\r\n\r\n${body}`;
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Sends an HTML email via the Gmail API.
 */
async function sendEmail({ service, subject, html, featureFlags, bccList }) {
  const sender = process.env.GMAIL_SENDER;
  if (!sender) {
    throw new Error('Missing GMAIL_SENDER in environment variables');
  }

  const { to, bcc } = resolveRecipients({
    serviceRecipients: service.recipients,
    bccList,
    enableBcc: featureFlags.enableBcc,
    isTesting: featureFlags.isTesting,
  });

  if (to.length === 0 && bcc.length === 0) {
    logger.warn('Mailer', 'No recipients resolved; skipping email', {
      serviceId: service.id,
      isTesting: featureFlags.isTesting,
      enableBcc: featureFlags.enableBcc,
    });
    return;
  }

  logger.info('Mailer', 'Sending email via Gmail API', {
    serviceId: service.id,
    subject,
    isTesting: featureFlags.isTesting,
    toCount: to.length,
    bccCount: bcc.length,
  });

  const auth = getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const raw = buildRawMimeMessage({ from: sender, to, bcc, subject, html });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  logger.info('Mailer', 'Email sent successfully', {
    serviceId: service.id,
    subject,
  });
}

module.exports = { sendEmail, resolveRecipients, buildRawMimeMessage };
