const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const CONFIG = require('./config');
const logger = require('./logger');
const MSG = logger.MSG;

class HealthChecker {
  constructor() {
    this.restartCount = 0;
    this.lastRestartTime = 0;
    this.stuckCount = 0;  // 连续卡住次数
    this.lastMessageTime = null;  // 最后收到消息时间
    this.lastResponseTime = null; // 最后发送回复时间
    this.responseTimeoutChecked = false; // 本轮是否已检查过超时
  }

  async checkProcess() {
    // 检查端口是否被 OpenClaw 进程监听（推荐）
    return new Promise((resolve) => {
      exec('netstat -ano | findstr :' + CONFIG.gateway.port + ' | findstr LISTENING', (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(false);
          return;
        }
        // 检查该端口的进程是否是 OpenClaw
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const parts = line.split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && parseInt(pid) > 0) {
            // 获取进程命令行验证是 OpenClaw
            exec('wmic process where "ProcessID=' + pid + '" get CommandLine', (err2, stdout2) => {
              if (!err2 && stdout2 && stdout2.toLowerCase().includes('openclaw')) {
                resolve(true);
              } else if (!err2 && stdout2) {
                // 备用：检查进程路径
                exec('wmic process where "ProcessID=' + pid + '" get ExecutablePath', (err3, stdout3) => {
                  resolve(!err3 && stdout3 && stdout3.toLowerCase().includes('node'));
                });
              } else {
                resolve(false);
              }
            });
            return;
          }
        }
        resolve(false);
      });
    });
  }

  async checkAPI() {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: CONFIG.gateway.host,
        port: CONFIG.gateway.port,
        path: '/',
        method: 'GET',
        timeout: 5000
      }, (res) => resolve(res.statusCode < 500));
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  // 检查消息响应能力 - 解析 JSONL 文件判断最后一条消息
  async checkMessageResponse() {
    try {
      const sessionsDir = CONFIG.sessionsDir;
      const files = fs.readdirSync(sessionsDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock'));

      if (jsonlFiles.length === 0) {
        logger.warn('No session files found');
        return { ok: true, lastActivity: null, reason: 'no_session' };  // 没有 session 文件不算卡住
      }

      // 找最新的 session 文件
      let latestFile = null;
      let latestTime = 0;
      for (const file of jsonlFiles) {
        const filePath = path.join(sessionsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > latestTime) {
          latestTime = stat.mtimeMs;
          latestFile = filePath;
        }
      }

      // 读取并解析 JSONL 文件
      const content = fs.readFileSync(latestFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        logger.info('Session file is empty');
        return { ok: true, lastActivity: new Date(latestTime), reason: 'empty_session' };
      }

      // 解析最后一条消息
      let lastMessage = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const msg = JSON.parse(lines[i]);
          if (msg.role === 'user' || msg.role === 'assistant') {
            lastMessage = msg;
            break;
          }
        } catch (e) {
          // 跳过解析失败的行
          continue;
        }
      }

      if (!lastMessage) {
        logger.info('No user/assistant message found in session');
        return { ok: true, lastActivity: new Date(latestTime), reason: 'no_message' };
      }

      const threshold = CONFIG.gateway.stuckThreshold || 180000;  // 默认3分钟
      const idleMs = Date.now() - latestTime;
      const idleMin = Math.floor(idleMs / 60000);

      // 判断逻辑：
      // - 如果最后一条是 user 消息，且超过阈值 → 卡住
      // - 如果最后一条是 assistant 消息 → 正常
      const isStuck = lastMessage.role === 'user' && idleMs > threshold;

      return {
        ok: !isStuck,
        lastActivity: new Date(latestTime),
        idleMs,
        idleMin,
        lastRole: lastMessage.role,
        reason: isStuck ? 'stuck_on_user_message' : 'ok'
      };
    } catch (err) {
      logger.error(`checkMessageResponse error: ${err.message}`);
      return { ok: true, lastActivity: null, reason: 'error' };  // 出错不算卡住
    }
  }

  // 通过日志检测消息响应超时 - 检查 OpenClaw 日志中消息接收和回复的时间戳
  async checkResponseTimeoutFromLogs() {
    try {
      const timeoutConfig = CONFIG.responseTimeout;
      if (!timeoutConfig || !timeoutConfig.enabled) {
        return { ok: true, reason: 'disabled' };
      }

      // 查找 OpenClaw 日志文件
      const logDir = CONFIG.openclawLogDir;
      if (!fs.existsSync(logDir)) {
        logger.warn(`OpenClaw log dir not found: ${logDir}`);
        return { ok: true, reason: 'no_log_dir' };
      }

      const files = fs.readdirSync(logDir);
      const logFiles = files.filter(f => f.endsWith('.log') && f.startsWith('openclaw'));

      if (logFiles.length === 0) {
        logger.warn('No OpenClaw log files found');
        return { ok: true, reason: 'no_log_file' };
      }

      // 读取最新的日志文件
      let latestLogFile = null;
      let latestTime = 0;
      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > latestTime) {
          latestTime = stat.mtimeMs;
          latestLogFile = filePath;
        }
      }

      if (!latestLogFile) {
        return { ok: true, reason: 'no_log_file' };
      }

      // 读取日志文件最后 N 行
      const content = fs.readFileSync(latestLogFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      // 日志格式: JSON 包含 time 字段
      // 查找"收到消息"和"发送回复"的特征
      let lastMessageLogTime = null;
      let lastResponseLogTime = null;

      // 日志特征模式（根据 OpenClaw 日志格式）
      const messagePatterns = [
        /received.*message/i,
        /message.*received/i,
        /incoming.*message/i,
        /dingtalk.*message/i,
        /received.*dingtalk/i
      ];

      const responsePatterns = [
        /send.*response/i,
        /response.*sent/i,
        /reply.*sent/i,
        /sent.*reply/i,
        /send.*reply/i,
        /message.*sent/i
      ];

      // 从最新的日志向前查找
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const logEntry = JSON.parse(line);
          const logTime = logEntry.time ? new Date(logEntry.time).getTime() : null;
          const logMsg = (logEntry.message || logEntry.msg || logEntry.functionName || '').toLowerCase();

          if (!logTime) continue;

          // 检查是否是"收到消息"日志
          if (!lastMessageLogTime && messagePatterns.some(p => p.test(logMsg))) {
            lastMessageLogTime = logTime;
          }

          // 检查是否是"发送回复"日志
          if (!lastResponseLogTime && responsePatterns.some(p => p.test(logMsg))) {
            lastResponseLogTime = logTime;
          }

          // 找到两者后停止
          if (lastMessageLogTime && lastResponseLogTime) break;
        } catch (e) {
          // 非 JSON 格式的行，跳过
          continue;
        }
      }

      // 判断是否超时
      if (lastMessageLogTime && !lastResponseLogTime) {
        // 收到消息但没有回复
        const elapsed = Date.now() - lastMessageLogTime;
        const timeoutMs = timeoutConfig.timeoutMs || 5 * 60 * 1000;

        if (elapsed > timeoutMs) {
          logger.warn(`Message response timeout detected: ${Math.floor(elapsed / 60000)}min > ${Math.floor(timeoutMs / 60000)}min`);
          return {
            ok: false,
            reason: 'response_timeout',
            lastMessageTime: new Date(lastMessageLogTime),
            elapsedMs: elapsed
          };
        }
      }

      return {
        ok: true,
        reason: 'ok',
        lastMessageTime: lastMessageLogTime ? new Date(lastMessageLogTime) : null,
        lastResponseTime: lastResponseLogTime ? new Date(lastResponseLogTime) : null
      };
    } catch (err) {
      logger.error(`checkResponseTimeoutFromLogs error: ${err.message}`);
      return { ok: true, reason: 'error' };
    }
  }

  // 综合健康检查
  async checkHealth() {
    const apiOk = await this.checkAPI();
    const msgCheck = await this.checkMessageResponse();
    const timeoutCheck = await this.checkResponseTimeoutFromLogs();

    return {
      apiOk,
      messageOk: msgCheck.ok,
      timeoutOk: timeoutCheck.ok,
      lastActivity: msgCheck.lastActivity,
      idleMin: msgCheck.idleMin,
      healthy: apiOk && msgCheck.ok && timeoutCheck.ok,
      timeoutReason: timeoutCheck.reason,
      timeoutElapsed: timeoutCheck.elapsedMs
    };
  }

  async restartGateway(reason = 'unknown') {
    const now = Date.now();
    if (now - this.lastRestartTime < CONFIG.restart.cooldownPeriod) {
      logger.warn(MSG.restartCooldown);
      return false;
    }
    if (this.restartCount >= CONFIG.restart.maxRetries) {
      logger.error(MSG.restartMaxRetry);
      return false;
    }

    logger.warn(`Restarting OpenClaw - reason: ${reason}`);
    this.restartCount++;
    this.lastRestartTime = now;

    return new Promise((resolve) => {
      // 使用 nssm 重启服务（更可靠）
      exec(`"${CONFIG.nssm}" restart openclaw`, (err, stdout, stderr) => {
        if (err) {
          logger.error(`NSSM restart failed: ${err.message}`);
          // 备用方案：直接启动
          const ps = spawn('cmd', ['/c', 'start', '/min', 'cmd', '/c',
            'cd /d E:\\openclaw && node openclaw.mjs gateway start'
          ], { detached: true, stdio: 'ignore' });
          ps.unref();
        } else {
          logger.info('NSSM restart command sent');
        }
        setTimeout(() => resolve(true), 5000);
      });
    });
  }

  resetRestartCount() { this.restartCount = 0; }
}

module.exports = new HealthChecker();
