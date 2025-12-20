# Use the official Node.js runtime as base image (Node 20 required for Firebase)
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Expose port (Cloud Run will set PORT env var)
EXPOSE 8080

# Use the PORT environment variable provided by Cloud Run
ENV PORT=8080

# Start the application
CMD ["node", "server.js"]

