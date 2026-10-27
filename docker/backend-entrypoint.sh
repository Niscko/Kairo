#!/bin/sh
# Entrypoint del backend.
#
# Aplica las migraciones antes de aceptar tráfico: así el esquema de la base
# corresponde siempre al binario desplegado. Con una sola instancia es seguro;
# si se escala a varias, este paso debe serializarse (un advisory lock).
set -e

echo "==> Aplicando migraciones pendientes"
# El CLI es una dependencia de producción, así que vive en node_modules.
node /app/node_modules/prisma/build/index.js migrate deploy

if [ "${RUN_SEED_ON_START:-false}" = "true" ]; then
  echo "==> Sembrando datos de demostración"
  node dist/seed/prisma/seed.js
fi

echo "==> Iniciando Kairo API"
exec node dist/server.js