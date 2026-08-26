import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'evolution_redis',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: 3,
});

const TTL = 86400; // 24h em segundos

/**
 * Busca o histórico de chat para um lead
 * @param {string|number} leadId
 * @returns {Promise<Array>} Array de { role, content }
 */
export async function getChatHistory(leadId) {
  try {
    const key = `chat:${leadId}`;
    const data = await redis.lrange(key, 0, -1);
    return data.map(item => {
      try { return JSON.parse(item); }
      catch { return { role: 'user', content: item }; }
    });
  } catch (err) {
    console.error('Redis getChatHistory error:', err.message);
    return [];
  }
}

/**
 * Salva uma mensagem no histórico do chat
 */
export async function saveChatMessage(leadId, message) {
  try {
    const key = `chat:${leadId}`;
    await redis.rpush(key, JSON.stringify(message));
    await redis.expire(key, TTL);
  } catch (err) {
    console.error('Redis saveChatMessage error:', err.message);
  }
}

/**
 * Limpa histórico de um lead
 */
export async function clearChatHistory(leadId) {
  try {
    await redis.del(`chat:${leadId}`);
  } catch (err) {
    console.error('Redis clearChatHistory error:', err.message);
  }
}

export default { getChatHistory, saveChatMessage, clearChatHistory };