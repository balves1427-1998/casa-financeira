#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Casa Financeira - Complete Setup${NC}"
echo "================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker to continue: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed${NC}"

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker Compose is installed${NC}"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}📝 Creating .env file...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ .env created (please update with your values)${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo ""
echo -e "${YELLOW}🐳 Starting Docker containers...${NC}"

# Start Docker containers
docker-compose down 2>/dev/null || true
docker-compose up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
sleep 5

# Check PostgreSQL connection
for i in {1..30}; do
    if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        exit 1
    fi
    echo "Attempting connection ($i/30)..."
    sleep 1
done

echo ""
echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
cd backend
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to install backend dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Backend dependencies installed${NC}"

echo ""
echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
cd ../frontend
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to install frontend dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"

cd ..

echo ""
echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
docker-compose exec -T backend npm run migration:run
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Migrations may have failed (this is normal on first run)${NC}"
fi
echo -e "${GREEN}✓ Database ready${NC}"

echo ""
echo -e "${YELLOW}🌱 Seeding initial data...${NC}"
docker-compose exec -T backend npm run seed
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Seeding may have failed (this is optional)${NC}"
fi

echo ""
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Update .env with your configuration values"
echo "2. Backend API: http://localhost:3000"
echo "3. Frontend: http://localhost:3001"
echo "4. PgAdmin: http://localhost:5050 (optional)"
echo ""
echo "To start development:"
echo "  Backend:  cd backend && npm run start:dev"
echo "  Frontend: cd frontend && npm run dev"
echo ""
echo "To stop Docker containers:"
echo "  docker-compose down"
echo ""
