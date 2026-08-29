# Uma imagem, um processo: a mesma coisa que roda na maquina do lojista roda na
# hospedagem. O watchdog do heartbeat precisa de um processo vivo o tempo todo,
# entao nada de serverless aqui.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# Volume da hospedagem: banco e audios de seguranca sobrevivem a cada deploy.
ENV BION_DATA_DIR=/data
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
# su-exec larga o privilegio depois de ajustar o dono do volume montado.
RUN apk add --no-cache su-exec \
  && chmod +x /app/docker-entrypoint.sh \
  && mkdir -p /data && chown -R node:node /data /app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
