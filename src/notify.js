/**
 * Pipi Monitor - DingTalk Notification
 */
const https = require('https');
const CONFIG = require('./config');

class Notifier {
  constructor() {
    this.webhookUrl = CONFIG.dingtalk?.webhook || null;
  }

  async send(title, content) {
    if (!this.webhookUrl) return false;
    
    const data = JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        title: title,
        text: `## ${title}\n\n${content}\n\n> PiPi Monitor`
      }
    });

    return new Promise((resolve) => {
      const url = new URL(this.webhookUrl);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      
      req.on('error', () => resolve(false));
      req.write(data);
      req.end();
    });
  }

  async alertDown() {
    return this.send('OpenClaw Down', 'OpenClaw Gateway is down, restarting...');
  }

  async alertUp() {
    return this.send('OpenClaw Up', 'OpenClaw Gateway is back online!');
  }

  async alertError(error) {
    return this.send('OpenClaw Error', `Error: ${error}`);
  }
}

module.exports = new Notifier();
