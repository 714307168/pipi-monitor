const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const logger = require('./logger');
const MSG = logger.MSG;

class LogAnalyzer {
  constructor() {
    this.errorCounts = {};
  }

  getLatestLogFile() {
    const files = fs.readdirSync(CONFIG.sessionsDir)
      .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted'))
      .map(f => ({
        name: f,
        path: path.join(CONFIG.sessionsDir, f),
        mtime: fs.statSync(path.join(CONFIG.sessionsDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0]?.path || null;
  }

  readTail(filePath, lines = 100) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.trim().split('\n').slice(-lines);
  }

  analyzeErrors(lines) {
    const errors = [];
    for (const line of lines) {
      for (const { pattern, type } of CONFIG.logAnalysis.errorPatterns) {
        if (pattern.test(line)) {
          errors.push({ type, line: line.substring(0, 200) });
          this.errorCounts[type] = (this.errorCounts[type] || 0) + 1;
        }
      }
    }
    return errors;
  }

  analyze() {
    const logFile = this.getLatestLogFile();
    if (!logFile) {
      logger.warn(MSG.noLogFile);
      return { errors: [], file: null };
    }
    const lines = this.readTail(logFile, CONFIG.logAnalysis.tailLines);
    const errors = this.analyzeErrors(lines);
    if (errors.length > 0) {
      logger.warn(`${MSG.foundErrors}: ${errors.length}`, { types: Object.keys(this.errorCounts) });
    }
    return { errors, file: logFile, counts: this.errorCounts };
  }
}

module.exports = new LogAnalyzer();
