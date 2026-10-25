FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY node_modules ./node_modules
COPY dist ./dist

USER 1000
EXPOSE 8080

CMD ["node", "dist/index.js"]
