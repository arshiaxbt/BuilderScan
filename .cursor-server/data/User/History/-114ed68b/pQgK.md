# 🎄 Christmas Bot - SystemD Setup Complete!

## ✅ Installation Summary

Your bot is now running as a **systemd service** with the following setup:

- **Service Name**: `christmas-bot.service`
- **Bot Version**: Ultra-fast async (main_fast.py)
- **Auto-start**: ✅ Enabled (starts on boot)
- **Auto-restart**: ✅ Enabled (restarts if crashed)
- **Status**: 🟢 Running
- **Priority**: High (Nice -10, Realtime I/O)

## 🎮 Quick Control Commands

### Easy Way (Use the control script):
```bash
/root/itsbot/bot-control.sh status    # Check if running
/root/itsbot/bot-control.sh logs      # Watch live logs
/root/itsbot/bot-control.sh watch     # Watch claim attempts
/root/itsbot/bot-control.sh restart   # Restart bot
/root/itsbot/bot-control.sh stop      # Stop bot
/root/itsbot/bot-control.sh start     # Start bot
```

### Direct SystemD Commands:
```bash
systemctl status christmas-bot    # Check status
systemctl restart christmas-bot   # Restart
systemctl stop christmas-bot      # Stop
systemctl start christmas-bot     # Start
journalctl -u christmas-bot -f    # Live logs
```

## 📊 Monitoring

### Check if Bot is Running:
```bash
systemctl status christmas-bot
```

### Watch Live System Logs:
```bash
journalctl -u christmas-bot -f
```

### Watch Claim Attempt Logs:
```bash
tail -f /root/itsbot/advent_log_fast_0.txt
```

### Check Recent Claims:
```bash
tail -50 /root/itsbot/advent_log_fast_0.txt | grep "Successfully claimed"
```

## 📁 Log Files

- **System logs**: `journalctl -u christmas-bot`
- **Bot output**: `/root/itsbot/bot_output.log`
- **Bot errors**: `/root/itsbot/bot_error.log`
- **Claim logs**: `/root/itsbot/advent_log_fast_0.txt`

## ⚙️ Service Configuration

**Service File**: `/etc/systemd/system/christmas-bot.service`

**Features**:
- Automatic restart on failure (10 sec delay)
- High priority scheduling (Nice -10)
- Realtime I/O priority
- Starts after network is online
- All output logged

## 🔧 Management

### Edit Wallets:
```bash
nano /root/itsbot/main_fast.py
# Edit the WALLETS array
systemctl restart christmas-bot
```

### Change Offset:
```bash
nano /etc/systemd/system/christmas-bot.service
# Change --offset 0 to desired offset
systemctl daemon-reload
systemctl restart christmas-bot
```

### Disable Auto-start:
```bash
systemctl disable christmas-bot
```

### Enable Auto-start:
```bash
systemctl enable christmas-bot
```

### Remove Service:
```bash
systemctl stop christmas-bot
systemctl disable christmas-bot
rm /etc/systemd/system/christmas-bot.service
systemctl daemon-reload
```

## 🚀 Performance

The bot is configured with:
- **10 concurrent requests** per claim attempt
- **High CPU priority** (Nice -10)
- **Realtime I/O** scheduling
- **Auto-restart** on any failure
- **Network-wait** ensures connectivity

## 🎯 What's Happening Now?

The bot is:
1. ✅ Running in the background
2. ⏰ Waiting for the next hour mark
3. 🔥 Will warm connections at XX:59:50
4. ⚡ Will burst claim at XX:59:58 with 10 concurrent attempts
5. 📝 Logging all attempts to `advent_log_fast_0.txt`
6. 🔄 Will automatically restart if it crashes

## 💡 Pro Tips

1. **Monitor success**: 
   ```bash
   watch -n 5 'tail -1 /root/itsbot/advent_log_fast_0.txt'
   ```

2. **Get success count**:
   ```bash
   grep "Successfully claimed" /root/itsbot/advent_log_fast_0.txt | wc -l
   ```

3. **Check errors**:
   ```bash
   grep "error=" /root/itsbot/advent_log_fast_0.txt | tail -20
   ```

4. **Run multiple instances** (different offsets):
   - Edit service file to create `christmas-bot@.service` template
   - Or manually create `christmas-bot-2.service` with offset 4

## 🆘 Troubleshooting

**Bot not running?**
```bash
systemctl status christmas-bot
journalctl -u christmas-bot -n 50
```

**Not claiming?**
- Check wallets are valid
- Verify network connectivity
- Check claim logs for errors

**Restart after config change:**
```bash
systemctl restart christmas-bot
```

## ✨ You're All Set!

Your bot is running and will automatically:
- ✅ Start on boot
- ✅ Restart on failure
- ✅ Claim every hour
- ✅ Log all activity

Monitor with: `/root/itsbot/bot-control.sh status`

---
**Service Status**: 🟢 Active and running
**Auto-start**: ✅ Enabled
**Current Time**: Check with `date`
**Next Claim**: Next hour (XX:00)

