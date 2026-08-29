# Bion Live

Apresentadora de IA para lives de venda no TikTok Shop.

O diferencial não é ter mais recursos que Live Fox, Tokfy, HeyGen e companhia — é **configurar em minutos sem
nenhum passo técnico e nunca deixar a live cair em silêncio sem avisar você**. Todo o escopo abaixo existe para
servir esses dois objetivos.

## O que já funciona

| Requisito | Como foi resolvido |
| --- | --- |
| Configuração em < 5 min, sem passo técnico | Assistente de 4 passos: loja + produtos → voz → alerta no celular → verificação. Nenhum terminal, nenhum driver, nenhuma extensão. |
| Sem cabo de áudio virtual | A voz sai pelo próprio navegador (Web Audio / Web Speech). No OBS ou no TikTok LIVE Studio basta ligar "áudio do sistema" — instrução na tela, dentro do produto. |
| Narração em loop, sem soar robótica | Roteiro montado de quatro conjuntos independentes (abertura, preço, destaque, chamada) girando em passos diferentes, com quebras de engajamento a cada 5 falas. Preço é falado ("89 reais e 90 centavos"), não lido em símbolos. |
| A live nunca cai sem avisar | Três camadas de failover + watchdog no servidor + alerta no Telegram. Detalhes abaixo. |
| Painel com 3 números | Assistindo agora, vendas na live, e um indicador verde/amarelo/vermelho. Nada além disso. |
| Nenhum número falso | Sem integração com o TikTok Shop, audiência e vendas aparecem como `—`, nunca como zero. O modo demo é um botão explícito e marca cada número que produz como **simulado**. |
| Teto de gasto | A voz premium tem limite de caracteres por live. Ao atingir, ela sai de cena e a voz do navegador assume — mesmo mecanismo do failover, sem fatura surpresa. |
| Botão de emergência | "Pausar e assumir eu mesmo" cala a IA na hora. Produtos, voz, roteiro e métricas continuam de pé: voltar é um clique. |

## Como a confiabilidade funciona

Essa é a parte mais importante do produto, então ela é explícita:

```
voz premium (ElevenLabs, se houver chave)
   ↓ falhou? avisa, marca degradado e desce
voz nativa do navegador  ← funciona sem cadastro, sem custo, sem instalação
   ↓ falhou? avisa e desce
áudio de segurança em loop  ← trilha embutida, sua gravação, ou mensagem gerada com a voz escolhida
```

Um quarto gatilho entra pela mesma porta: estourar o teto de gasto da voz premium tira a voz paga de cena
exatamente como uma falha dela tiraria. A live não para.

A aba do navegador mantém um oscilador inaudível tocando enquanto narra. Não é firula: o Chrome estrangula
temporizadores de abas ocultas — depois de cinco minutos, para cerca de uma volta por minuto — e o loop de
narração depende deles. Abas audíveis são isentas. Medição em `scripts/teste-aba-oculta.mjs`.

Em paralelo, o navegador manda um *heartbeat* a cada 5s. Se ele parar (aba fechada, computador travado, internet
caiu), um **watchdog no servidor** marca a live como caída e dispara o alerta mesmo sem ninguém olhando a tela.
Quando qualquer camada acima volta a responder, o sistema sobe sozinho e manda o aviso de normalizado.

Todo alerta sempre aparece no painel, mesmo que o Telegram esteja fora do ar — alerta que some porque o canal
falhou seria o pior bug possível num produto que vende confiabilidade.

## O produto se diagnostica sozinho

Duas perguntas sobre a hospedagem só se respondem com o tempo, e nenhum lojista deveria ter que caçar a resposta
num painel de fornecedor:

- **O disco guarda mesmo?** Se os dados fossem efêmeros, o contador de boots voltaria para 1 a cada deploy. Ele
  passar de 1 é a prova, e ela aparece na tela de verificação.
- **O plano hiberna?** Um pulso a cada minuto deixa rastro. Buraco no rastro significa processo fora do ar — que é
  exatamente quando o watchdog de failover não teria como avisar ninguém. Duas quedas longas em 24h e a
  verificação acusa hibernação.

Na mesma linha: senha com quebra de linha trancaria o lojista para fora do próprio painel, então a tela de login
diz isso em vez de deixar a pessoa achando que errou a senha.

## Stack

Node + TypeScript ponta a ponta (Express + SQLite nativo do Node 22 no servidor, React + Vite no navegador),
escolhido porque a narração precisa rodar no navegador de qualquer jeito para evitar cabo de áudio virtual — e
manter uma linguagem só, sem nenhuma dependência nativa para compilar, é o caminho mais curto entre "funciona na
minha máquina" e "funciona na máquina do lojista".

## Rodando localmente

```bash
npm install
npm run dev      # servidor em :4000, interface em :5173
```

Abra <http://localhost:5173>. Em produção é um comando e uma porta só:

```bash
npm run build && npm start   # tudo em http://localhost:4000
```

Nada é obrigatório no `.env` para uso local. Copie `.env.example` se quiser ligar voz premium ou Telegram por
variável de ambiente em vez de pela interface.

Para expor numa URL pública, defina `BION_SENHA` — a interface passa a pedir login e a API fica fechada. Sem ela
não há trava alguma: os produtos, o token do Telegram, a chave da ElevenLabs e o botão de encerrar a live ficam
abertos para quem tiver o link.

## Testando o fluxo completo

Automático, com navegador de verdade (Chromium via Playwright):

```bash
npm run e2e
```

Ele cadastra produto, escolhe voz, sobe a live, confere a narração e os números do painel, derruba a voz de
propósito, verifica o failover e o alerta, mata o heartbeat para acordar o watchdog, aciona o botão de emergência
e encerra a live. 20 verificações, screenshots salvos ao final.

Manual, para ver e ouvir:

1. `npm run dev` e abra <http://localhost:5173>.
2. Assistente: nome da loja, um produto (nome, preço, frase de destaque), escolha uma voz clicando em **Ouvir**.
3. Alerta no celular: crie um bot com o `@BotFather`, cole o token, mande `/start` para ele e clique em
   **Detectar automaticamente** — o `chat_id` é descoberto sozinho. Ou clique em **Configurar depois**.
4. No painel, **Iniciar live**. A narração começa e a audiência simulada alimenta os 3 números.
5. Abra **Testar o failover** e clique em *Derrubar voz do navegador*: em segundos entra o áudio de segurança, o
   status fica vermelho e o alerta dispara (no Telegram, se configurado; no painel sempre).
6. Clique em *Simular aba travada* para ver o watchdog do servidor perceber sozinho.
7. **Pausar e assumir eu mesmo** e depois **Devolver para a IA**: nada precisa ser reconfigurado.

Testes de unidade (roteiro, autenticação, autodiagnóstico, teto de gasto): `npm test`.

**O jeito mais simples de medir a aba em segundo plano é dentro do próprio produto:** com a live no ar, abra
*Testar o failover* e o painel mostra falas por minuto com a janela à vista e minimizada, com um veredito em
português. Minimize a janela por 10 minutos e volte. Não precisa de terminal, e mede o seu navegador contra a sua
instância — que é a combinação que roda nas suas lives.

O script abaixo faz a mesma medição num ambiente controlado, para quem estiver desenvolvendo:

```bash
npm run build && node scripts/teste-aba-oculta.mjs
MINUTOS_OCULTA=2 node scripts/teste-aba-oculta.mjs   # versão curta
```

Abrem duas janelas: uma com a proteção de áudio ligada, outra sem — o controle, sem o qual o resultado não
significaria nada. Depois da medição inicial o teste pede que você minimize as duas e volte em alguns minutos.

Ele precisa de você porque ocultar uma aba é estado real de janela do sistema. Em headless, e mesmo com janela
virtual sem gerenciador de janelas, o Chromium continua reportando a página como visível — três rotas foram
tentadas (segunda página, aba via `window.open`, minimizar por CDP) e nenhuma funcionou. Quando o ambiente não
reproduz a condição, o teste se declara inconclusivo em vez de fingir que provou algo.

## Colocando no ar

### Por que não Vercel (nem Netlify, nem Cloudflare Pages)

Essas plataformas rodam funções serverless: sobem para atender uma requisição e morrem. O Bion Live precisa
exatamente do contrário em dois pontos que não são negociáveis:

- **O watchdog é um processo vivo.** Ele existe para perceber que o navegador do lojista morreu — ou seja, para
  agir justamente quando *não há* mais nenhuma requisição chegando. Numa função serverless não há processo para
  perceber isso, e o alerta mais importante do produto simplesmente nunca sai.
- **O banco é um arquivo em disco.** Serverless não tem disco que sobrevive; produtos, voz e tokens sumiriam a
  cada deploy.

Também dependem de estado em memória compartilhado entre requisições (saúde, cursor do roteiro, conexões SSE
abertas), que múltiplas instâncias efêmeras não têm.

Dá para separar frontend na Vercel e servidor em outro lugar, mas isso é mais peça para manter sem ganho nenhum:
o servidor já entrega a interface.

### O que a hospedagem precisa ter

1. Processo Node sempre de pé, **sem hibernar por inatividade**.
2. Disco persistente montado em `/data`.
3. `BION_SENHA` definida — sem ela, qualquer um com o link controla a live.

### Render (o caminho mais curto)

O repositório já tem `render.yaml`. No painel: **New → Blueprint** → aponte para este repositório → defina
`BION_SENHA` quando pedir. Ele cria o serviço Docker, o disco de 1 GB em `/data` e o health check sozinho.

O plano gratuito **não serve**: hiberna após 15 min sem tráfego e não tem disco. O `starter` (US$ 7/mês) resolve os
dois.

### Railway

**New Project → Deploy from GitHub repo**. O `railway.json` já aponta para o Dockerfile. Em seguida, no painel:
adicione um *Volume* montado em `/data` e as variáveis `BION_DATA_DIR=/data` e `BION_SENHA`.

### Fly.io

```bash
fly launch --no-deploy          # já existe fly.toml, aceite o que ele propõe
fly volumes create bion_dados --size 1 --region gru
fly secrets set BION_SENHA=escolha-uma-senha-forte
fly deploy
```

O `fly.toml` já vem com `auto_stop_machines = false` — não mude isso, é o que impede a máquina de hibernar e
engolir o alerta.

### VPS ou qualquer lugar com Docker

```bash
docker build -t bion-live .
docker run -d --name bion-live -p 80:4000 \
  -v bion-dados:/data \
  -e BION_SENHA=escolha-uma-senha-forte \
  --restart unless-stopped bion-live
```

Coloque um proxy com HTTPS na frente (Caddy resolve em duas linhas). O cookie de sessão só vira `secure` sob HTTPS.

### Depois do deploy

- Abra a URL, entre com a senha e refaça o assistente (a instalação nova começa vazia).
- Configure o Telegram **antes** da primeira live de verdade: é ele que transforma o failover em algo que você
  percebe longe do computador.
- O áudio continua tocando no **seu** navegador, não no servidor. A hospedagem cuida do roteiro, da saúde e dos
  alertas; o som sai da máquina de onde você transmite.

## Fora do MVP, de propósito

Avatar em vídeo, múltiplos idiomas, múltiplas contas, CRM, estoque, testes A/B, geração de conteúdo, curso e
outras plataformas além do TikTok Shop. Nada disso entra antes de o fluxo acima ser validado com lojista de verdade.

## A decisão que ainda depende de você

A audiência e as vendas hoje vêm de uma **fonte simulada** (`server/src/integrations/audience.ts`), atrás de uma
interface de uma linha. A API de live do TikTok Shop exige aprovação de parceiro; travar o MVP nessa fila
atrasaria o teste do que realmente diferencia o produto. Quando a credencial existir, é só implementar
`AudienceSource` com os dados reais e trocar a instância — nada mais no sistema muda.

## Mapa do código

```
server/src
  engine.ts        ciclo da live, saúde, watchdog do heartbeat
  script.ts        geração do roteiro com variação (tem teste)
  safety.ts        áudio de segurança: trilha embutida, gravada ou gerada
  alerts/          Telegram (envio, validação e descoberta do chat_id)
  tts/             cliente ElevenLabs
  routes/          API HTTP + SSE do painel
  integrations/    fonte de audiência (simulada hoje, TikTok Shop depois)
web/src
  audio/narrator.ts    motor de narração e as três camadas de failover
  components/          assistente de configuração, painel, ajustes
scripts/e2e.mjs        teste ponta a ponta com navegador real
```
