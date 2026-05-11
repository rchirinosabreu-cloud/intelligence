# 1. Usamos la imagen que ya trae los drivers
FROM mcr.microsoft.com/playwright:v1.45.0-jammy

WORKDIR /app

# 2. Instalamos dependencias
COPY package*.json ./
RUN npm install

# 3. Instalamos los navegadores y sus drivers (LOS MÚSCULOS)
RUN npx playwright install chromium --with-deps

COPY . .

# 4. Generamos Prisma
RUN npx prisma generate

# 5. CONSTRUIMOS EL FRONTEND (EL PASO VITAL)
RUN npm run build

# 6. Configuramos el entorno
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start"]