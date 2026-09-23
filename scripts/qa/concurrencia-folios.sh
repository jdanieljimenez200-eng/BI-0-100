#!/bin/bash
# Wrapper ejecutable para auditoría de concurrencia y transacciones
set -e
echo "Ejecutando suite de concurrencia..."
node scripts/qa/concurrencia-folios.js
