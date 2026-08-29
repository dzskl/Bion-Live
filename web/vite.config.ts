import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.BION_API ?? 'http://localhost:4000';

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Costura o CSS dentro do index.html.
 *
 * A folha inteira tem ~8 KB. Deixá-la como request separado significa que uma
 * unica falha de rede (cold start da hospedagem, proxy, bloqueio do navegador)
 * entrega a interface sem estilo nenhum - pessima primeira impressao para um
 * produto que promete "funciona de primeira". Inline, ou a pagina carrega
 * inteira ou nao carrega.
 */
function inlineCss(): Plugin {
  return {
    name: 'bion-inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      let fonte = String(html.source);
      for (const [arquivo, item] of Object.entries(bundle)) {
        if (!arquivo.endsWith('.css') || item.type !== 'asset') continue;
        const tag = new RegExp(`<link[^>]*href="/${escaparRegex(arquivo)}"[^>]*>`);
        if (!tag.test(fonte)) continue;
        fonte = fonte.replace(tag, `<style>${String(item.source)}</style>`);
        delete bundle[arquivo];
      }
      html.source = fonte;
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineCss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true, ws: false },
      '/safety': { target: API, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
