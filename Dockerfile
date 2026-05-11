# Usar la imagen oficial de Playwright que ya incluye dependencias de sistema
FROM mcr.microsoft.com/playwright:v1.45.0-jammy

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias del proyecto (incluyendo Playwright v1.45.0)
RUN npm install

# Instalar los binarios de los navegadores para Playwright
RUN npx playwright install chromium --with-deps

# Copiar el resto de la aplicación
COPY . .

# Generar el cliente de Prisma
RUN npx prisma generate

# CONSTRUIR EL FRONTEND (Indispensable para que aparezca el dashboard)
RUN npm run build

# Exponer el puerto configurado
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]
