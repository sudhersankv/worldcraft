# --- build the website + game
FROM node:22-slim AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY web ./web
RUN npx vite build

# --- API server (FastAPI) serving the built frontend
FROM python:3.12-slim
WORKDIR /app/server
COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server ./
COPY deploy/entry.py ./entry.py
COPY --from=web /app/dist /app/dist
ENV WC_DIST=/app/dist PORT=8080 PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["sh", "-c", "uvicorn entry:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
