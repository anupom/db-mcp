#!/bin/sh
# Extract the DNS resolver from /etc/resolv.conf for nginx dynamic upstream resolution
RAW_RESOLVER=$(grep -m1 '^nameserver' /etc/resolv.conf | awk '{print $2}')
if [ -z "$RAW_RESOLVER" ]; then
  RAW_RESOLVER="127.0.0.11"
fi
# Wrap IPv6 addresses in brackets for nginx resolver directive
case "$RAW_RESOLVER" in
  *:*) export DNS_RESOLVER="[$RAW_RESOLVER]" ;;
  *)   export DNS_RESOLVER="$RAW_RESOLVER" ;;
esac
# Run the standard nginx entrypoint (which does envsubst on templates)
exec /docker-entrypoint.sh "$@"
