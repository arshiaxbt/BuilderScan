#!/bin/bash
# Christmas Bot Control Script

case "$1" in
    start)
        echo "🚀 Starting Christmas bot..."
        systemctl start christmas-bot.service
        echo "✅ Bot started!"
        ;;
    stop)
        echo "🛑 Stopping Christmas bot..."
        systemctl stop christmas-bot.service
        echo "✅ Bot stopped!"
        ;;
    restart)
        echo "🔄 Restarting Christmas bot..."
        systemctl restart christmas-bot.service
        echo "✅ Bot restarted!"
        ;;
    status)
        echo "📊 Bot Status:"
        systemctl status christmas-bot.service --no-pager
        ;;
    logs)
        echo "📜 Recent logs (Ctrl+C to exit):"
        journalctl -u christmas-bot.service -f
        ;;
    logs-all)
        echo "📜 All logs:"
        journalctl -u christmas-bot.service --no-pager
        ;;
    claim-logs)
        echo "📋 Claim attempt logs:"
        if [ -f /root/itsbot/advent_log_fast_0.txt ]; then
            tail -50 /root/itsbot/advent_log_fast_0.txt
        else
            echo "No claim logs yet."
        fi
        ;;
    watch)
        echo "👀 Watching claim logs (Ctrl+C to exit):"
        tail -f /root/itsbot/advent_log_fast_0.txt
        ;;
    enable)
        echo "⚙️  Enabling auto-start on boot..."
        systemctl enable christmas-bot.service
        echo "✅ Auto-start enabled!"
        ;;
    disable)
        echo "⚙️  Disabling auto-start on boot..."
        systemctl disable christmas-bot.service
        echo "✅ Auto-start disabled!"
        ;;
    *)
        echo "🎄 Christmas Bot Control"
        echo ""
        echo "Usage: $0 {command}"
        echo ""
        echo "Commands:"
        echo "  start       - Start the bot"
        echo "  stop        - Stop the bot"
        echo "  restart     - Restart the bot"
        echo "  status      - Show bot status"
        echo "  logs        - Show live systemd logs"
        echo "  logs-all    - Show all systemd logs"
        echo "  claim-logs  - Show recent claim attempts"
        echo "  watch       - Watch claim logs in real-time"
        echo "  enable      - Enable auto-start on boot"
        echo "  disable     - Disable auto-start on boot"
        echo ""
        echo "Examples:"
        echo "  $0 status"
        echo "  $0 watch"
        echo "  $0 restart"
        exit 1
        ;;
esac

