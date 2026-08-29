import crypto from 'node:crypto';
import type { RequestHandler, Request, Response } from 'express';
import { Router } from 'express';

/**
 * Trava de acesso.
 *
 * Local, sem senha, o produto funciona como antes. Numa URL publica ela deixa
 * de ser opcional: sem isso qualquer um com o link ve os produtos, o token do
 * Telegram, a chave da ElevenLabs e consegue derrubar a live do lojista.
 */
const SENHA_BRUTA = process.env.BION_SENHA ?? '';
const SENHA = SENHA_BRUTA.trim();
export const exigeSenha = SENHA.length > 0;

/**
 * Senha com quebra de linha tranca o lojista para fora do proprio painel: nao
 * existe como digitar um "enter" num campo de senha. Ja aconteceu uma vez, ao
 * colar varias senhas de uma lista. Detectamos e dizemos isso na tela de login,
 * em vez de deixar a pessoa achando que errou de senha.
 */
export const senhaMalformada = exigeSenha && /[\r\n\t]/.test(SENHA);

if (senhaMalformada) {
  console.error(
    '\n  [bion] ATENÇÃO: BION_SENHA contém quebra de linha ou tabulação.\n' +
      '  Ninguém vai conseguir entrar no painel. Deixe a variável com uma linha só.\n',
  );
}

const COOKIE = 'bion_sessao';
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;
const LIVRES = new Set(['/api/health', '/api/auth/status', '/api/auth/login', '/api/auth/logout']);

function assinar(expiraEm: number): string {
  return crypto.createHmac('sha256', SENHA).update(String(expiraEm)).digest('hex');
}

export function criarToken(): string {
  const expiraEm = Date.now() + DURACAO_MS;
  return `${expiraEm}.${assinar(expiraEm)}`;
}

/** Token assinado com a própria senha: sobrevive a restart sem guardar sessão. */
export function tokenValido(token: string | undefined): boolean {
  if (!token) return false;
  const [expiraRaw, assinatura] = token.split('.');
  const expiraEm = Number(expiraRaw);
  if (!expiraRaw || !assinatura || !Number.isFinite(expiraEm) || expiraEm < Date.now()) return false;
  const esperado = Buffer.from(assinar(expiraEm), 'utf8');
  const recebido = Buffer.from(assinatura, 'utf8');
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

function lerCookie(req: Request, nome: string): string | undefined {
  const bruto = req.headers.cookie;
  if (!bruto) return undefined;
  for (const parte of bruto.split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return undefined;
}

function autenticado(req: Request): boolean {
  return !exigeSenha || tokenValido(lerCookie(req, COOKIE));
}

function definirCookie(req: Request, res: Response): void {
  const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE, criarToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: seguro,
    maxAge: DURACAO_MS,
    path: '/',
  });
}

// Freio simples de forca bruta: a senha e curta e digitada por humano.
const tentativas = new Map<string, { contagem: number; janela: number }>();
const JANELA_MS = 60_000;
const MAX_TENTATIVAS = 8;

function bloqueado(ip: string): boolean {
  const agora = Date.now();
  const atual = tentativas.get(ip);
  if (!atual || agora - atual.janela > JANELA_MS) return false;
  return atual.contagem >= MAX_TENTATIVAS;
}

function registrarTentativa(ip: string): void {
  const agora = Date.now();
  const atual = tentativas.get(ip);
  if (!atual || agora - atual.janela > JANELA_MS) tentativas.set(ip, { contagem: 1, janela: agora });
  else atual.contagem += 1;
}

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  res.json({ exigeSenha, autenticado: autenticado(req), senhaMalformada });
});

authRouter.post('/login', (req, res) => {
  if (!exigeSenha) return res.json({ ok: true, autenticado: true });
  const ip = req.ip ?? 'desconhecido';
  if (bloqueado(ip)) {
    return res.status(429).json({ error: 'Muitas tentativas. Espere um minuto e tente de novo.' });
  }
  const enviada = String((req.body as { senha?: unknown }).senha ?? '');
  const a = Buffer.from(crypto.createHash('sha256').update(enviada).digest());
  const b = Buffer.from(crypto.createHash('sha256').update(SENHA).digest());
  if (!crypto.timingSafeEqual(a, b)) {
    registrarTentativa(ip);
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  tentativas.delete(ip);
  definirCookie(req, res);
  res.json({ ok: true, autenticado: true });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

/** Protege API e áudios. O HTML e o JS da interface ficam livres: não carregam segredo. */
export const protegido: RequestHandler = (req, res, next) => {
  if (!exigeSenha) return next();
  const caminho = req.path;
  const sensivel = caminho.startsWith('/api/') || caminho.startsWith('/safety/');
  if (!sensivel) return next();
  if (LIVRES.has(caminho) || caminho.startsWith('/api/auth/')) return next();
  if (autenticado(req)) return next();
  res.status(401).json({ error: 'Sessão expirada ou ausente', login: true });
};
