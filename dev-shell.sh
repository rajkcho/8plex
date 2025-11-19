#!/usr/bin/env bash
set -e

docker run --rm -it \
  -v "$PWD":/app \
  -v "$HOME/.codex":/root/.codex \
  -v "$HOME/.gemini":/root/.gemini \
  -v "$HOME/.ssh":/root/.ssh \
  -v "$HOME/.gitconfig":/root/.gitconfig:ro \
  -w /app \
  --name 8plex-dev-container \
  8plex-dev
