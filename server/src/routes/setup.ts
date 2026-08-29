import { Router } from 'express';
import { getSettings, listProducts } from '../db.js';
import { fonteDeDados } from '../demo.js';
import { diagnostico } from '../hospedagem.js';
import { publish } from '../engine.js';
import { discoverChatId, checkBot } from '../alerts/telegram.js';
import { saveSettings } from '../db.js';
import { generateWithVoice, safetyInfo, useDefaultSafety } from '../safety.js';
import { checkKey } from '../tts/elevenlabs.js';
import { findVoice } from '../voices.js';

export const setupRouter = Router();

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: { label: string; auto: boolean };
  goto?: string;
}

/**
 * Diagnóstico com botão de resolver, não tutorial de texto. Cada item que
 * puder ser consertado sem o lojista entender o problema, é consertado por
 * POST /api/setup/fix/:id.
 */
export async function runChecks(): Promise<Check[]> {
  const settings = getSettings();
  const products = listProducts(true);
  const checks: Check[] = [];

  checks.push(
    products.length > 0
      ? {
          id: 'produtos',
          label: 'Produtos cadastrados',
          status: 'ok',
          detail: `${products.length} produto${products.length > 1 ? 's' : ''} na rotação`,
        }
      : {
          id: 'produtos',
          label: 'Produtos cadastrados',
          status: 'fail',
          detail: 'Cadastre pelo menos um produto para a IA ter o que narrar',
          goto: 'produtos',
        },
  );

  const voice = findVoice(settings.voiceId);
  if (settings.elevenLabsApiKey) {
    const key = await checkKey(settings.elevenLabsApiKey);
    checks.push({
      id: 'voz',
      label: `Voz: ${voice.label}`,
      status: key.ok ? 'ok' : 'warn',
      detail: key.ok
        ? 'Voz premium ativa (com queda automática para a voz do navegador)'
        : `Voz premium indisponível (${key.error}). A live usa a voz do navegador.`,
      fix: key.ok ? undefined : { label: 'Usar a voz do navegador', auto: true },
    });
  } else {
    checks.push({
      id: 'voz',
      label: `Voz: ${voice.label}`,
      status: 'ok',
      detail: 'Voz nativa do navegador. Não precisa instalar nada nem criar conta.',
    });
  }

  const fonte = fonteDeDados();
  checks.push({
    id: 'dados-da-live',
    label: 'Audiência e vendas',
    status: fonte === 'tiktok' ? 'ok' : 'warn',
    detail:
      fonte === 'tiktok'
        ? 'Números reais vindos do TikTok Shop'
        : fonte === 'demo'
          ? 'MODO DEMO ligado: os números na tela são simulados, não medidos.'
          : 'Sem integração com o TikTok Shop. O painel não mede audiência nem vendas — os dois números aparecem vazios.',
  });

  // Duas perguntas sobre a hospedagem que so o tempo responde. O produto mede
  // sozinho em vez de mandar o lojista conferir painel de fornecedor.
  const hosp = diagnostico();
  checks.push({
    id: 'disco',
    label: 'Os dados sobrevivem a um deploy',
    status: hosp.persistenciaConfirmada ? 'ok' : 'warn',
    detail: hosp.persistenciaConfirmada
      ? `Confirmado: ${hosp.boots} reinícios e os dados continuam aqui desde ${new Date(hosp.primeiroBootEm).toLocaleDateString('pt-BR')}.`
      : 'Ainda não dá para afirmar. Este é o primeiro boot registrado — force um deploy e volte aqui: se este número não subir, o disco não está guardando nada.',
  });

  if (hosp.quedas24h.length > 0) {
    const minutos = Math.round(hosp.maiorQueda24hSegundos / 60);
    checks.push({
      id: 'hibernacao',
      label: 'O servidor fica de pé o tempo todo',
      status: hosp.hibernando ? 'fail' : 'warn',
      detail: hosp.hibernando
        ? `${hosp.quedas24h.length} quedas nas últimas 24h, a maior de ${minutos} min. Isso é padrão de plano que hiberna — e servidor hibernado não dispara alerta de falha.`
        : `${hosp.quedas24h.length} interrupção(ões) nas últimas 24h, a maior de ${minutos} min. Normal se você fez deploy; preocupante se não fez.`,
    });
  }

  const safety = safetyInfo();
  checks.push({
    id: 'audio-seguranca',
    label: 'Áudio de segurança',
    status: safety.kind === 'padrao' ? 'warn' : 'ok',
    detail:
      safety.kind === 'padrao'
        ? 'Usando a trilha de espera embutida. Uma mensagem falada segura melhor a audiência.'
        : safety.label,
    fix: safety.kind === 'padrao' && settings.elevenLabsApiKey ? { label: 'Gerar com a voz escolhida', auto: true } : undefined,
    goto: safety.kind === 'padrao' ? 'seguranca' : undefined,
  });

  if (settings.telegramBotToken && settings.telegramChatId) {
    const bot = await checkBot(settings.telegramBotToken);
    checks.push({
      id: 'alerta-celular',
      label: 'Alerta no celular',
      status: bot.ok ? 'ok' : 'warn',
      detail: bot.ok ? `Telegram conectado (@${bot.username})` : `Bot inacessível: ${bot.error}`,
      goto: bot.ok ? undefined : 'alertas',
    });
  } else if (settings.telegramBotToken) {
    checks.push({
      id: 'alerta-celular',
      label: 'Alerta no celular',
      status: 'warn',
      detail: 'Token salvo, falta descobrir a conversa. Mande /start para o seu bot.',
      fix: { label: 'Detectar automaticamente', auto: true },
      goto: 'alertas',
    });
  } else {
    checks.push({
      id: 'alerta-celular',
      label: 'Alerta no celular',
      status: 'warn',
      detail: 'Sem Telegram, o alerta de falha só aparece no painel.',
      goto: 'alertas',
    });
  }

  return checks;
}

setupRouter.get('/checks', async (_req, res) => {
  res.json({ checks: await runChecks() });
});

setupRouter.post('/fix/:id', async (req, res) => {
  const id = req.params.id;
  if (id === 'audio-seguranca') {
    const generated = await generateWithVoice();
    if (!generated.ok) {
      const info = useDefaultSafety();
      return res.status(200).json({ ok: false, error: generated.error, safety: info, checks: await runChecks() });
    }
    publish();
    return res.json({ ok: true, safety: generated.info, checks: await runChecks() });
  }
  if (id === 'alerta-celular') {
    const settings = getSettings();
    const found = await discoverChatId(settings.telegramBotToken);
    if (!found.ok || !found.chatId) {
      return res.status(200).json({ ok: false, error: found.error, checks: await runChecks() });
    }
    saveSettings({ telegramChatId: found.chatId });
    publish();
    return res.json({ ok: true, chatId: found.chatId, checks: await runChecks() });
  }
  if (id === 'voz') {
    saveSettings({ elevenLabsApiKey: '' });
    publish();
    return res.json({ ok: true, checks: await runChecks() });
  }
  return res.status(400).json({ error: 'Esse item precisa de uma ação sua', checks: await runChecks() });
});
