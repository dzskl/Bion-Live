#!/bin/sh
set -e

# O volume da hospedagem chega montado como root, mas o servidor roda como
# usuario comum. Sem esse ajuste o SQLite falha ao abrir o banco no primeiro
# boot - e o deploy morre sem explicacao obvia.
#
# Nada aqui pode impedir o servidor de subir: se o ajuste de dono nao for
# possivel, seguimos como root e avisamos, em vez de deixar o container em
# loop de restart.
DIR="${BION_DATA_DIR:-/data}"
mkdir -p "$DIR"

if [ "$(id -u)" = "0" ] && id node >/dev/null 2>&1 && command -v su-exec >/dev/null 2>&1; then
  chown -R node:node "$DIR" 2>/dev/null || echo "[bion] aviso: nao consegui ajustar o dono de $DIR"
  exec su-exec node node --disable-warning=ExperimentalWarning server/dist/index.js
fi

exec node --disable-warning=ExperimentalWarning server/dist/index.js
