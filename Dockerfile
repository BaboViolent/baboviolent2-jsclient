FROM cgr.dev/chainguard/node:latest
ARG CLIENT_VERSION=development
ENV CLIENT_VERSION=$CLIENT_VERSION
WORKDIR /app
COPY jsclient/package.json ./jsclient/package.json
COPY jsclient/server.js jsclient/serverList.js ./jsclient/
COPY jsclient/public ./jsclient/public
COPY Content ./Content
ENV PORT=8080
EXPOSE 8080
CMD ["jsclient/server.js"]
