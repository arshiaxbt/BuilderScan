#!/bin/bash
# Quick setup script for the Christmas bot

echo "🎄 Setting up Christmas Claim Bot..."

# Install dependencies
echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Usage:"
echo "  Standard version (optimized):  python3 main.py --offset 0"
echo "  Ultra-fast version (async):    python3 main_fast.py --offset 0"
echo ""
echo "💡 Tips for FCFS:"
echo "  - Use main_fast.py for maximum speed (10 concurrent attempts)"
echo "  - Use --offset to shift which wallet gets used each hour"
echo "  - Run multiple instances with different offsets on different servers"
echo "  - Check logs: advent_log_2_*.txt or advent_log_fast_*.txt"
echo ""

