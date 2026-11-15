import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { CSP_HEADER, CSP_POLICY } from '../../csp.config';
import { mensajeErrorLogin, mensajeErrorRegistro, validarRegistro } from '../auth';
import { formatearReloj } from '../clock';

vi.mock('../firebase', () => ({ db: {}, auth: {}, appId: 'mi-bodega-app' }));
const { leerFormularioProducto } = await import('../modules/inventory');

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

describe('auth (textos sin mojibake, B-08)', () => {
  it('mensajes en UTF-8 correcto', () => {
    expect(mensajeErrorLogin({ code: 'auth/wrong-password' })).toContain('Contraseña');
    expect(mensajeErrorRegistro({ code: 'auth/email-already-in-use' })).toContain('está');
    expect(mensajeErrorLogin({ message: 'x' })).toBe('❌ Error: x');
    expect(mensajeErrorLogin({})).toContain('Error desconocido');
  });

  it('RN-11: contraseña ≥ 6 y confirmación igual', () => {
    expect(validarRegistro('123456', '123456')).toBeNull();
    expect(validarRegistro('12345', '12345')).toContain('al menos 6');
    expect(validarRegistro('123456', '1234567')).toContain('no coinciden');
  });
});

describe('formularios y reloj', () => {
  it('producto: stock vacío = sin control (null)', () => {
    expect(leerFormularioProducto({ nombre: 'Pan', precio: '0.50', stock: '' })).toEqual({
      nombre: 'Pan',
      precio: 0.5,
      stock: null,
    });
    expect(leerFormularioProducto({ nombre: 'Pan', precio: '1', stock: '12' }).stock).toBe(12);
  });

  it('reloj DD/MM/YYYY HH:MM:SS', () => {
    expect(formatearReloj(new Date(2026, 0, 5, 7, 8, 9))).toEqual({
      fecha: '05/01/2026',
      hora: '07:08:09',
    });
  });
});
