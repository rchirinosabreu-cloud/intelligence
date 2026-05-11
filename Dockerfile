# 1. Imagen que ya tiene los ojos (Playwright) y los músculos (Drivers)
FROM mcr.microsoft.com/playwright:v1.45.0-jammy

WORKDIR /app

# 2. Instalamos solo las librerías base (SIN ejecutar los scripts que rompen el build)
COPY package*.json ./
RUN npm ci --ignore-scripts

# 3. Ahora sí copiamos todo el código de la agencia
COPY . .

# 4. Generamos Prisma (Ahora que ya copiamos el archivo schema.prisma)
RUN npx prisma generate

# 5. CONSTRUIMOS EL FRONTEND (Esto hace que tu dashboard aparezca)
RUN npm run build

# 6. Configuraciones de Railway
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# 7. Arranque directo y rápido
CMD ["node", "server.js"]
