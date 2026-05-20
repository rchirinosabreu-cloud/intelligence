FROM mcr.microsoft.com/playwright:v1.54.2-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

# Genera Prisma client
RUN npx prisma generate

# Build del frontend
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
