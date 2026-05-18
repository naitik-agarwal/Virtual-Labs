# /backend/Dockerfile
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the backend code
COPY . .

# Expose the WebSocket port
EXPOSE 4000

# Start the server
CMD ["node", "src/server.js"]