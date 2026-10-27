# syntax=docker/dockerfile:1.7

# --- Base ------------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# El store de pnpm va en un directorio de la imagen con permisos abiertos:
# los cachemounts de BuildKit crean el volumen como root y, al reutilizarse
# entre etapas, pnpm falla con "Permission denied" y reintenta en bucle.
ENV PNPM_STORE_DIR=/pnpm/store
RUN corepack enable && mkdir -p "$PNPM_STORE_DIR" && chmod 777 "$PNPM_STORE_DIR"
WORKDIR /app

# --- Dependencias ----------------------------------------------------------
# El lockfile vive en la raíz del monorepo (pnpm workspace), así que el
# contexto de build sube un nivel y se usa --filter para instalar solo backend.
FROM base AS deps
WORKDIR /src
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY backend/package.json ./backend/
COPY backend/prisma ./backend/prisma
# `deploy` reconstruye node_modules en /out e ignora el schema.prisma del
# paquete, así que el cliente de Prisma se genera explícitamente en backend/
# antes de desplegar. Sin esto, los enums (que son valores en runtime, no solo
# tipos) faltarían y el proceso fallaría al arrancar.
RUN pnpm install --frozen-lockfile --filter kairo-backend... \
 && pnpm --filter kairo-backend exec prisma generate \
 && pnpm --filter kairo-backend deploy --prod --legacy /out

# Los motores de Prisma se descargan en la etapa de build (con permisos) y no
# en el arranque: el contenedor corre como usuario no root y no puede escribir
# en node_modules.
#
# `pnpm deploy` solo conserva el motor de la plataforma anfitriona, así que los
# binarios de musl (el de Alpine) se copian desde el árbol de instalación, donde
# `prisma generate` los deja gracias a binaryTargets.
RUN set -eux; \
    mkdir -p /opt/prisma-engines; \
    # El motor de consulta de musl lo deja `prisma generate` en el directorio
    # .prisma del cliente, dentro del store de pnpm.
    client_root="$(find /out/node_modules/.pnpm -maxdepth 6 -type d -path '*/.prisma/client' | head -1)"; \
    find "$client_root" -type f -name 'libquery_engine-linux-musl-openssl-3.0.x.so.node' \
         -exec cp {} /opt/prisma-engines/ \; ; \
    # El schema-engine (el que aplica migraciones) del paquete @prisma/engines
    # corresponde a la plataforma anfitriona. Se vuelve a ejecutar el
    # postinstall con PRISMA_CLI_BINARY_TARGETS para que descargue el de musl:
    # el propio Prisma resuelve la URL y verifica el checksum, en vez de
    # construirla a mano.
    engines_pkg="$(find /out/node_modules/.pnpm -maxdepth 5 -type d -path '*@prisma/engines' | head -1)"; \
    echo "Paquete de motores: $engines_pkg"; \
    PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x \
    node "$engines_pkg/scripts/postinstall.js"; \
    find "$engines_pkg" -maxdepth 1 -type f -name 'schema-engine-linux-musl-openssl-3.0.x' \
         -exec cp {} /opt/prisma-engines/ \; ; \
    ls -la /opt/prisma-engines

# --- Compilación -----------------------------------------------------------
FROM base AS build
WORKDIR /src
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY backend/package.json ./backend/
RUN pnpm install --frozen-lockfile --filter kairo-backend...
COPY backend/tsconfig.json backend/tsconfig.build.json ./backend/
COPY backend/prisma ./backend/prisma
COPY backend/src ./backend/src
WORKDIR /src/backend
RUN pnpm exec prisma generate \
 && pnpm run build \
 # El seed también se compila: en producción no hay TypeScript ni tsx, así que
 # se ejecuta como JavaScript plano desde el entrypoint.
 && pnpm exec tsc prisma/seed.ts \
      --outDir dist/seed --rootDir . --module NodeNext --moduleResolution NodeNext \
      --target ES2023 --esModuleInterop --skipLibCheck --resolveJsonModule

# --- Producción ------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# tini como PID 1 para que las señales lleguen a Node y el apagado sea ordenado.
# openssl es obligatorio: el motor de consulta de Prisma lo necesita en Alpine.
# tzdata permite que Node aplique la zona horaria configurada en TZ.
RUN apk add --no-cache tini openssl tzdata \
 && addgroup -S kairo -g 1001 \
 && adduser -S kairo -u 1001 -G kairo

WORKDIR /app
COPY --from=deps /out/node_modules ./node_modules
COPY --from=build /src/backend/dist ./dist
COPY --from=build /src/backend/prisma ./prisma
COPY backend/package.json ./
COPY docker/backend-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# `migrate deploy` necesita el CLI de Prisma, que es devDependency y no
# sobrevive a `deploy --prod`. Se copia desde la etapa de build, donde ya está
# instalado y ya generó el cliente.
#
# No se copia el shim de /usr/local/bin porque resuelve rutas absolutas hacia el
# store de pnpm, que en esta imagen no existe; se invoca directamente el módulo.
# La versión del paquete se resuelve con un glob para no tener que actualizarla
# en cada subida de dependencias.
# `prisma` es dependencia de producción (no devDependency) para que
# `migrate deploy` funcione en el contenedor sin un paso de instalación extra.
COPY --from=deps /out/node_modules/prisma ./node_modules/prisma
COPY --from=deps /out/node_modules/@prisma/ ./node_modules/@prisma/

# Motores descargados en build, en una ruta de solo lectura. Sin estas
# variables el CLI intentaría descargarlos al arrancar, algo imposible sin
# permisos de escritura.
COPY --from=deps /opt/prisma-engines /opt/prisma-engines
ENV PRISMA_QUERY_ENGINE_LIBRARY=/opt/prisma-engines/libquery_engine-linux-musl-openssl-3.0.x.so.node \
    PRISMA_MIGRATION_ENGINE_LIBRARY=/opt/prisma-engines/schema-engine-linux-musl-openssl-3.0.x

# pnpm comprueba que node_modules coincida con el lockfile antes de ejecutar un
# script. Como usuario no root no puede repararlo, así que la comprobación se
# desactiva en el contenedor: el directorio se copia ya íntegro desde la build.
ENV verifyDepsBeforeRun=false

USER kairo
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/server.js"]