#!/usr/bin/env bash
export NODE_INSTALLATION_VERSION=$(sed 's/^v//' "$(dirname "${BASH_SOURCE[0]}")/../.nvmrc")
export REPOSITORY_RID=ri.stemma.main.repository.5e559675-1a20-452e-a786-8259be767a31
export REQUESTS_CA_BUNDLE=${SSL_CERT_FILE} # Used by the Python requests module
