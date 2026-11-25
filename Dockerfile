FROM node:22-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production DB_FILE=/data/sbti.db
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
