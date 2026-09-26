FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Railway injects PORT at runtime; this is just a sane local default.
EXPOSE 3000

CMD ["npm", "start"]
