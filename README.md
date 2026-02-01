# 皮皮监控 (PiPi Monitor)

🐣 OpenClaw Gateway 健康监控工具

## 功能特性

- ✅ **健康检查** - 每30秒检测 Gateway API 状态
- ✅ **自动重启** - 检测到挂掉自动拉起
- ✅ **系统监控** - CPU/内存使用率监控
- ✅ **日志分析** - 识别常见错误模式
- ✅ **配置管理** - 自动备份、支持恢复

## 安装

```bash
cd E:\pipi\workspace\pipi-monitor
npm install
```

## 使用

### 开发模式
```bash
npm start
```

### 打包
```bash
npm run build
```

### 注册 Windows 服务
```powershell
nssm install PipiMonitor "E:\pipi\workspace\pipi-monitor\dist\pimonitor.exe"
nssm set PipiMonitor AppDirectory "E:\pipi\workspace\pipi-monitor"
net start PipiMonitor
```

## 配置

编辑 `src/config.js`：

```javascript
{
  gateway: {
    host: 'localhost',
    port: 18789,
    checkInterval: 30000  // 检查间隔（毫秒）
  },
  restart: {
    maxRetries: 3,        // 最大重试次数
    cooldownPeriod: 60000 // 冷却期（毫秒）
  }
}
```

## 日志

日志位置：`E:\pipi\logs\pipi-YYYY-MM-DD.log`

## License

MIT
