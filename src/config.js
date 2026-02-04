/**
 * 皮皮监控工具 - 配置模块
 */
const fs = require('fs');
const path = require('path');

const CONFIG = {
  // OpenClaw 配置路径
  openclawConfig: 'E:\\openclaw\\.openclaw\\openclaw.json',
  
  // 日志路径
  sessionsDir: 'E:\\openclaw\\.openclaw\\agents\\main\\sessions',
  
  // OpenClaw 日志路径（Windows 备用路径）
  openclawLogDir: 'E:\\openclaw\\.openclaw\\logs',
  
  // 消息响应超时检测配置
  responseTimeout: {
    enabled: true,
    timeoutMs: 15 * 60 * 1000,  // 15分钟无响应超时
    checkIntervalMs: 60000,     // 每分钟检查一次
  },
  
  // 皮皮日志目录
  logsDir: 'E:\\pipi\\logs',
  
  // Gateway 设置
  gateway: {
    host: 'localhost',
    port: 18789,
    checkInterval: 60000,  // 60秒检查一次
    stuckThreshold: 180000,  // 3分钟无活动视为卡住
    stuckCountBeforeRestart: 2,  // 连续2次检测到卡住才重启
  },
  
  // NSSM 路径
  nssm: 'C:\\Users\\Administrator\\nssm\\nssm-2.24\\win64\\nssm.exe',
  
  // 重启设置
  restart: {
    maxRetries: 3,
    retryDelay: 5000,
    cooldownPeriod: 60000,
  },
  
  // 日志分析设置
  logAnalysis: {
    tailLines: 100,
    errorPatterns: [
      { pattern: /Invalid bearer token/i, type: '401_AUTH_ERROR' },
      { pattern: /EADDRINUSE/i, type: 'PORT_CONFLICT' },
      { pattern: /ECONNREFUSED/i, type: 'CONNECTION_REFUSED' },
      // 只匹配非零退出码的进程崩溃
      { pattern: /process exited with code [1-9]/i, type: 'PROCESS_CRASH' },
      { pattern: /restart loop/i, type: 'RESTART_LOOP' },
    ]
  },
  
  // 系统监控
  system: {
    cpuThreshold: 90,
    memoryThreshold: 90,
    checkInterval: 300000  // 5分钟检查一次
  },
  
  // 日志清理
  logCleanup: {
    maxDays: 7,
    maxSizeMB: 100
  }
};

module.exports = CONFIG;
