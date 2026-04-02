FROM node:20-alpine

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install --omit=dev

# Copiar código fuente
COPY server/ ./server/
COPY public/ ./public/
COPY db/ ./db/

# Puerto expuesto
EXPOSE 3000

# Arrancar
CMD ["node", "server/index.js"]
