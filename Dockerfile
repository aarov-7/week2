FROM nginxinc/nginx-unprivileged:latest

# Copy your web content into the default Nginx directory
COPY index.html /usr/share/nginx/html/

# Expose the unprivileged Nginx port
EXPOSE 8080