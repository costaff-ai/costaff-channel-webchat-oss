FROM python:3.12-slim

RUN apt-get update && apt-get install -y nginx supervisor && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Static files for nginx
RUN mkdir -p /app/static
COPY index.html login.html /app/static/
COPY css/ /app/static/css/
COPY js/ /app/static/js/

# nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Backend
COPY backend/ /app/backend/
COPY supervisord.conf /app/supervisord.conf

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/app/supervisord.conf"]
