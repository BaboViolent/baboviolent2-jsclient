FROM node:24-bookworm-slim
WORKDIR /app
COPY jsclient/package.json ./jsclient/package.json
COPY jsclient/server.js jsclient/serverList.js ./jsclient/
COPY jsclient/public ./jsclient/public
COPY Content ./Content
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "jsclient/server.js"]
