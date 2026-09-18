#!/bin/bash
# StemNest Academy — EC2 Server Setup Script
# Run this once on a fresh Ubuntu 24.04 server
# Usage: bash setup-server.sh

set -e

echo "=========================================="
echo "  StemNest Academy — Server Setup"
echo "=========================================="

# Update system
echo "📦 Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt-get install -y nginx

# Install Certbot for SSL
echo "📦 Installing Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

# Install Git
echo "📦 Installing Git..."
sudo apt-get install -y git

# Create app directory
echo "📁 Creating app directory..."
mkdir -p /home/ubuntu/stemnest-academy

# Configure Nginx
echo "⚙️  Configuring Nginx..."
sudo tee /etc/nginx/sites-available/stemnest-api > /dev/null <<'NGINX'
server {
    listen 80;
    server_name api.stemnestacademy.co.uk;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/stemnest-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# Set up PM2 to start on boot
echo "⚙️  Configuring PM2 startup..."
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash

echo ""
echo "=========================================="
echo "  ✅ Server setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Clone your repo: git clone https://github.com/YOUR_USERNAME/stemnest-academy.git /home/ubuntu/stemnest-academy"
echo "2. Create .env: nano /home/ubuntu/stemnest-academy/backend/.env"
echo "3. Install deps: cd /home/ubuntu/stemnest-academy/backend && npm ci --omit=dev"
echo "4. Run migrations: npm run migrate"
echo "5. Start API: pm2 start ecosystem.config.js --env production && pm2 save"
echo "6. Get SSL: sudo certbot --nginx -d api.stemnestacademy.co.uk"
echo ""
