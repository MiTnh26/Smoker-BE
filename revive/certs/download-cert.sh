#!/bin/bash
# Script để download Azure MySQL SSL certificate

echo "Downloading Azure MySQL SSL certificates..."

# Tạo thư mục nếu chưa có
mkdir -p "$(dirname "$0")"

# Download DigiCert Global Root CA (Azure MySQL sử dụng)
curl -o "$(dirname "$0")/DigiCertGlobalRootCA.crt.pem" \
  https://cacerts.digicert.com/DigiCertGlobalRootCA.crt.pem

# Download Baltimore CyberTrust Root (backup)
curl -o "$(dirname "$0")/BaltimoreCyberTrustRoot.crt.pem" \
  https://cacerts.digicert.com/BaltimoreCyberTrustRoot.crt.pem

# Tạo combined certificate file (sử dụng cả 2)
cat "$(dirname "$0")/DigiCertGlobalRootCA.crt.pem" \
    "$(dirname "$0")/BaltimoreCyberTrustRoot.crt.pem" > \
    "$(dirname "$0")/azure-mysql-ca-cert.pem"

echo "✅ Certificates downloaded successfully!"
echo "Location: $(dirname "$0")/azure-mysql-ca-cert.pem"




