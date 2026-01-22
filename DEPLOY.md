# Guía de Despliegue y Seguridad

Esta guía te ayudará a configurar correctamente tu entorno de producción en Railway y asegurar tu API Key de Google Gemini.

## 1. Configuración en Railway

Para que la aplicación funcione correctamente en Railway, debes asegurarte de que las variables de entorno estén configuradas **antes** de que se construya la aplicación.

1.  Ve a tu proyecto en **Railway**.
2.  Selecciona el servicio `intelligence`.
3.  Ve a la pestaña **Variables**.
4.  Asegúrate de tener agregada:
    *   `VITE_GEMINI_API_KEY`: Tu llave de API de Google AI Studio.
5.  **IMPORTANTE:** Si agregaste la variable *después* del último despliegue, debes forzar un **Redeploy** (o hacer un commit nuevo) para que Vite pueda "leer" la variable y empaquetarla en la aplicación.

## 2. Seguridad de la API Key (Google Cloud)

Dado que esta es una aplicación Frontend (se ejecuta en el navegador del usuario), tu API Key es visible en el código. Para evitar que otras personas la usen en otros sitios web, debes restringirla a tu dominio de Railway.

**Tu Dominio:**
`https://intelligence-production-7a52.up.railway.app/`

### Pasos para restringir la llave:

1.  Ve a la [Google Cloud Console - Credenciales](https://console.cloud.google.com/apis/credentials).
2.  Busca la API Key que estás usando (`VITE_GEMINI_API_KEY`).
3.  Haz clic en el icono de lápiz (Editar).
4.  En "Restricciones de aplicaciones" (Application restrictions), selecciona **Sitios web (HTTP referrers)**.
5.  En "Restricciones de sitios web", agrega tu dominio de Railway:
    *   `https://intelligence-production-7a52.up.railway.app/*`
    *   *(Recomendado agregar también `http://localhost:3000/*` para que te funcione en desarrollo local)*.
6.  Haz clic en **Guardar**.

Ahora, tu llave solo funcionará cuando las peticiones vengan desde tu aplicación en Railway.

## 3. Solución de Problemas Comunes

*   **Error 404 / 400 en consola:** Verifica que el modelo en `src/lib/chatUtils.js` sea `gemini-1.5-flash-latest`.
*   **"VITE_GEMINI_API_KEY no está configurado":** Significa que el proceso de "Build" de Railway no tuvo acceso a la variable. Revisa el paso 1 y haz un Redeploy.
