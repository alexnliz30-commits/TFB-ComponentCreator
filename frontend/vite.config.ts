import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5080',
    },
    watch: {
      /*
        Sondeo en lugar de eventos del sistema de ficheros.

        Bajo Docker en Windows el código llega al contenedor por un volumen
        montado, y los eventos `inotify` de Linux no cruzan esa frontera: Vite no
        se enteraba de ningún cambio, así que cada edición obligaba a un
        `docker compose restart frontend` y la recarga en caliente —que es media
        razón de usar Vite— sencillamente no funcionaba.

        Sondear cuesta algo de CPU, y por eso no es el valor por defecto de Vite;
        a cambio es lo único que funciona en este montaje. Fuera de Docker no
        estorba: el intervalo es amplio y el proyecto, pequeño.
      */
      usePolling: true,
      interval: 300,
    },
  },
});
