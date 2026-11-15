/**
 * Content-Security-Policy de la web. Fuente única: `firebase.json` debe llevar EXACTAMENTE este
 * texto (lo verifica src/__tests__/csp.test.ts) y `vite preview` lo envía igual.
 *
 * Se publica como `Content-Security-Policy-Report-Only` (solo informa en la consola, no bloquea)
 * porque el inicio de sesión con Google por popup no se pudo probar de punta a punta contra el
 * proyecto real. Cuando la consola de producción no muestre violaciones durante el login, cambiar
 * CSP_HEADER a 'Content-Security-Policy' aquí y en firebase.json.
 *
 * Por qué cada origen (Firebase JS SDK v13 por npm, sin CDN):
 *  - script-src apis.google.com: Auth carga gapi (api.js) para el iframe oculto de
 *    signInWithPopup/redirect. gstatic: scripts auxiliares de Google Identity.
 *  - frame-src *.firebaseapp.com / *.web.app: iframe `{authDomain}/__/auth/iframe` (authDomain =
 *    bodega-difital.firebaseapp.com). accounts.google.com / apis.google.com: iframes de Google.
 *    La ventana del popup es un window.open: el CSP del que la abre no la restringe.
 *  - connect-src *.googleapis.com: Firestore (WebChannel por HTTPS), identitytoolkit,
 *    securetoken, firebaseinstallations. *.firebaseapp.com: init.json / handler.
 *  - style-src 'unsafe-inline': hay un atributo style= en el header y un <style> del toast.
 *  - Sin COOP: `same-origin` rompería la comunicación con el popup de Google.
 */
export const CSP_HEADER = 'Content-Security-Policy-Report-Only';

export const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://www.gstatic.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com https://www.google.com https://apis.google.com",
  "frame-src 'self' https://*.firebaseapp.com https://*.web.app https://accounts.google.com https://apis.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
