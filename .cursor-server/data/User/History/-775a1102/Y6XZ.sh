#!/bin/bash
# Real-time monitoring script for Christmas bot

echo "🎄 Christmas Bot - Live Monitor"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if bot is running
if ! systemctl is-active --quiet christmas-bot.service; then
    echo "❌ BOT IS NOT RUNNING!"
    echo "Start it with: systemctl start christmas-bot.service"
    exit 1
fi

echo "✅ Bot Status: RUNNING"
echo ""

# Show current time
NOW_UTC=$(date -u +"%H:%M:%S")
NOW_LOCAL=$(date +"%H:%M:%S %Z")
HOUR_UTC=$(date -u +"%H")
NEXT_HOUR=$((10#$HOUR_UTC + 1))

echo "🕐 Current Time:"
echo "   Local: $NOW_LOCAL"
echo "   UTC:   $NOW_UTC"
echo ""
echo "⏰ Next Claim:"
echo "   Warming: $(printf "%02d" $NEXT_HOUR):59:50 UTC"
echo "   Burst:   $(printf "%02d" $NEXT_HOUR):59:58 UTC"
echo "   End:     $(printf "%02d" $NEXT_HOUR):00:10 UTC"
echo ""

# Show configured wallets
echo "💰 Configured Wallets:"
grep -A 4 "WALLETS.*=" /root/itsbot/main_fast.py | grep "0x" | head -4 | nl -w2 -s". "
echo ""

# Show recent bot output
echo "📋 Recent Bot Output (last 10 lines):"
echo "───────────────────────────────────────────────────────────"
tail -10 /root/itsbot/systemd_output.log 2>/dev/null || echo "No output yet..."
echo ""

# Show claim logs if they exist
if [ -f /root/itsbot/advent_log_fast_0.txt ]; then
    echo "🎯 Recent Claims (last 5):"
    echo "───────────────────────────────────────────────────────────"
    tail -5 /root/itsbot/advent_log_fast_0.txt
    echo ""
    
    # Count successful claims
    SUCCESS_COUNT=$(grep -c "Successfully claimed" /root/itsbot/advent_log_fast_0.txt 2>/dev/null || echo "0")
    TOTAL_COUNT=$(grep -c "hour=" /root/itsbot/advent_log_fast_0.txt 2>/dev/null || echo "0")
    echo "📊 Statistics:"
    echo "   Total Attempts: $TOTAL_COUNT"
    echo "   Successful: $SUCCESS_COUNT"
else
    echo "ℹ️  No claims yet - bot is waiting for next hour"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Commands:"
echo "  Watch live:    tail -f /root/itsbot/systemd_output.log"
echo "  View claims:   tail -f /root/itsbot/advent_log_fast_0.txt"
echo "  Full logs:     journalctl -u christmas-bot.service -f"
echo "  Restart bot:   systemctl restart christmas-bot.service"




