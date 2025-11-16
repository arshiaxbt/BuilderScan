#!/bin/bash
# Setup script for Kalshi Whale Bot

echo "🐋 Setting up Kalshi Whale Bot..."
echo ""

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✓ Found Python $PYTHON_VERSION"

# Create virtual environment (optional but recommended)
read -p "Create a virtual environment? (recommended) [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
    echo ""
    echo "To activate it, run:"
    echo "  source venv/bin/activate"
    echo ""
fi

# Install dependencies
echo "Installing dependencies..."
if [ -d "venv" ]; then
    source venv/bin/activate
fi

pip install -r requirements.txt

if [ $? -eq 0 ]; then
    echo "✓ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "✓ Setup complete!"
echo ""
echo "To run the bot:"
echo "  python bot.py"
echo ""
echo "To stop the bot, press Ctrl+C"
echo ""

