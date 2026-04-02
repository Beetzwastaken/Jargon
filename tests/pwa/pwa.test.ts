import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('PWA Configuration', () => {
  describe('manifest.json', () => {
    let manifest: {
      name: string;
      short_name: string;
      description: string;
      start_url: string;
      display: string;
      background_color: string;
      theme_color: string;
      orientation: string;
      categories: string[];
      icons: Array<{
        src: string;
        sizes: string;
        type: string;
        purpose: string;
      }>;
    };

    beforeEach(() => {
      const manifestPath = join(__dirname, '../../public/manifest.json');
      const manifestContent = readFileSync(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestContent);
    });

    it('should have required fields', () => {
      expect(manifest.name).toBeDefined();
      expect(manifest.short_name).toBeDefined();
      expect(manifest.start_url).toBeDefined();
      expect(manifest.display).toBeDefined();
      expect(manifest.icons).toBeDefined();
    });

    it('should have correct app name', () => {
      expect(manifest.name).toBe('Jargon — Buzzword Bingo for Meetings');
      expect(manifest.short_name).toBe('Jargon');
    });

    it('should use standalone display mode', () => {
      expect(manifest.display).toBe('standalone');
    });

    it('should have dark theme colors', () => {
      expect(manifest.background_color).toBe('#0a0a0a');
      expect(manifest.theme_color).toBe('#1a1a1a');
    });

    it('should have portrait orientation', () => {
      expect(manifest.orientation).toBe('portrait-primary');
    });

    it('should have appropriate categories', () => {
      expect(manifest.categories).toContain('games');
      expect(manifest.categories).toContain('entertainment');
    });

    it('should have at least one icon', () => {
      expect(manifest.icons.length).toBeGreaterThan(0);
    });

    it('should have valid icon configuration', () => {
      manifest.icons.forEach(icon => {
        expect(icon.src).toBeDefined();
        expect(icon.src).toMatch(/\.(svg|png)$/);
        expect(icon.sizes).toBeDefined();
        expect(icon.type).toMatch(/^image\/(svg\+xml|png)$/);
      });
    });

    it('should have valid start_url', () => {
      expect(manifest.start_url).toBe('/');
    });

    it('should have description', () => {
      expect(manifest.description).toBeDefined();
      expect(manifest.description.length).toBeGreaterThan(0);
    });
  });

  describe('Service Worker', () => {
    let serviceWorkerCode: string;

    beforeEach(() => {
      const swPath = join(__dirname, '../../public/sw.js');
      serviceWorkerCode = readFileSync(swPath, 'utf-8');
    });

    it('should define CACHE_NAME constant', () => {
      expect(serviceWorkerCode).toContain('CACHE_NAME');
      expect(serviceWorkerCode).toMatch(/CACHE_NAME\s*=\s*[`'"]jargon-v/);
    });

    it('should have install event listener', () => {
      expect(serviceWorkerCode).toContain("addEventListener('install'");
      expect(serviceWorkerCode).toContain('caches.open');
    });

    it('should have activate event listener', () => {
      expect(serviceWorkerCode).toContain("addEventListener('activate'");
      expect(serviceWorkerCode).toContain('caches.keys');
    });

    it('should have fetch event listener', () => {
      expect(serviceWorkerCode).toContain("addEventListener('fetch'");
    });

    it('should cache essential assets', () => {
      expect(serviceWorkerCode).toContain('SHELL_ASSETS');
      expect(serviceWorkerCode).toContain('/index.html');
      expect(serviceWorkerCode).toContain('/logo.svg');
      expect(serviceWorkerCode).toContain('/manifest.json');
    });

    it('should skip WebSocket requests', () => {
      expect(serviceWorkerCode).toContain('ws:');
      expect(serviceWorkerCode).toContain('wss:');
    });

    it('should skip API requests', () => {
      expect(serviceWorkerCode).toContain('/api/');
    });

    it('should implement skipWaiting', () => {
      expect(serviceWorkerCode).toContain('skipWaiting');
    });

    it('should implement clients.claim', () => {
      expect(serviceWorkerCode).toContain('clients.claim');
    });

    it('should clean up old caches', () => {
      expect(serviceWorkerCode).toContain('caches.delete');
    });

    it('should handle network-first strategy', () => {
      expect(serviceWorkerCode).toContain('fetch(event.request)');
      expect(serviceWorkerCode).toContain('caches.match');
    });
  });

  describe('Service Worker Registration', () => {
    let mainTsxCode: string;

    beforeEach(() => {
      const mainPath = join(__dirname, '../../src/main.tsx');
      mainTsxCode = readFileSync(mainPath, 'utf-8');
    });

    it('should check for serviceWorker support', () => {
      expect(mainTsxCode).toContain("'serviceWorker' in navigator");
    });

    it('should only register in production', () => {
      expect(mainTsxCode).toContain('import.meta.env.PROD');
    });

    it('should register service worker on load event', () => {
      expect(mainTsxCode).toContain("addEventListener('load'");
      expect(mainTsxCode).toContain('navigator.serviceWorker');
      expect(mainTsxCode).toContain('.register');
    });

    it('should register sw.js', () => {
      expect(mainTsxCode).toContain("register('/sw.js')");
    });

    it('should handle registration success', () => {
      expect(mainTsxCode).toContain('navigator.serviceWorker.register');
    });

    it('should handle SW updates', () => {
      expect(mainTsxCode).toContain('updatefound');
    });

    it('should check for updates periodically', () => {
      expect(mainTsxCode).toContain('setInterval');
      expect(mainTsxCode).toContain('registration.update');
    });
  });

  describe('HTML Meta Tags', () => {
    let indexHtml: string;

    beforeEach(() => {
      const htmlPath = join(__dirname, '../../index.html');
      indexHtml = readFileSync(htmlPath, 'utf-8');
    });

    it('should include manifest link', () => {
      expect(indexHtml).toContain('<link rel="manifest"');
      expect(indexHtml).toContain('href="/manifest.json"');
    });

    it('should have theme-color meta tag', () => {
      expect(indexHtml).toContain('<meta name="theme-color"');
      expect(indexHtml).toContain('content="#1a1a1a"');
    });

    it('should have apple-touch-icon', () => {
      expect(indexHtml).toContain('<link rel="apple-touch-icon"');
      expect(indexHtml).toContain('href="/logo.svg"');
    });

    it('should have mobile-web-app-capable', () => {
      expect(indexHtml).toContain('<meta name="mobile-web-app-capable"');
      expect(indexHtml).toContain('content="yes"');
    });

    it('should have apple-mobile-web-app-status-bar-style', () => {
      expect(indexHtml).toContain('<meta name="apple-mobile-web-app-status-bar-style"');
      expect(indexHtml).toContain('content="black-translucent"');
    });

    it('should have apple-mobile-web-app-title', () => {
      expect(indexHtml).toContain('<meta name="apple-mobile-web-app-title"');
      expect(indexHtml).toContain('content="Jargon"');
    });

    it('should have Microsoft tile color', () => {
      expect(indexHtml).toContain('<meta name="msapplication-TileColor"');
    });

    it('should have Microsoft tile image', () => {
      expect(indexHtml).toContain('<meta name="msapplication-TileImage"');
    });

    it('should have viewport meta tag', () => {
      expect(indexHtml).toContain('<meta name="viewport"');
      expect(indexHtml).toContain('width=device-width');
    });
  });
});
