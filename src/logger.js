const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const MSG = {
  start: 'PiPi Monitor Started',
  stop: 'PiPi Monitor Stopped', 
  port: 'Port',
  interval: 'Interval',
  healthCheck: 'Health Check',
  apiOk: 'API OK',
  apiFail: 'API FAIL',
  processAlive: 'Process Alive',
  processDead: 'Process Dead',
  restarting: 'Restarting Gateway',
  restartSent: 'Restart Sent',
  restartCooldown: 'Cooldown',
  restartMaxRetry: 'Max Retry',
  configChanged: 'Config Changed',
  logIssue: 'Log Issue',
  noLogFile: 'No Log File',
  foundErrors: 'Errors Found'
};

class Logger {
  constructor() {
    this.ensureLogDir();
    this.MSG = MSG;
  }

  ensureLogDir() {
    if (!fs.existsSync(CONFIG.logsDir)) {
      fs.mkdirSync(CONFIG.logsDir, { recursive: true });
    }
  }

  getChinaTime() {
    const now = new Date();
    const china = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return china.toISOString().replace('Z', '+08:00');
  }

  getChinaDate() {
    const now = new Date();
    const china = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return china.toISOString().split('T')[0];
  }

  getLogFile() {
    return path.join(CONFIG.logsDir, 'pipi-' + this.getChinaDate() + '.log');
  }

  log(level, message, data) {
    const ts = this.getChinaTime();
    const entry = { ts, level, msg: message };
    if (data) entry.data = data;
    fs.appendFileSync(this.getLogFile(), JSON.stringify(entry) + '\n');
  }

  info(msg, data) { this.log('INFO', msg, data); }
  warn(msg, data) { this.log('WARN', msg, data); }
  error(msg, data) { this.log('ERROR', msg, data); }
}

module.exports = new Logger();
