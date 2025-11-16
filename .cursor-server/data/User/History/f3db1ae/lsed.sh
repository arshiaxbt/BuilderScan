#!/bin/bash
# Watch for the next claim attempt

clear
echo "════════════════════════════════════════════════════════════"
echo "🎯 Watching for Next Claim Attempt"
echo "════════════════════════════════════════════════════════════"
echo ""

# Calculate next hour
CURRENT_UTC_HOUR=$(date -u +"%H")
NEXT_HOUR=$((10#$CURRENT_UTC_HOUR + 1))
NEXT_HOUR_24=$((NEXT_HOUR % 24))

echo "⏰ Next claim expected at: $(printf "%02d" $NEXT_HOUR_24):00 UTC"
echo "   Warmup:     $(printf "%02d" $NEXT_HOUR_24):59:50 UTC"
echo "   Burst:      $(printf "%02d" $NEXT_HOUR_24):59:58 UTC"
echo ""
echo "👀 Watching live output..."
echo "   (Press Ctrl+C to exit)"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Tail the output log
tail -f /root/itsbot/systemd_output.log



