#!/bin/bash
# Skip Puppeteer install on Render
export PUPPETEER_SKIP_DOWNLOAD=true
npm install
npm run build