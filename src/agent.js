import OpenAI from 'openai';
import axios from 'axios';
import { readContextState, getCustomContext } from './promptStore.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// URLs dos Google Docs do fluxo n8n
const PROMPT_URL = 'https://docs.google.com/document/d/e/2PACX-1vSw76wcRiM_sVv5v3TMMluiTjGk17oLWaKc1VXpbJkgc2TlreFxfrsFUFlkO7VJcpBKerZV81D-7cLn/pub';
const FAQ_PUB_URL = 'https://docs.google.com/document/d/1Ivp-PQXhnXPQdjsOzwEQyAYw6ZF_BM_csh2EgUbTKSY/pub';

let cachedPrompt = null;
let cachedFAQ = null;

/**
 * Busca o conteúdo do Google Docs publicado e extrai SOMENTE o texto do corpo
 */
async function fetchGoogleDoc(url) {
  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    let html = String(data);

    // Remove head inteiro (scripts, styles, config do Google)
    html = html.replace(/<head[\s\S]*?<\/head>/gi, ' ');
    // Remove qualquer script/style restante
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    html = html.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

    // Pega apenas o body
    const bodyMatch = html.match(/<body[\s\S]*<\/body>/i);
    if (bodyMatch) html = bodyMatch[0];

    // Quebras de linha reais entre blocos
    html = html.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n');

    // Remove tags
    let text = html.replace(/<[^>]*>/g, '');

    // Entidades
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'");

    // Limpa linhas vazias e espaços excessivos
    text = text.split('\n')
               .map(l => l.replace(/\s+/g, ' ').trim())
               .filter(l => l.length > 0)
               .join('\n')
               .trim();

    return text;
  } catch (err) {
    console.error(`[Docs] Erro ao buscar Google Doc (${url.slice(0, 50)}...):`, err.message);
    return null;
  }
}

/**
 * Inicializa o cache dos documentos do Google Docs
 */
export async function initDocs() {
  const state = readContextState();

  if (state.source === 'custom') {
    const custom = getCustomContext();
    console.log('[Docs] Usando contexto PERSONALIZADO do painel (nao Google Docs)');
    cachedPrompt = custom;
    cachedFAQ = '';
    if (custom) console.log('[Docs] Conteudo: ' + custom.length + ' chars');
    else console.log('[Docs] Contexto customizado vazio - fallback');
    return;
  }

  if (state.source === 'none') {
    console.log('[Docs] Fonte de contexto definida como NENHUMA (apenas prompt base)');
    cachedPrompt = null;
    cachedFAQ = '';
    return;
  }

  console.log('[Docs] Buscando documento comercial (FAQ) no Google Docs...');
  cachedPrompt = await fetchGoogleDoc(PROMPT_URL);
  if (cachedPrompt) {
    const cssJunk = (cachedPrompt.match(/lst-kix|\.c\d\{|font-family/g) || []).length;
    console.log('[Docs] Documento carregado (' + cachedPrompt.length + ' chars)');
    if (cssJunk > 10) {
      console.log('[Docs] Limpando CSS residual...');
      cachedPrompt = cachedPrompt.split('\n')
        .filter(l => !/\{[^}]*:[^}]*\}/.test(l) && !/^\.|^#|^@import|^[a-z-]+\{/i.test(l))
        .join('\n');
      console.log('[Docs] Limpo: ' + cachedPrompt.length + ' chars');
    }
  } else {
    console.log('[Docs] Usando prompt padrao (fallback)');
  }

  console.log('[Docs] Buscando FAQ complementar no Google Docs...');
  try {
    const faqText = await fetchGoogleDoc(FAQ_PUB_URL);
    if (faqText && faqText.length > 100) {
      cachedFAQ = faqText;
      console.log('[Docs] FAQ carregado (' + cachedFAQ.length + ' chars)');
    } else {
      throw new Error('vazio');
    }
  } catch (err) {
    console.log('[Docs] FAQ complementar nao publicado (opcional)');
    cachedFAQ = '';
  }
}

/**
 * Recarrega o contexto sem reiniciar (chamado pelo painel)
 */
export async function reloadContext() {
  cachedPrompt = null;
  cachedFAQ = null;
  await initDocs();
}

/**
 * Prompt padrão
 */
const DEFAULT_PROMPT = `Você é o Vendedor IA1 da CWB Fight Club, uma academia de Muay Thai em Curitiba.

REGRAS:
- Seja educado, profissional e persuasivo
- Responda em português brasileiro
- Se o lead perguntar preço, informe que a primeira aula é gratuita
- Se o lead estiver irritado ou pedir gerente, transfira para atendimento humano
- Capture: nome, modalidade (Kids/50+/Adulto/Personal), objetivo, experiência, unidade
- Marque o lead como qualificado após coletar as informações mínimas
- Nunca invente informações - se não souber, pergunte ao lead

FERRAMENTAS DISPONÍVEIS:
1. Transferir para atendimento humano (lead irritado/agressivo/pedir gerente)
2. Qualificar lead (após coletar nome, modalidade, objetivo, experiência)
3. Preencher campos do lead no CRM
4. FAQ da academia
5. Agendar aula experimental`;

/**
 * Gera resposta da IA para o lead
 */
export async function getAiResponse(message, history, lead = {}, customPrompt = '') {
  if (!process.env.OPENAI_API_KEY) {
    return `Olá! Obrigado pela mensagem. Em breve um de nossos atendentes responderá.`;
  }

  // Cada automação pode definir a própria personalidade e instruções. Quando o
  // campo estiver vazio, preserva o comportamento padrão já usado em produção.
  const systemPrompt = String(customPrompt || '').trim() || DEFAULT_PROMPT;

  // Contexto comercial do Google Docs (FAQ Comercial CWB Fight Club)
  let docContext = '';
  if (cachedPrompt) {
    docContext = `\n\n=== INFORMAÇÕES OFICIAIS DA ACADEMIA (FAQ COMERCIAL) ===\nUse SEMPRE estas informações para responder o lead. Não invente preços, horários ou regras:\n\n${cachedPrompt}`;
  }
  if (cachedFAQ) {
    docContext += `\n\n=== FAQ ADICIONAL ===\n${cachedFAQ}`;
  }

  const messages = [
    { 
      role: 'system', 
      content: systemPrompt + docContext
    },
    ...history.slice(-20).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: message },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 800,
    });

    return completion.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';
  } catch (err) {
    console.error('OpenAI error:', err.message);
    return 'Desculpe, estou com dificuldades técnicas no momento. Um atendimento humano será notificado.';
  }
}

export default { getAiResponse, initDocs, reloadContext };
