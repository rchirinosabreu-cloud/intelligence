FROM mcr.microsoft.com/playwright:v1.54.2-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

# Genera Prisma client manualmente
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
