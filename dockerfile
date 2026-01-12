# =========================
# Base: Node + Debian
# =========================
FROM node:18-bullseye

# =========================
# Instalar Python
# =========================
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# =========================
# Directorio de la app
# =========================
WORKDIR /app

# =========================
# Copiar dependencias Node
# =========================
COPY package*.json ./
RUN npm install --production

# =========================
# Copiar el resto del código
# =========================
COPY . .

# =========================
# Instalar dependencias Python
# =========================
RUN if [ -f requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt; fi

# =========================
# Render usa PORT dinámico
# =========================
ENV PORT=10000

EXPOSE 10000

# =========================
# Iniciar servidor
# =========================
CMD ["node", "server.js"]
