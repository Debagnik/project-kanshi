const { checkEndpoint } = require('./checker');
const { validateResponse } = require('./validator');
const { renderTemplate } = require('./template');
const { sendEmail } = require('./mailer');
const { recordIncidentDown, recordIncidentUp } = require('./sheetsIncidents');
const { fetchAllStatuses, updateServiceStatus } = require('./sheetsStatus');
const logger = require('./logger');

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

class MonitorScheduler {
  constructor() {
    this.timers = new Map();
    this.states = new Map(); // serviceId -> { status: 'UP'|'DOWN', downSince: Date|null, incidentId: string|null }
    this.config = { services: [], featureFlags: {}, bccList: [] };
    this.stopped = false;
    this.initialized = false;
  }

  async updateConfig(newConfig) {
    this.config = newConfig;

    if (!this.initialized) {
      this.initialized = true;
      if (newConfig.featureFlags.restoreStateFromStatus) {
        const savedStatuses = await fetchAllStatuses();
        for (const [id, info] of savedStatuses.entries()) {
          if (info.status === 'DOWN') {
            this.states.set(id, {
              status: 'DOWN',
              downSince: info.lastCheckedEpoch ? new Date(info.lastCheckedEpoch * 1000) : new Date(),
              incidentId: null,
            });
          } else {
            this.states.set(id, { status: 'UP', downSince: null, incidentId: null });
          }
        }
      }
    }

    const activeIds = new Set(
      newConfig.services.filter((s) => s.isActive).map((s) => s.id)
    );

    // Clear timers for removed or inactive services
    for (const [id, timer] of this.timers.entries()) {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        this.timers.delete(id);
        logger.info('Scheduler', `Stopped monitoring service "${id}"`);
      }
    }

    // Handle inactive services & start timers for active services
    const nowEpoch = Math.floor(Date.now() / 1000);
    for (const service of newConfig.services) {
      if (!service.isActive) {
        await updateServiceStatus({
          serviceId: service.id,
          status: 'INACTIVE',
          lastCheckedEpoch: nowEpoch,
        });
        continue;
      }

      if (!this.timers.has(service.id)) {
        if (!this.states.has(service.id)) {
          this.states.set(service.id, { status: 'UP', downSince: null, incidentId: null });
        }
        logger.info('Scheduler', `Starting monitor for "${service.id}"`, {
          checkUrl: service.checkUrl,
          intervalMinutes: service.intervalMinutes,
        });
        this.scheduleNext(service.id, 0); // run immediately on startup
      }
    }
  }

  scheduleNext(serviceId, delayMs) {
    if (this.stopped) return;
    const timer = setTimeout(() => this.runCheck(serviceId), delayMs);
    this.timers.set(serviceId, timer);
  }

  async runCheck(serviceId) {
    if (this.stopped) return;

    const service = this.config.services.find((s) => s.id === serviceId);
    if (!service) return;

    const state = this.states.get(serviceId) || { status: 'UP', downSince: null, incidentId: null };
    const result = await checkEndpoint(service);
    const validation = validateResponse(service, result);
    const lastCheckedEpoch = Math.floor(Date.now() / 1000);
    const currentStatus = validation.healthy ? 'UP' : validation.isWarning ? 'DEGRADED' : 'DOWN';

    await updateServiceStatus({
      serviceId: service.id,
      status: currentStatus,
      lastCheckedEpoch,
    });

    if (validation.healthy) {
      logger.info('Check', `Service "${service.id}" is UP`, {
        status: result.status,
      });

      if (state.status === 'DOWN') {
        const upAt = new Date();
        const downAt = state.downSince || upAt;
        const durationMs = upAt.getTime() - downAt.getTime();
        const durationMinutes = Number((durationMs / 60000).toFixed(2));
        const durationFormatted = formatDuration(durationMs);

        logger.info('StateChange', `Service "${service.id}" RECOVERED (DOWN -> UP)`, {
          timeOfDeath: downAt.toISOString(),
          timeOfRevival: upAt.toISOString(),
          duration: durationFormatted,
        });

        await recordIncidentUp({
          incidentId: state.incidentId,
          service,
          upAt,
          durationMinutes,
        });

        const html = renderTemplate(
          this.config.featureFlags.alertRestoredTemplate,
          {
            displayName: service.displayName,
            publicUrl: service.publicUrl,
            timeOfDeath: downAt.toISOString(),
            timeOfRevival: upAt.toISOString(),
            duration: durationFormatted,
            message: `${service.displayName} has recovered and is responding normally.`,
          },
          'restored'
        );

        try {
          await sendEmail({
            service,
            subject: `[RESTORED] ${service.displayName} is back UP (${durationFormatted})`,
            html,
            featureFlags: this.config.featureFlags,
            bccList: this.config.bccList,
          });
        } catch (err) {
          logger.error('Mailer', `Failed to send RESTORED email for "${service.id}"`, {
            error: err.message,
          });
        }

        this.states.set(serviceId, { status: 'UP', downSince: null, incidentId: null });
      }
    } else if (validation.isWarning) {
      logger.warn('Check', `Service "${service.id}" WARNING: status ${result.status} matched, but response did not`, {
        reason: validation.reason,
      });

      if (this.config.featureFlags.enableWarningEmail) {
        const now = new Date();
        const expectedFormatted =
          service.expectedResponse !== null && service.expectedResponse !== undefined
            ? typeof service.expectedResponse === 'object'
              ? JSON.stringify(service.expectedResponse, null, 2)
              : String(service.expectedResponse)
            : 'None';

        const html = renderTemplate(
          this.config.featureFlags.alertWarningTemplate,
          {
            displayName: service.displayName,
            publicUrl: service.publicUrl,
            timestamp: now.toISOString(),
            reason: validation.reason,
            expectedStatus: service.expectedStatus,
            actualStatus: result.status,
            expectedResponse: expectedFormatted,
            actualResponse:
              result.data !== null && result.data !== undefined
                ? typeof result.data === 'object'
                  ? JSON.stringify(result.data, null, 2)
                  : String(result.data)
                : 'No response body',
          },
          'warning'
        );

        try {
          await sendEmail({
            service,
            subject: `[WARNING] ${service.displayName} response mismatch`,
            html,
            featureFlags: this.config.featureFlags,
            bccList: this.config.bccList,
            excludeBcc: true,
          });
        } catch (err) {
          logger.error('Mailer', `Failed to send WARNING email for "${service.id}"`, {
            error: err.message,
          });
        }
      }
    } else {
      logger.warn('Check', `Service "${service.id}" FAILED health check`, {
        reason: validation.reason,
        actualStatus: result.status,
      });

      if (state.status === 'UP') {
        const downAt = new Date();
        logger.error('StateChange', `Service "${service.id}" went DOWN (UP -> DOWN)`, {
          reason: validation.reason,
          downAt: downAt.toISOString(),
        });

        const incidentId = await recordIncidentDown({
          service,
          downAt,
          reason: validation.reason,
        });

        this.states.set(serviceId, {
          status: 'DOWN',
          downSince: downAt,
          incidentId,
        });

        const html = renderTemplate(
          this.config.featureFlags.alertDownTemplate,
          {
            displayName: service.displayName,
            publicUrl: service.publicUrl,
            description: service.description || 'No description provided.',
            timestamp: downAt.toISOString(),
            reason: validation.reason,
            expectedStatus: service.expectedStatus,
            actualStatus: result.status !== null ? result.status : 'N/A (Network Error)',
            expectedJson: service.expectedResponse
              ? typeof service.expectedResponse === 'object'
                ? JSON.stringify(service.expectedResponse, null, 2)
                : String(service.expectedResponse)
              : 'None',
            actualResponse:
              result.data !== null && result.data !== undefined
                ? typeof result.data === 'object'
                  ? JSON.stringify(result.data, null, 2)
                  : String(result.data)
                : result.error || 'No response body',
          },
          'down'
        );

        try {
          await sendEmail({
            service,
            subject: `[DOWN] ${service.displayName} is unreachable`,
            html,
            featureFlags: this.config.featureFlags,
            bccList: this.config.bccList,
          });
        } catch (err) {
          logger.error('Mailer', `Failed to send DOWN email for "${service.id}"`, {
            error: err.message,
          });
        }
      }
    }

    const nextIntervalMs = (service.intervalMinutes || 5) * 60 * 1000;
    this.scheduleNext(serviceId, nextIntervalMs);
  }

  stopAll() {
    this.stopped = true;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    logger.info('Scheduler', 'All service timers stopped');
  }
}

module.exports = { MonitorScheduler, formatDuration };
