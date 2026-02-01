#!/usr/bin/env node
const CONFIG = require('./config');
const logger = require('./logger');
const health = require('./health');
const analyzer = require('./analyzer');
const configManager = require('./configManager');
const system = require('./system');
const MSG = logger.MSG;

class PipiMonitor {
  constructor() {
    this.running = false;
    this.checkInterval = null;
    this.systemInterval = null;
    this.wasDown = false;
    this.stats = { restarts: 0, uptime: Date.now() };
  }

  async runHealthCheck() {
    logger.info(MSG.healthCheck);
    
    const apiOk = await health.checkAPI();
    logger.info(apiOk ? MSG.apiOk : MSG.apiFail);
    
    if (!apiOk) {
      this.wasDown = true;
      const processOk = await health.checkProcess();
      logger.info(processOk ? MSG.processAlive : MSG.processDead);
      
      if (!processOk) {
        this.stats.restarts++;
        logger.warn(`Restart #${this.stats.restarts}`);
        await health.restartGateway();
      }
    } else {
      if (this.wasDown) {
        logger.info('Gateway recovered');
        this.wasDown = false;
      }
      health.resetRestartCount();
    }
    
    const analysis = analyzer.analyze();
    if (analysis.errors.length > 0) {
      logger.warn(MSG.logIssue, analysis.counts);
    }
    
    if (configManager.hasChanged()) {
      logger.info(MSG.configChanged);
      configManager.load();
    }
  }

  runSystemCheck() {
    const stats = system.check();
    logger.info(`System: CPU ${stats.cpu}%, Mem ${stats.memory.percent}%`);
  }

  start() {
    logger.info(MSG.start);
    logger.info(`${MSG.port}: ${CONFIG.gateway.port}`);
    logger.info(`${MSG.interval}: ${CONFIG.gateway.checkInterval}ms`);
    
    this.running = true;
    configManager.load();
    this.runHealthCheck();
    
    this.checkInterval = setInterval(() => {
      this.runHealthCheck();
    }, CONFIG.gateway.checkInterval);
    
    // System check every 5 min
    this.systemInterval = setInterval(() => {
      this.runSystemCheck();
    }, CONFIG.system.checkInterval);
  }

  stop() {
    logger.info(MSG.stop);
    logger.info(`Stats: ${this.stats.restarts} restarts`);
    this.running = false;
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.systemInterval) clearInterval(this.systemInterval);
  }
}

const monitor = new PipiMonitor();
process.on('SIGINT', () => { monitor.stop(); process.exit(0); });
monitor.start();
