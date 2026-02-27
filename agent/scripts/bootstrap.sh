#!/bin/bash
# Bootstrap script for installing ACP and this package in one command
# Usage: curl -fsSL https://github.com/{owner}/{repo}/raw/{branch}/agent/scripts/bootstrap.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BOLD}  ACP Package Bootstrap${NC}"
echo "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if ACP is already installed
if [ ! -f "AGENT.md" ] || [ ! -d "agent" ]; then
    echo "${BLUE}Installing ACP...${NC}"
    echo ""
    
    # Install ACP
    curl -fsSL https://raw.githubusercontent.com/prmichaelsen/agent-context-protocol/mainline/agent/scripts/acp.install.sh | bash
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "${GREEN}✓${NC} ACP installed successfully"
        echo ""
    else
        echo ""
        echo "${RED}✗${NC} ACP installation failed"
        exit 1
    fi
else
    echo "${GREEN}✓${NC} ACP already installed"
    echo ""
fi

# Install this package
echo "${BLUE}Installing core-sdk package...${NC}"
echo ""

# Install package using acp.package-install.sh
if [ -f "./agent/scripts/acp.package-install.sh" ]; then
    ./agent/scripts/acp.package-install.sh https://github.com/prmichaelsen/acp-core-sdk.git
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "${GREEN}✓${NC} core-sdk package installed successfully"
        echo ""
    else
        echo ""
        echo "${RED}✗${NC} Package installation failed"
        exit 1
    fi
else
    echo "${RED}✗${NC} ACP installation script not found"
    echo "Please ensure ACP is properly installed"
    exit 1
fi

echo ""
echo "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${GREEN}✓${NC} ${BOLD}Bootstrap Complete!${NC}"
echo "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Your project is now set up with:"
echo "  • ACP (Agent Context Protocol)"
echo "  • core-sdk package"
echo ""
echo "Next steps:"
echo "  1. Run: @acp.init"
echo "  2. Start working with your AI agent"
echo ""
