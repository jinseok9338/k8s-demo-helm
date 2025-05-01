# Stage 1: Build the React application
FROM node:20-alpine AS build-stage

WORKDIR /app

# Copy package.json and lock file
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application for production
# Environment variables like VITE_BACKEND_API_URL can be set here if needed for build time
# RUN VITE_BACKEND_API_URL=/api npm run build
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:stable-alpine

# Copy the built static files from the build stage to the Nginx HTML directory
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Copy a custom Nginx configuration file (optional, but good practice for SPAs)
# We will create this nginx.conf next
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx when the container launches
CMD ["nginx", "-g", "daemon off;"] 