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
    this.stuckCount = 0;  // 连续卡住次数
    this.stats = { restarts: 0, uptime: Date.now() };
  }

  async runHealthCheck() {
    logger.info(MSG.healthCheck);
    
    // 综合健康检查
    const health_result = await health.checkHealth();
    
    // API 检查
    logger.info(health_result.apiOk ? MSG.apiOk : MSG.apiFail);
    
    // 消息响应检查
    if (health_result.lastActivity) {
      logger.info(`Last activity: ${health_result.idleMin} min ago`);
    }
    
    // 判断是否需要重启
    let needRestart = false;
    let restartReason = '';
    
    if (!health_result.apiOk) {
      // API 不通
      this.wasDown = true;
      const processOk = await health.checkProcess();
      logger.info(processOk ? MSG.processAlive : MSG.processDead);
      
      if (!processOk) {
        needRestart = true;
        restartReason = 'process_dead';
      }
    } else if (!health_result.messageOk) {
      // API 通但消息卡住
      this.stuckCount++;
      logger.warn(`Message stuck detected (${this.stuckCount}/${CONFIG.gateway.stuckCountBeforeRestart})`);
      
      if (this.stuckCount >= CONFIG.gateway.stuckCountBeforeRestart) {
        needRestart = true;
        restartReason = `stuck_${health_result.idleMin}min`;
        this.stuckCount = 0;
      }
    } else {
      // 一切正常
      if (this.wasDown) {
        logger.info('Gateway recovered');
        this.wasDown = false;
      }
      this.stuckCount = 0;
      health.resetRestartCount();
    }
    
    // 执行重启
    if (needRestart) {
      this.stats.restarts++;
      logger.warn(`Restart #${this.stats.restarts} - reason: ${restartReason}`);
      await health.restartGateway(restartReason);
    }
    
    // 日志分析
    const analysis = analyzer.analyze();
    if (analysis.errors.length > 0) {
      logger.warn(MSG.logIssue, analysis.counts);
    }
    
    // 配置变更检测
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
