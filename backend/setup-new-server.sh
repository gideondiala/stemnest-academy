#!/bin/bash
# StemNest Academy: prepare a fresh Ubuntu 24.04 server to run the API.
#
# Written for the move from AWS EC2 to Hetzner Cloud (HETZNER_MIGRATION.md),
# but works on any fresh Ubuntu 24.04 server (Lightsail, DigitalOcean, ...).
# Run once as root; running it again is safe. It is normally run for you by
# the GitHub Actions workflow "Migrate 1: prepare the new server".
#
#   bash setup-new-server.sh https://github.com/<owner>/<repo>.git
#
# It sets the server up exactly like the old one, so every existing workflow
# (deploy, database password, keys, backups, diagnostics) keeps working:
# user "ubuntu", app in /home/ubuntu/stemnest-academy, PM2 process
# "stemnest-api" behind nginx on ports 80/443. No secrets are in this file:
# the .env, certificate and nginx site are copied from the old server.

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

REPO_URL="${1:?usage: setup-new-server.sh <git repo url>}"
APP_USER=ubuntu
APP_HOME=/home/$APP_USER
APP_DIR=$APP_HOME/stemnest-academy
NODE_MAJOR=24

[ "$(id -u)" = "0" ] || { echo "Run this as root"; exit 1; }
. /etc/os-release
[ "${VERSION_ID:-}" = "24.04" ] || echo "WARNING: written for Ubuntu 24.04, this is ${PRETTY_NAME:-unknown}"

echo "== 1/9 Time zone: UTC (the API's date handling expects it, as on EC2)"
timedatectl set-timezone UTC

echo "== 2/9 System updates and packages"
apt-get update -y
apt-get -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade -y
apt-get install -y curl git nginx certbot python3-certbot-nginx ufw fail2ban \
  unattended-upgrades gnupg ca-certificates lsb-release

echo "== 3/9 Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades >/dev/null

echo "== 4/9 Swap (2 GB safety margin for npm installs)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 5/9 App user '$APP_USER' (same name and paths as on EC2)"
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
usermod -aG sudo "$APP_USER"
echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-stemnest-$APP_USER
chmod 440 /etc/sudoers.d/90-stemnest-$APP_USER
visudo -cf /etc/sudoers.d/90-stemnest-$APP_USER >/dev/null
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$APP_HOME/.ssh"
if [ -s /root/.ssh/authorized_keys ]; then
  cat /root/.ssh/authorized_keys >> "$APP_HOME/.ssh/authorized_keys"
  sort -u -o "$APP_HOME/.ssh/authorized_keys" "$APP_HOME/.ssh/authorized_keys"
fi
chown "$APP_USER:$APP_USER" "$APP_HOME/.ssh/authorized_keys"
chmod 600 "$APP_HOME/.ssh/authorized_keys"

echo "== 6/9 Node.js $NODE_MAJOR LTS and PM2"
if ! node -v 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | bash -
  apt-get install -y nodejs
fi
npm install -g pm2 >/dev/null
echo "node $(node -v), npm $(npm -v), pm2 $(pm2 -v)"

echo "== 7/9 PostgreSQL 17 client (for the weekly database backup)"
if ! command -v pg_dump >/dev/null || ! pg_dump --version | grep -q ' 17\.'; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y postgresql-client-17
fi
pg_dump --version

echo "== 8/9 Firewall: SSH, HTTP and HTTPS only (the API port 3000 stays private)"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,12p'
systemctl enable --now fail2ban >/dev/null
rm -f /etc/nginx/sites-enabled/default
systemctl enable nginx >/dev/null

echo "== 9/9 App code and PM2 start-on-boot"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" -H git clone --quiet "$REPO_URL" "$APP_DIR"
fi
sudo -u "$APP_USER" -H mkdir -p "$APP_DIR/backend/logs" "$APP_HOME/db-backups"
chmod 700 "$APP_HOME/db-backups"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "$APP_HOME" >/dev/null
sudo -u "$APP_USER" -H pm2 install pm2-logrotate >/dev/null 2>&1 || echo "(pm2-logrotate not installed: logs will not rotate)"

echo ""
echo "SERVER READY: next, copy the .env, certificate and nginx site from the old server."
