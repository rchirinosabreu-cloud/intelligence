# Usar una imagen de Node ligera
FROM node:22-slim

# Directorio de trabajo
WORKDIR /app

# Instalar dependencias necesarias para Prisma y otras herramientas
RUN apt-get update && apt-get install -y --no-install-recommends openssl chromium fonts-liberation && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias del proyecto
RUN npm ci --ignore-scripts

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
