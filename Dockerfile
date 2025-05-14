# ───────────────────────────
# Etapa única (suficiente para MVP)
# Usamos una imagen glibc para evitar binarios MUSL de Prisma
# ───────────────────────────
FROM node:20-slim

WORKDIR /app
# Instalamos git antes de instalar dependencias (esencial para deps desde repositorios)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copiamos package.json / lock y las dependencias
COPY package.json package-lock.json ./
RUN npm ci --quiet

# Copiamos el esquema de Prisma y generamos el cliente
COPY prisma ./prisma
RUN npx prisma generate

# Copiamos el resto del código fuente
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm","run","dev"]
