import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { CSP_HEADER, CSP_POLICY } from '../../csp.config';
import { mensajeErrorLogin, mensajeErrorRegistro, mensajeRecuperacion, validarRegistro } from '../auth';

vi.mock('../firebase', () => ({ db: {}, auth: {}, appId: 'mi-bodega-app' }));
const { leerFormularioProducto, validarProducto } = await import('../views/editores');

// Vitest corre en web/ (npm -w web / CI); la raíz del repo es el padre.
const raiz = (ruta: string) => resolve(process.cwd(), '..', ruta);

interface Hosting {
  public: string;
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

describe('firebase.json', () => {
  const firebase = JSON.parse(readFileSync(raiz('firebase.json'), 'utf8')) as { hosting: Hosting };
  const globales = firebase.hosting.headers.find((h) => h.source === '**')!.headers;

  it('publica web/dist', () => {
    expect(firebase.hosting.public).toBe('web/dist');
  });

  it('el CSP de hosting es exactamente el de csp.config.ts', () => {
    expect(globales.find((h) => h.key === CSP_HEADER)?.value).toBe(CSP_POLICY);
  });

  it('el CSP permite lo que necesita el login con Google por popup y Firestore', () => {
    expect(CSP_POLICY).toContain("script-src 'self' https://apis.google.com");
    expect(CSP_POLICY).toMatch(/frame-src [^;]*https:\/\/\*\.firebaseapp\.com/);
    expect(CSP_POLICY).toMatch(/connect-src [^;]*https:\/\/\*\.googleapis\.com/);
    expect(CSP_POLICY).not.toContain("'unsafe-eval'");
  });

  it('la fuente es autoalojada: font-src permite self', () => {
    expect(CSP_POLICY).toMatch(/font-src 'self'/);
  });

  it('conserva las cabeceras de seguridad y no agrega COOP (rompería el popup)', () => {
    const claves = globales.map((h) => h.key);
    expect(claves).toEqual(
      expect.arrayContaining([
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
      ]),
    );
    expect(claves).not.toContain('Cross-Origin-Opener-Policy');
  });
});

describe('index.html', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it('sin Google Fonts ni scripts inline (CSP)', () => {
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>/);
  });

  it('sin emojis en la interfaz', () => {
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('auth: mensajes humanos (ux-web §3)', () => {
  const todos = [
    ...[
      'auth/wrong-password',
      'auth/invalid-credential',
      'auth/user-not-found',
      'auth/invalid-email',
      'auth/too-many-requests',
      'auth/network-request-failed',
      'auth/popup-closed-by-user',
      'auth/popup-blocked',
      'x/desconocido',
    ].map((code) => mensajeErrorLogin({ code })),
    ...['auth/email-already-in-use', 'auth/weak-password', 'auth/invalid-email', 'x'].map((code) =>
      mensajeErrorRegistro({ code }),
    ),
  ];

  it('sin emojis, sin códigos técnicos y en UTF-8 correcto', () => {
    for (const m of todos) {
      expect(m.texto).not.toMatch(/\p{Extended_Pictographic}|❌/u);
      expect(m.texto).not.toMatch(/auth\//);
      expect(m.texto).not.toContain('�');
    }
  });

  it('contraseña equivocada ofrece recuperarla', () => {
    const m = mensajeErrorLogin({ code: 'auth/wrong-password' });
    expect(m.texto).toBe('Esa contraseña no coincide con el correo. ¿La recuperamos?');
    expect(m.accion).toBe('recuperar');
    expect(mensajeErrorLogin({ code: 'auth/invalid-credential' }).accion).toBe('recuperar');
  });

  it('correo sin cuenta ofrece crearla; correo ya usado ofrece ingresar', () => {
    expect(mensajeErrorLogin({ code: 'auth/user-not-found' }).accion).toBe('registrar');
    expect(mensajeErrorRegistro({ code: 'auth/email-already-in-use' }).accion).toBe('ingresar');
  });

  it('un error desconocido no muestra el mensaje técnico de Firebase', () => {
    expect(mensajeErrorLogin({ message: 'Firebase: Error (auth/internal-error).' }).texto).not.toContain(
      'Firebase',
    );
  });

  it('recuperación: éxito y correo vacío', () => {
    expect(mensajeRecuperacion(null).texto).toContain('Te enviamos un correo');
    expect(mensajeRecuperacion({ code: 'auth/missing-email' }).texto).toContain('Escribe tu correo');
  });

  it('RN-11: contraseña ≥ 6 y confirmación igual', () => {
    expect(validarRegistro('123456', '123456')).toBeNull();
    expect(validarRegistro('12345', '12345')).toContain('al menos 6');
    expect(validarRegistro('123456', '1234567')).toContain('no son iguales');
  });
});

describe('formulario de producto', () => {
  it('stock vacío = sin control (null); acepta coma decimal', () => {
    expect(leerFormularioProducto({ nombre: 'Pan', precio: '0.50', stock: '' })).toEqual({
      nombre: 'Pan',
      precio: 0.5,
      stock: null,
    });
    expect(leerFormularioProducto({ nombre: 'Pan', precio: '1', stock: '12' }).stock).toBe(12);
    expect(leerFormularioProducto({ nombre: ' Pan ', precio: '2,5', stock: '' })).toMatchObject({
      nombre: 'Pan',
      precio: 2.5,
    });
  });

  it('valida nombre, precio y stock', () => {
    expect(validarProducto({ nombre: '', precio: 1, stock: null })).toContain('nombre');
    expect(validarProducto({ nombre: 'Pan', precio: Number.NaN, stock: null })).toContain('precio');
    expect(validarProducto({ nombre: 'Pan', precio: -1, stock: null })).toContain('precio');
    expect(validarProducto({ nombre: 'Pan', precio: 1, stock: Number.NaN })).toContain('stock');
    expect(validarProducto({ nombre: 'Pan', precio: 0, stock: 0 })).toBeNull();
  });
});
