FROM nginxinc/nginx-unprivileged:alpine
COPY index.html /usr/share/nginx/html/

# Rahti runs containers as an arbitrary non-root UID by default (see the box below) —
# that UID can't bind to port 80, so move Apache to a non-privileged port instead.
RUN sed -i 's/^Listen 80$/Listen 8080/' /usr/local/apache2/conf/httpd.conf && \
    chgrp -R 0 /usr/local/apache2/logs && \
    chmod -R g=u /usr/local/apache2/logs
EXPOSE 8080