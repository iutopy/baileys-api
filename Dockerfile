# ───────────────────────────
# Etapa única (suficiente para MVP)
# Usamos una imagen glibc para evitar binarios MUSL de Prisma
# ───────────────────────────
FROM node:20-slim

WORKDIR /app

# Copiamos package.json / lock y las dependencias
COPY package*.json ./
RUN npm install --quiet

# Copiamos el esquema de Prisma y generamos el cliente
COPY prisma ./prisma
RUN npx prisma generate

# Copiamos el resto del código fuente
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm","run","dev"]
