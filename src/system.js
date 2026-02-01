/**
 * Pipi Monitor - System Monitor
 */
const os = require('os');
const logger = require('./logger');

class SystemMonitor {
  getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    
    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    return Math.round((1 - totalIdle / totalTick) * 100);
  }

  getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total: Math.round(total / 1024 / 1024 / 1024),
      used: Math.round(used / 1024 / 1024 / 1024),
      percent: Math.round(used / total * 100)
    };
  }

  check() {
    const cpu = this.getCpuUsage();
    const mem = this.getMemoryUsage();
    
    if (cpu > 90) {
      logger.warn(`CPU High: ${cpu}%`);
    }
    if (mem.percent > 90) {
      logger.warn(`Memory High: ${mem.percent}%`);
    }
    
    return { cpu, memory: mem };
  }
}

module.exports = new SystemMonitor();
