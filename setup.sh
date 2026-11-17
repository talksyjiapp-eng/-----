#!/bin/bash

# 1. Purane hanging processes ko kill karein
pkill -9 -f node 2>/dev/null || true

# 2. Codespaces port forwarding ko Public ensure karein
gh codespace ports visibility 3000:public 2>/dev/null || true

# 3. Server ko foreground me start karein
echo "Starting Cloud Vault Server on Port 3000..."
node server.js















