#!/bin/sh
# Extract the DNS resolver from /etc/resolv.conf for nginx dynamic upstream resolution
export DNS_RESOLVER=$(grep -m1 '^nameserver' /etc/resolv.conf | awk '{print $2}')
if [ -z "$DNS_RESOLVER" ]; then
  DNS_RESOLVER="127.0.0.11"
fi
# Run the standard nginx entrypoint (which does envsubst on templates)
exec /docker-entrypoint.sh "$@"
