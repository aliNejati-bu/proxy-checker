# Use official Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml* package-lock.json* ./
RUN npm install --production || pnpm install --prod || true

# Copy the rest of the project files
COPY . .

# Add execute permission to xray binaries
RUN chmod +x ./bin/xray || true
RUN chmod +x ./bin/xray.exe || true

# Expose port (فرض: 3000)
EXPOSE 3000

# Start the app
CMD ["node", "./admin-panel/server.js"] 