#!/usr/bin/env bash
# Idempotent one-time setup for the Paisa API host (Amazon Linux 2023).
# Usage: ssh -i key.pem ec2-user@HOST 'bash -s' < infra/provision-server.sh
set -euo pipefail
log() { printf '\n==> %s\n' "$*"; }

log "System packages"
sudo dnf install -y docker git cronie >/dev/null
sudo systemctl enable --now docker crond

log "Docker Compose v2 plugin"
if ! docker compose version >/dev/null 2>&1; then
  ARCH=$(uname -m)
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-${ARCH}" -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi
sudo usermod -aG docker ec2-user

log "1 GB swap (the instance has <1 GB RAM)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

log "App directories"
mkdir -p ~/paisa/data ~/paisa/backups

log "Docker log rotation"
sudo mkdir -p /etc/docker
echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json >/dev/null
sudo systemctl restart docker

log "Versions"
docker --version; sudo docker compose version; git --version; free -m | sed -n '1,3p'
