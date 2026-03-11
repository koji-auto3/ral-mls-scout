#!/bin/bash

echo ""
echo "🏠 RAL Scout — Setup"
echo "================================"
echo ""

echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
  echo "❌ npm install failed"
  exit 1
fi

echo ""
echo "================================"
echo "✅ Setup complete!"
echo ""
echo "To start the app, run:"
echo "  npm run dev"
echo ""
echo "Then open your browser to:"
echo "  http://localhost:3004"
echo ""
