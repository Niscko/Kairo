# syntax=docker/dockerfile:1.7

# --- Base ------------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Mismo motivo que en el backend: un store con permisos abiertos evita los
# fallos de "Permission denied" al reutilizar cachemounts entre etapas.
ENV PNPM_STORE_DIR=/pnpm/store
RUN corepack enable && mkdir -p "$PNPM_STORE_DIR" && chmod 777 "$PNPM_STORE_DIR"

# --- Dependencias ----------------------------------------------------------
# El contexto es la raíz del monorepo: pnpm necesita el lockfile del workspace.
FROM base AS deps
WORKDIR /src
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile --filter kairo-frontend...

# --- Compilación -----------------------------------------------------------
FROM deps AS build
WORKDIR /src/frontend
# Vite incrusta estas variables en el bundle: deben existir ANTES del build.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
COPY frontend/tsconfig.json frontend/vite.config.ts frontend/tailwind.config.ts \
     frontend/postcss.config.js frontend/index.html ./
COPY frontend/src ./src
RUN pnpm run build

# --- Servidor estático -----------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY --from=build /src/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]