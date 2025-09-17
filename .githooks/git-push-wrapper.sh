#!/bin/bash

# Git push wrapper that prevents bypassing hooks
# This ensures that --no-verify cannot be used to skip our tests

if [[ "$*" == *"--no-verify"* ]]; then
    echo -e "\033[0;31m❌ ERROR: --no-verify is not allowed\033[0m"
    echo -e "\033[0;31m🚫 Push protection cannot be bypassed\033[0m"
    echo -e "\033[1;33m💡 Fix the failing tests instead of bypassing them\033[0m"
    echo ""
    echo -e "\033[0;34mTo see what's failing, run:\033[0m"
    echo -e "\033[0;34m  npm run test:vercel-preview\033[0m"
    echo ""
    echo -e "\033[1;31m🚨 REMEMBER: These tests prevent broken deployments in production!\033[0m"
    echo -e "\033[1;31m   Bypassing them could break the live site for users.\033[0m"
    echo ""
    exit 1
fi

# Call the real git with all arguments
exec /usr/bin/git "$@"