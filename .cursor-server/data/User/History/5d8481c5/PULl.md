# 🎄 Christmas Bot - Systemd Service

## ✅ Service Status: RUNNING

The Christmas bot is now running as a systemd service with these benefits:
- **Auto-starts** on system boot
- **Auto-restarts** if it crashes
- **High priority** scheduling for faster performance
- **Managed logs** through systemd

## 📋 Quick Commands

### Using the Management Script (Recommended)
```bash
/root/itsbot/manage.sh status    # Check bot status
/root/itsbot/manage.sh logs      # View live logs
/root/itsbot/manage.sh claims    # View claim logs
/root/itsbot/manage.sh stats     # View statistics
/root/itsbot/manage.sh restart   # Restart bot
/root/itsbot/manage.sh stop      # Stop bot
/root/itsbot/manage.sh start     # Start bot
```

### Direct Systemd Commands
```bash
# Service management
systemctl status christmas-bot.service
systemctl restart christmas-bot.service
systemctl stop christmas-bot.service
systemctl start christmas-bot.service

# Logs
journalctl -u christmas-bot.service -f        # Live logs
journalctl -u christmas-bot.service -n 100    # Last 100 lines

# Auto-start
systemctl enable christmas-bot.service        # Enable auto-start
systemctl disable christmas-bot.service       # Disable auto-start
```

## 📊 Service Details

**Service Name:** `christmas-bot.service`
**Service Type:** Ultra-Fast FCFS (main_fast.py)
**Working Directory:** `/root/itsbot`
**Wallet Offset:** 0
**Priority:** High (Nice: -10, Realtime I/O)

**Auto-start:** ✅ Enabled
**Auto-restart:** ✅ Enabled (10 second delay)
**Current Status:** 🟢 Running

## 📁 Log Files

### Systemd Logs
- **Output:** `/root/itsbot/systemd_output.log`
- **Errors:** `/root/itsbot/systemd_error.log`

### Bot Claim Logs
- **Claims:** `/root/itsbot/advent_log_fast_0.txt`

View claim logs:
```bash
tail -f /root/itsbot/advent_log_fast_0.txt
```

## 🎯 What the Bot Does

1. **Waits** for the next hour (XX:59:50)
2. **Warms** connections at XX:59:50
3. **Starts burst** at XX:59:58 (2 seconds early)
4. **Fires 10 concurrent requests** simultaneously
5. **Continues** until XX:00:10 for retries
6. **Logs** all attempts to claim logs

## 🔧 Configuration

### Change Wallet Offset
Edit the service file:
```bash
nano /etc/systemd/system/christmas-bot.service
```
Change: `ExecStart=/usr/bin/python3 /root/itsbot/main_fast.py --offset 0`
To: `ExecStart=/usr/bin/python3 /root/itsbot/main_fast.py --offset 1`

Then reload:
```bash
systemctl daemon-reload
systemctl restart christmas-bot.service
```

### Add More Wallets
Edit the wallet list:
```bash
nano /root/itsbot/main_fast.py
```
Find the `WALLETS` array and add addresses.

Then restart:
```bash
systemctl restart christmas-bot.service
```

## 🚀 Running Multiple Instances

Want to run multiple offsets simultaneously? Create additional services:

```bash
# Copy service file
cp /etc/systemd/system/christmas-bot.service \
   /etc/systemd/system/christmas-bot-offset1.service

# Edit the new service
nano /etc/systemd/system/christmas-bot-offset1.service
```

Change:
- Description to include offset number
- `--offset 0` to `--offset 1`
- Log file names to avoid conflicts

Then:
```bash
systemctl daemon-reload
systemctl enable christmas-bot-offset1.service
systemctl start christmas-bot-offset1.service
```

## 🔍 Monitoring

### Real-time Status Dashboard
```bash
watch -n 1 "/root/itsbot/manage.sh status"
```

### Check Resource Usage
```bash
systemctl status christmas-bot.service
```

### View Success Rate
```bash
/root/itsbot/manage.sh stats
```

## 🐛 Troubleshooting

### Bot Not Starting
```bash
# Check logs for errors
journalctl -u christmas-bot.service -n 50

# Verify Python and dependencies
python3 /root/itsbot/main_fast.py --offset 0
```

### No Claims Showing
- **Normal!** Bot only claims once per hour
- Claims happen at the top of each hour
- Check: `tail -f /root/itsbot/advent_log_fast_0.txt`

### Service Crashes
- Auto-restart is enabled (10 second delay)
- Check error logs: `journalctl -u christmas-bot.service -p err`

### High CPU Usage
- **Normal during burst!** (XX:59:58 - XX:00:10)
- Should be low CPU rest of the time

## 📈 Performance Optimizations Applied

✅ **Nice value: -10** (higher CPU priority)
✅ **Realtime I/O scheduling** (priority 0)
✅ **Auto-restart on failure**
✅ **Network-online.target** (waits for network)
✅ **10 concurrent requests** per claim
✅ **Connection pooling** (20 connections)
✅ **DNS caching** (5 minutes)

## 🎄 You're All Set!

The bot is running and will automatically claim at the top of each hour.
Monitor it with: `/root/itsbot/manage.sh logs`

Good luck with your claims! 🚀

