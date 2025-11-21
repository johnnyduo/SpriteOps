#!/bin/bash

# ASLAN AGENTS Quick Setup Script
# This script helps you set up the project quickly

echo "🦁 ASLAN AGENTS Quick Setup"
echo "========================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "✅ .env.local file already exists"
else
    echo "📝 Creating .env.local from template..."
    if [ -f ".env.local.example" ]; then
        cp .env.local.example .env.local
        echo "✅ .env.local created! Please edit it with your API keys."
        echo ""
        echo "⚠️  IMPORTANT: Add your API keys to .env.local before running!"
        echo ""
        echo "   Get your keys from:"
        echo "   - Gemini AI: https://makersuite.google.com/app/apikey"
        echo "   - TwelveData: https://twelvedata.com/apikey"
        echo "   - News API: https://newsapi.org/register"
        echo ""
    else
        echo "❌ .env.local.example not found!"
        exit 1
    fi
fi

# Check if node_modules exists
if [ -d "node_modules" ]; then
    echo "✅ Dependencies already installed"
else
    echo "📦 Installing dependencies..."
    yarn install
    if [ $? -eq 0 ]; then
        echo "✅ Dependencies installed successfully"
    else
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

echo ""
echo "========================"
echo "✨ Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env.local with your API keys"
echo "2. Run: npm run dev"
echo "3. Open: http://localhost:3000"
echo "4. In browser console, run: testAPIs()"
echo ""
echo "📚 Read SETUP.md for detailed instructions"
echo "========================"
