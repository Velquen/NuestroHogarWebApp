# Implementacion Docker

Guia para desplegar `nuestroHogarV2` en un VPS con `docker compose`, usando `nginx` en el host como reverse proxy.

## 1) Preparacion en VPS

```bash
cd /ruta/de/tu/proyecto/nuestroHogarV2
git pull
cp .env.example .env
```

Edita `.env` con tus valores reales:

```env
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable_key>
```

## 2) Build y despliegue

```bash
docker compose build
docker compose up -d
```

La app quedara disponible localmente en el VPS en:

- `http://127.0.0.1:2001`

## 3) Integracion con Nginx (host VPS)

Crea un `server` para tu dominio (ruta usual: `/etc/nginx/sites-available/tu-dominio.com`):

```nginx
server {
  listen 80;
  server_name tu-dominio.com;

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

Valida y recarga Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4) Validaciones

Verifica que el contenedor este arriba:

```bash
docker compose ps
docker logs --tail=100 nuestrohogarv2_web
```

Prueba HTTP local en el VPS:

```bash
curl -I http://127.0.0.1:2001
curl -I http://127.0.0.1:2001/health
```

Prueba en navegador:

- Tu dominio carga la app.
- Una ruta SPA directa (por ejemplo `/tablero`) no devuelve `404`.

## 5) Operacion diaria

- Si cambias codigo frontend: `git pull` y `docker compose up -d --build`.
- Si cambias `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`: debes reconstruir imagen (`docker compose up -d --build`).
- Para futuras apps en el mismo VPS con Nginx host, usa otro puerto local distinto (por ejemplo `127.0.0.1:2002:80`).
