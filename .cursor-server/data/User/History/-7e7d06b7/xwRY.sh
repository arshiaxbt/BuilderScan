#!/bin/bash
# Christmas Bot Management Script

case "$1" in
    start)
        echo "🚀 Starting Christmas bot..."
        systemctl start christmas-bot.service
        sleep 2
        systemctl status christmas-bot.service --no-pager
        ;;
    stop)
        echo "🛑 Stopping Christmas bot..."
        systemctl stop christmas-bot.service
        echo "✅ Bot stopped"
        ;;
    restart)
        echo "🔄 Restarting Christmas bot..."
        systemctl restart christmas-bot.service
        sleep 2
        systemctl status christmas-bot.service --no-pager
        ;;
    status)
        echo "📊 Bot Status:"
        systemctl status christmas-bot.service --no-pager
        echo ""
        echo "💾 Memory Usage:"
        ps aux | grep main_fast.py | grep -v grep | awk '{print "  CPU: "$3"% | Memory: "$4"% | PID: "$2}'
        ;;
    logs)
        echo "📋 Live Bot Logs (Ctrl+C to exit):"
        journalctl -u christmas-bot.service -f
        ;;
    claims)
        echo "🎯 Claim Logs:"
        if [ -f /root/itsbot/advent_log_fast_0.txt ]; then
            tail -50 /root/itsbot/advent_log_fast_0.txt
        else
            echo "No claims yet - bot is waiting for the next hour"
        fi
        ;;
    enable)
        echo "⚡ Enabling auto-start on boot..."
        systemctl enable christmas-bot.service
        echo "✅ Bot will start automatically on system boot"
        ;;
    disable)
        echo "❌ Disabling auto-start..."
        systemctl disable christmas-bot.service
        echo "✅ Auto-start disabled"
        ;;
    stats)
        echo "📊 Bot Statistics:"
        echo ""
        echo "Service Status:"
        systemctl is-active christmas-bot.service
        echo ""
        if [ -f /root/itsbot/advent_log_fast_0.txt ]; then
            echo "Total Claim Attempts:"
            grep -c "hour=" /root/itsbot/advent_log_fast_0.txt || echo "0"
            echo ""
            echo "Successful Claims:"
            grep -c "Successfully claimed" /root/itsbot/advent_log_fast_0.txt || echo "0"
            echo ""
            echo "Recent Claims:"
            grep "Successfully claimed" /root/itsbot/advent_log_fast_0.txt | tail -5 || echo "None yet"
        else
            echo "No claims yet - waiting for next hour"
        fi
        ;;
    *)
        echo "🎄 Christmas Bot Manager"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs|claims|enable|disable|stats}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the bot"
        echo "  stop     - Stop the bot"
        echo "  restart  - Restart the bot"
        echo "  status   - Show bot status and resource usage"
        echo "  logs     - Show live systemd logs"
        echo "  claims   - Show claim attempt logs"
        echo "  enable   - Enable auto-start on boot"
        echo "  disable  - Disable auto-start"
        echo "  stats    - Show claim statistics"
        echo ""
        echo "Current Status:"
        if systemctl is-active --quiet christmas-bot.service; then
            echo "  ✅ Bot is RUNNING"
        else
            echo "  ❌ Bot is STOPPED"
        fi
        if systemctl is-enabled --quiet christmas-bot.service; then
            echo "  ⚡ Auto-start: ENABLED"
        else
            echo "  ⭕ Auto-start: DISABLED"
        fi
        ;;
esac

