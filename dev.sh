#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════╗"
echo "║   Casa Financeira - Development Mode   ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if Docker containers are running
echo -e "${YELLOW}Checking Docker containers...${NC}"
if ! docker-compose ps | grep -q "postgres"; then
    echo -e "${YELLOW}Starting Docker containers...${NC}"
    docker-compose up -d
    sleep 3
fi

echo -e "${GREEN}✓ Docker containers are running${NC}"
echo ""

# Function to run a command in the background
run_server() {
    local dir=$1
    local script=$2
    local name=$3

    echo -e "${YELLOW}Starting ${name}...${NC}"
    cd "$dir"
    npm run "$script" &
    cd - > /dev/null
}

# Start backend
run_server "backend" "start:dev" "Backend"
BACKEND_PID=$!

# Start frontend
run_server "frontend" "dev" "Frontend"
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}✅ Development servers started!${NC}"
echo ""
echo "Services:"
echo -e "  ${BLUE}Backend:${NC}  http://localhost:3000"
echo -e "  ${BLUE}Frontend:${NC} http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Handle Ctrl+C
trap 'echo "Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit' INT

# Keep the script running
wait $BACKEND_PID $FRONTEND_PID
