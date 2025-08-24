# ---- CheckScam Crawler Production Dockerfile ----
FROM node:22-alpine

# Set timezone for VN
ENV TZ=Asia/Ho_Chi_Minh
ENV HUSKY=0

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Results and logs volume (optional)
VOLUME ["/app/Logs"]

# Default command (production: auto-crawl)
CMD ["node", "Scripts/CheckScamCrawlerV2.js"]

# Healthcheck (optional, can be customized)
HEALTHCHECK --interval=1m --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('fs').accessSync('Results', fs.constants.R_OK)" || exit 1
