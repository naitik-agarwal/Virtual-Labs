# /frontend/Dockerfile

# Stage 1: Build the React application (Upgraded to Node 22!)
FROM node:22-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve the app with Nginx
FROM nginx:alpine
# Copy the compiled Vite build to Nginx's public folder
COPY --from=build /app/dist /usr/share/nginx/html
# Expose the web port
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]