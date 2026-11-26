FROM node:22-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production DB_FILE=/data/sbti.db
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
