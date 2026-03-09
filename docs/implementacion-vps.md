# Implementacion al VPS: Docker + Nginx + DNS + Certificados

Este documento resume la implementacion realizada para desplegar `nuestroHogarV2` en un VPS con Docker y Nginx, usando dominio propio y HTTPS con Let's Encrypt.

## 1) Dockerizacion del proyecto

Se agregaron los siguientes archivos al repositorio:

- `Dockerfile`: build multi-stage (Node para compilar, Nginx para servir estaticos).
- `docker/nginx/default.conf`: configuracion Nginx del contenedor con fallback SPA (`try_files`) y endpoint `/health`.
- `docker-compose.yml`: servicio `nuestrohogarv2_web` con:
  - `build.args`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - `ports`: `127.0.0.1:2001:80`
  - `restart: unless-stopped`
- `.dockerignore`
- `.env.example` (plantilla sin secretos)
- `implementacion-docker.md` (guia operativa)

Flujo de despliegue en VPS:

```bash
git pull
cp .env.example .env
# completar .env con valores reales
docker compose up -d --build
```

Verificaciones:

```bash
docker compose ps
curl -I http://127.0.0.1:2001
```

## 2) Nginx en el VPS (host)

Se configuro un virtual host para enrutar el dominio al contenedor:

- Archivo: `/etc/nginx/sites-available/nuestrohogar.cl`
- Enlace: `/etc/nginx/sites-enabled/nuestrohogar.cl`

Configuracion base usada:

```nginx
server {
  listen 80;
  server_name nuestrohogar.cl www.nuestrohogar.cl;

  location / {
    proxy_pass http://127.0.0.1:2001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Validacion:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Nota operativa:
- Se corrigio un symlink roto previo que apuntaba a `tu-dominio.com`.

## 3) DNS del dominio

Registros aplicados:

- `A` para raiz:
  - Nombre: `@`
  - Valor: `31.97.65.107`
- `CNAME` para `www`:
  - Nombre: `www`
  - Valor: `nuestrohogar.cl`

Comprobaciones usadas:

```bash
dig +short NS nuestrohogar.cl
dig +short www.nuestrohogar.cl
dig @1.1.1.1 +short www.nuestrohogar.cl
dig @8.8.8.8 +short www.nuestrohogar.cl
```

## 4) Certificado SSL con Certbot

Comando ejecutado:

```bash
sudo certbot --nginx -d nuestrohogar.cl -d www.nuestrohogar.cl
```

Resultado:

- Certificado emitido exitosamente para ambos dominios.
- Ruta cert: `/etc/letsencrypt/live/nuestrohogar.cl/fullchain.pem`
- Ruta key: `/etc/letsencrypt/live/nuestrohogar.cl/privkey.pem`
- Expiracion: `2026-06-07`
- Renovacion automatica configurada por Certbot.

## Estado final

- Aplicacion desplegada en Docker y corriendo.
- Nginx host enruta correctamente al contenedor.
- DNS propagado para raiz y `www`.
- HTTPS activo en:
  - `https://nuestrohogar.cl`
  - `https://www.nuestrohogar.cl`
