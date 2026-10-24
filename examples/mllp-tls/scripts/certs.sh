#!/bin/sh
# Writes a development certificate authority, a server certificate for
# localhost and 127.0.0.1, and a client certificate, all issued by that
# authority, into the directory given (default: certs).
#
# For development only: the authority's key sits next to the certificates.
set -eu

dir="${1:-certs}"
days=30
mkdir -p "$dir"
cd "$dir"
umask 077

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
  -keyout ca-key.pem -out ca.pem -days "$days" \
  -subj "/CN=Glion Development CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null

issue() {
  name="$1"
  subject="$2"
  extensions="$3"
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
    -keyout "$name-key.pem" -out "$name.csr" -subj "$subject" 2>/dev/null
  printf '%s\n' "$extensions" > "$name.ext"
  openssl x509 -req -in "$name.csr" -CA ca.pem -CAkey ca-key.pem \
    -CAcreateserial -out "$name.pem" -days "$days" -extfile "$name.ext" 2>/dev/null
  rm "$name.csr" "$name.ext"
}

issue server "/CN=localhost" "basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1"

issue client "/CN=Glion Development Client" "basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth"

rm -f ca.srl
echo "Wrote ca.pem, server.pem, and client.pem with their keys to $dir/."
