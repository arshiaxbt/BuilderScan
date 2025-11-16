# Deployment Guide - Kalshi Whale Bot

Complete guide for running the bot 24/7 in production.

---

## Quick Start (Tested & Working ✅)

```bash
cd /root/kalshi_whale_bot
python3 bot.py
```

That's it! The bot is now monitoring Kalshi for whale trades and posting to X.

---

## Background Execution

For 24/7 operation, you need to run the bot in the background so it continues even after you log out.

### Option 1: Using `nohup` (Simplest)

```bash
cd /root/kalshi_whale_bot
nohup python3 bot.py > bot.log 2>&1 &
echo $! > bot.pid
```

**Check if running:**
```bash
ps aux | grep bot.py
```

**View logs:**
```bash
tail -f bot.log
```

**Stop the bot:**
```bash
kill $(cat bot.pid)
```

---

### Option 2: Using `screen` (Recommended for Interactive)

**Install screen:**
```bash
apt install screen -y
```

**Start a screen session:**
```bash
screen -S kalshi_bot
```

**Inside screen, run the bot:**
```bash
cd /root/kalshi_whale_bot
python3 bot.py
```

**Detach from screen** (bot keeps running):
Press `Ctrl+A` then `D`

**Reattach to see bot output:**
```bash
screen -r kalshi_bot
```

**Stop the bot:**
Reattach and press `Ctrl+C`

---

### Option 3: Using `systemd` (Best for Production)

**1. Create systemd service file:**
```bash
sudo nano /etc/systemd/system/kalshi-whale-bot.service
```

**2. Add this content:**
```ini
[Unit]
Description=Kalshi Whale Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/kalshi_whale_bot
ExecStart=/usr/bin/python3 /root/kalshi_whale_bot/bot.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**3. Enable and start the service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable kalshi-whale-bot
sudo systemctl start kalshi-whale-bot
```

**4. Check status:**
```bash
sudo systemctl status kalshi-whale-bot
```

**5. View logs:**
```bash
sudo journalctl -u kalshi-whale-bot -f
```

**6. Stop the bot:**
```bash
sudo systemctl stop kalshi-whale-bot
```

**7. Disable auto-start:**
```bash
sudo systemctl disable kalshi-whale-bot
```

---

## Monitoring

### Check Bot Status

```bash
# Using nohup
ps aux | grep bot.py

# Using screen
screen -ls

# Using systemd
sudo systemctl status kalshi-whale-bot
```

### View Logs

```bash
# Using nohup
tail -f bot.log

# Using screen
screen -r kalshi_bot

# Using systemd
sudo journalctl -u kalshi-whale-bot -f
```

### Check Posted Tweets

Visit: https://x.com/ValshiBot

---

## Troubleshooting

### Bot Not Starting

**Check Python version:**
```bash
python3 --version  # Should be 3.8+
```

**Check dependencies:**
```bash
pip3 list | grep -E "requests|tweepy|cryptography|python-dotenv"
```

**Test API connections:**
```bash
cd /root/kalshi_whale_bot
python3 test_connection.py
```

### Bot Crashes

**Check logs for errors:**
```bash
# nohup
tail -100 bot.log

# systemd  
sudo journalctl -u kalshi-whale-bot -n 100
```

**Common issues:**
- API rate limits exceeded
- Network connectivity issues
- Invalid credentials

**Solution:** The bot will auto-recover on next cycle

### No Trades Detected

**This is normal!** Whale trades over $100K are relatively rare on Kalshi.

**To test with more activity:**
1. Edit `/root/kalshi_whale_bot/credentials.py`
2. Change `WHALE_THRESHOLD_DOLLARS` to `"1000"` or `"10000"`
3. Restart the bot

### API Connection Errors

**Kalshi API issues:**
```bash
curl -I https://api.elections.kalshi.com/trade-api/v2/exchange/status
```

**X API issues:**
- Check if API keys are still valid
- Verify app hasn't been suspended
- Check rate limits

---

## Updates & Maintenance

### Update Dependencies

```bash
cd /root/kalshi_whale_bot
pip3 install --upgrade -r requirements.txt --break-system-packages
```

### Update Bot Code

If you make changes to the bot:

```bash
# nohup: Kill and restart
kill $(cat bot.pid)
nohup python3 bot.py > bot.log 2>&1 &

# screen: Reattach and Ctrl+C, then restart
screen -r kalshi_bot
# Press Ctrl+C
python3 bot.py

# systemd: Just restart
sudo systemctl restart kalshi-whale-bot
```

### Backup Configuration

```bash
cp /root/kalshi_whale_bot/credentials.py /root/credentials.backup.py
```

---

## Performance Optimization

### Reduce Check Interval

For faster detection (more API calls):

```python
# In credentials.py
os.environ["CHECK_INTERVAL_SECONDS"] = "30"  # Check every 30s
```

### Increase Check Interval

To reduce API load:

```python
# In credentials.py
os.environ["CHECK_INTERVAL_SECONDS"] = "120"  # Check every 2 minutes
```

### Log Rotation

Prevent log files from getting too large:

```bash
# Install logrotate config
sudo nano /etc/logrotate.d/kalshi-bot
```

Add:
```
/root/kalshi_whale_bot/bot.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

---

## Security Best Practices

### 1. Protect Credentials

```bash
chmod 600 /root/kalshi_whale_bot/credentials.py
```

### 2. Regular Key Rotation

- Rotate API keys every 90 days
- Never share or commit keys to public repos

### 3. Monitor Bot Activity

- Check X account regularly for posts
- Review logs for suspicious activity
- Monitor API usage

---

## Resource Usage

**Expected:**
- CPU: < 1% (mostly idle, waiting)
- Memory: 20-50 MB
- Network: ~1-5 MB/day (API calls)
- Disk: Logs grow ~1-10 MB/day (depends on activity)

---

## Support Checklist

Before asking for help, verify:

- [ ] Bot starts without errors
- [ ] API connections test successfully (`python3 test_connection.py`)
- [ ] Credentials are correct in `credentials.py`
- [ ] Internet connection is working
- [ ] Python 3.8+ is installed
- [ ] All dependencies are installed
- [ ] Logs show what's happening

---

## Production Checklist

Before deploying 24/7:

- [ ] Test bot runs successfully
- [ ] API connections verified
- [ ] Posted test tweets successfully
- [ ] Adjusted whale threshold as needed
- [ ] Set up background execution (nohup/screen/systemd)
- [ ] Configured log rotation
- [ ] Backed up credentials
- [ ] Documented any custom changes
- [ ] Set up monitoring/alerts (optional)

---

## Quick Commands Reference

```bash
# Start bot (foreground)
python3 bot.py

# Start bot (background with nohup)
nohup python3 bot.py > bot.log 2>&1 &

# View logs
tail -f bot.log

# Check if running
ps aux | grep bot.py

# Stop bot
kill $(pgrep -f bot.py)

# Test APIs
python3 test_connection.py

# Start with systemd
sudo systemctl start kalshi-whale-bot

# View systemd logs
sudo journalctl -u kalshi-whale-bot -f
```

---

**Status**: 🟢 Production Ready  
**Tested**: ✅ November 7, 2025  
**Deployment Method**: All three options tested and working

