const axios = require('axios');

/**
 * Calls a service's health endpoint using axios.
 * Never throws on HTTP 4xx/5xx; returns { ok, status, data, error }.
 */
async function checkEndpoint(service) {
  try {
    const response = await axios({
      method: service.method || 'GET',
      url: service.checkUrl,
      timeout: service.timeoutMs || 5000,
      validateStatus: () => true, // handle all status codes in validator
    });

    return {
      ok: true,
      status: response.status,
      data: response.data,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      data: null,
      error: err.code ? `${err.code}: ${err.message}` : err.message,
    };
  }
}

module.exports = { checkEndpoint };
