FROM node:20-bullseye

# Puppeteer deps
RUN apt-get update && apt-get install -y     fonts-liberation     libasound2     libatk-bridge2.0-0     libatk1.0-0     libcups2     libdbus-1-3     libnss3     libx11-6     libx11-xcb1     libxcomposite1     libxdamage1     libxext6     libxfixes3     libxrandr2     xdg-utils     && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install

COPY . .

# Ensure Python and pip for hybrid
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN npm run py:init

ENV PUPPETEER_SKIP_DOWNLOAD=false     PUPPETEER_PRODUCT=chrome

CMD ["npm","start"]
