# ───────────────────────────
# Etapa única (suficiente para MVP)
# ───────────────────────────
FROM node:20-slim          # Evita problemas con MUSL

WORKDIR /app

# 1. Copia package.json e instala dependencias
COPY package*.json ./
RUN npm install --quiet

# 2. Copia esquema de Prisma y genera el cliente
COPY prisma ./prisma
RUN npx prisma generate    # ← aquí SOLO generamos el cliente

# 3. Copiamos el resto del código fuente
COPY . .

# 4. Variables de entorno de producción (puedes sobreescribirlas en EasyPanel)
ENV PORT=3000
EXPOSE 3000

CMD ["npm","run","dev"]
