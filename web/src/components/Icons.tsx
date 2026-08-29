/**
 * Ícones desenhados à mão, inline.
 *
 * Nada de biblioteca externa: a interface já perdeu a folha de estilo uma vez
 * num deploy, e cada arquivo a mais é uma chance a mais de a tela abrir quebrada
 * na frente do lojista. São dez ícones — cabem aqui.
 */
const TRACOS: Record<string, string> = {
  inicio: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6',
  painel: 'M12 12h.01M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13',
  produtos: 'M21 8.5 12 3.5 3 8.5m18 0v7L12 20.5 3 15.5v-7m18 0L12 13.5 3 8.5m9 5v7',
  vozes: 'M4 10v4M8 6.5v11M12 3.5v17M16 7.5v9M20 10.5v3',
  instalacao: 'M9 3v6M15 3v6M6.5 9h11v4a5.5 5.5 0 0 1-11 0V9ZM12 18.5V22',
  ajustes: 'M5 7h9M18 7h1M5 12h3M12 12h7M5 17h9M18 17h1M16 5v4M10 10v4M16 15v4',
  roteiro: 'M12 3.5 13.7 8.3 18.5 10 13.7 11.7 12 16.5 10.3 11.7 5.5 10l4.8-1.7ZM18 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z',
  chat: 'M4 5.5h16v10H9l-5 4v-4H4v-10ZM8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01',
  clonagem: 'M12 3.5a3 3 0 0 0-3 3v4.5a3 3 0 0 0 6 0V6.5a3 3 0 0 0-3-3ZM6 11v.5a6 6 0 0 0 12 0V11M12 17.5V21',
  contas: 'M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20v-.5a6.5 6.5 0 0 1 13 0v.5M16.5 4.5a3.5 3.5 0 0 1 0 6.8M18 13.8a6.5 6.5 0 0 1 3 5.5v.7',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.5 2',
  seta: 'M5 12h14M13 6l6 6-6 6',
};

export type NomeDoIcone = keyof typeof TRACOS;

export function Icone({ nome, tamanho = 20 }: { nome: string; tamanho?: number }) {
  const traco = TRACOS[nome];
  if (!traco) return null;
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d={traco} />
    </svg>
  );
}
