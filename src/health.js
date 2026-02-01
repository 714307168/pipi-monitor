const http = require('http');
const { spawn, exec } = require('child_process');
const CONFIG = require('./config');
const logger = require('./logger');
const MSG = logger.MSG;

class HealthChecker {
  constructor() {
    this.restartCount = 0;
    this.lastRestartTime = 0;
  }

  async checkProcess() {
    return new Promise((resolve) => {
      exec('tasklist /fi "imagename eq node.exe" | find /c "node.exe"', (err, stdout) => {
        resolve((parseInt(stdout.trim()) || 0) > 0);
      });
    });
  }

  async checkAPI() {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: CONFIG.gateway.host,
        port: CONFIG.gateway.port,
        path: '/health',
        method: 'GET',
        timeout: 5000
      }, (res) => resolve(res.statusCode < 500));
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  async restartGateway() {
    const now = Date.now();
    if (now - this.lastRestartTime < CONFIG.restart.cooldownPeriod) {
      logger.warn(MSG.restartCooldown);
      return false;
    }
    if (this.restartCount >= CONFIG.restart.maxRetries) {
      logger.error(MSG.restartMaxRetry);
      return false;
    }

    logger.info(MSG.restarting);
    this.restartCount++;
    this.lastRestartTime = now;

    return new Promise((resolve) => {
      const ps = spawn('cmd', ['/c', 'start', '/min', 'cmd', '/c', 
        'cd /d E:\\openclaw && node openclaw.mjs gateway start'
      ], { detached: true, stdio: 'ignore' });
      ps.unref();
      setTimeout(() => { logger.info(MSG.restartSent); resolve(true); }, 3000);
    });
  }

  resetRestartCount() { this.restartCount = 0; }
}

module.exports = new HealthChecker();
