/**
 * 皮皮监控工具 - 配置管理模块
 */
const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const logger = require('./logger');

class ConfigManager {
  constructor() {
    this.config = null;
    this.lastModified = 0;
    this.backupDir = 'E:\\pipi\\backup';
    this.maxBackupVersions = 5;
  }

  // 加载配置
  load() {
    try {
      const content = fs.readFileSync(CONFIG.openclawConfig, 'utf-8');
      this.config = JSON.parse(content);
      this.lastModified = fs.statSync(CONFIG.openclawConfig).mtime.getTime();
      return this.config;
    } catch (err) {
      logger.error('加载配置失败', { error: err.message });
      return null;
    }
  }

  // 检查配置是否变更
  hasChanged() {
    try {
      const mtime = fs.statSync(CONFIG.openclawConfig).mtime.getTime();
      return mtime > this.lastModified;
    } catch {
      return false;
    }
  }

  // 获取当前模型
  getCurrentModel() {
    if (!this.config) this.load();
    return this.config?.agents?.defaults?.model?.primary || 'unknown';
  }

  // 获取 Gateway 端口
  getGatewayPort() {
    if (!this.config) this.load();
    return this.config?.gateway?.port || 18789;
  }

  // 确保备份目录存在
  ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      logger.info('创建备份目录', { path: this.backupDir });
    }
  }

  // 备份配置文件
  backup() {
    try {
      this.ensureBackupDir();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `openclaw.json.${timestamp}.backup`);
      const latestBackup = path.join(this.backupDir, 'openclaw.json.backup');
      
      // 读取当前配置
      const content = fs.readFileSync(CONFIG.openclawConfig, 'utf-8');
      
      // 保存带时间戳的版本
      fs.writeFileSync(backupFile, content, 'utf-8');
      
      // 保存最新备份
      fs.writeFileSync(latestBackup, content, 'utf-8');
      
      logger.info('配置备份成功', { file: backupFile });
      
      // 清理旧版本
      this.cleanOldBackups();
      
      return backupFile;
    } catch (err) {
      logger.error('配置备份失败', { error: err.message });
      return null;
    }
  }

  // 清理旧备份，保留最近 N 个版本
  cleanOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.match(/^openclaw\.json\.\d{4}-\d{2}.*\.backup$/))
        .sort()
        .reverse();
      
      if (files.length > this.maxBackupVersions) {
        const toDelete = files.slice(this.maxBackupVersions);
        toDelete.forEach(f => {
          fs.unlinkSync(path.join(this.backupDir, f));
          logger.info('删除旧备份', { file: f });
        });
      }
    } catch (err) {
      logger.warn('清理旧备份失败', { error: err.message });
    }
  }

  // 恢复配置（从最新备份）
  restore() {
    const latestBackup = path.join(this.backupDir, 'openclaw.json.backup');
    return this.restoreFrom(latestBackup);
  }

  // 从指定文件恢复配置
  restoreFrom(backupFile) {
    try {
      if (!fs.existsSync(backupFile)) {
        logger.error('备份文件不存在', { file: backupFile });
        return false;
      }
      
      const content = fs.readFileSync(backupFile, 'utf-8');
      
      // 验证 JSON 格式
      JSON.parse(content);
      
      // 写入配置文件
      fs.writeFileSync(CONFIG.openclawConfig, content, 'utf-8');
      
      logger.info('配置恢复成功', { from: backupFile });
      
      // 重新加载
      this.load();
      
      return true;
    } catch (err) {
      logger.error('配置恢复失败', { error: err.message });
      return false;
    }
  }

  // 列出所有备份版本
  listBackups() {
    try {
      this.ensureBackupDir();
      
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.includes('openclaw.json') && f.endsWith('.backup'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.statSync(path.join(this.backupDir, f)).mtime
        }))
        .sort((a, b) => b.time - a.time);
      
      return files;
    } catch (err) {
      logger.error('列出备份失败', { error: err.message });
      return [];
    }
  }
}

module.exports = new ConfigManager();
