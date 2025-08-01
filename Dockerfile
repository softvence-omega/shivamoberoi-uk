FROM node:22.16.0

# Install Chromium and dependencies needed for Puppeteer in one RUN
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxtst6 \
    xdg-utils \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set Puppeteer executable path
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /opt/render/project/src

# Copy package.json and package-lock.json first (for better caching)
COPY package*.json ./

# Install dependencies cleanly (npm ci preferred for reproducible builds)
RUN npm ci

# Install Nest CLI globally (optional; if you need it inside container)
RUN npm install -g @nestjs/cli

# Copy the rest of your application files
COPY . .

# Build your NestJS app
RUN npm run build

# Expose the app port
EXPOSE 3000

# Start the app
CMD ["npm", "run", "start:prod"]
