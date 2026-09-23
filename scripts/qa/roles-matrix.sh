#!/bin/bash
# Wrapper ejecutable para auditoría de matriz de roles y permisos
set -e
echo "Ejecutando suite de matriz de roles..."
node scripts/qa/roles-matrix.js
