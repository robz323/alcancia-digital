import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type Content,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
} from '@elizaos/core';
import { z } from 'zod';
import { telegramStarknetStore, deploySmartAccountIfPossible, getEthBalanceWei, formatWeiToEth } from './services/telegram-starknet.ts';

// Evitar respuestas duplicadas por mensajes repetidos en milisegundos
const recentRouterHits = new Map<string, number>()
function shouldHandleOnce(message: Memory, textLower: string, ttlMs = 3000): boolean {
  const key = `${String(message.roomId || message.entityId)}:${textLower}`
  const now = Date.now()
  const last = recentRouterHits.get(key) || 0
  if (now - last < ttlMs) return false
  recentRouterHits.set(key, now)
  return true
}

// Rate limit para advertencias de "no account" por usuario/acción
const lastNoAccountWarnAt = new Map<string, number>()
function shouldWarnNoAccount(entityId: string, code: string, ttlMs = 10000): boolean {
  const key = `${entityId}:${code}`
  const now = Date.now()
  const last = lastNoAccountWarnAt.get(key) || 0
  if (now - last < ttlMs) return false
  lastNoAccountWarnAt.set(key, now)
  return true
}

// Evitar doble ejecución de la misma acción para el mismo mensaje
const lastActionHandledAt = new Map<string, number>()
function shouldRunActionOnce(message: Memory, actionName: string, ttlMs = 5000): boolean {
  const id = String((message as any)?.id || '')
  const textLower = String(((message?.content as any)?.text || '')).toLowerCase()
  const key = id ? `${id}:${actionName}` : `${String(message.entityId)}:${actionName}:${textLower}`
  const now = Date.now()
  const last = lastActionHandledAt.get(key) || 0
  if (now - last < ttlMs) return false
  lastActionHandledAt.set(key, now)
  return true
}

/**
 * Define the configuration schema for the plugin with the following properties:
 *
 * @param {string} EXAMPLE_PLUGIN_VARIABLE - The name of the plugin (min length of 1, optional)
 * @returns {object} - The configured schema object
 */
const configSchema = z.object({
  EXAMPLE_PLUGIN_VARIABLE: z
    .string()
    .min(1, 'Example plugin variable is not provided')
    .optional()
    .transform((val) => {
      if (!val) {
        console.warn('Warning: Example plugin variable is not provided');
      }
      return val;
    }),
});

/**
 * Example HelloWorld action
 * This demonstrates the simplest possible action structure
 */
/**
 * Represents an action that responds with a simple hello world message.
 *
 * @typedef {Object} Action
 * @property {string} name - The name of the action
 * @property {string[]} similes - The related similes of the action
 * @property {string} description - Description of the action
 * @property {Function} validate - Validation function for the action
 * @property {Function} handler - The function that handles the action
 * @property {Object[]} examples - Array of examples for the action
 */
const helloWorldAction: Action = {
  name: 'HELLO_WORLD',
  similes: ['GREET', 'SAY_HELLO'],
  description: 'Responds with a simple hello world message',

  validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State): Promise<boolean> => {
    // Always valid
    return true;
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('Handling HELLO_WORLD action');

      // Simple response content
      const responseContent: Content = {
        text: 'hello world!',
        actions: ['HELLO_WORLD'],
        source: message.content.source,
      };

      // Call back with the hello world message
      await callback(responseContent);

      return {
        text: 'Sent hello world greeting',
        values: {
          success: true,
          greeted: true,
        },
        data: {
          actionName: 'HELLO_WORLD',
          messageId: message.id,
          timestamp: Date.now(),
        },
        success: true,
      };
    } catch (error) {
      logger.error({ error }, 'Error in HELLO_WORLD action:');

      return {
        text: 'Failed to send hello world greeting',
        values: {
          success: false,
          error: 'GREETING_FAILED',
        },
        data: {
          actionName: 'HELLO_WORLD',
          error: error instanceof Error ? error.message : String(error),
        },
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Can you say hello?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'hello world!',
          actions: ['HELLO_WORLD'],
        },
      },
    ],
  ],
};

/**
 * Example Hello World Provider
 * This demonstrates the simplest possible provider implementation
 */
const helloWorldProvider: Provider = {
  name: 'HELLO_WORLD_PROVIDER',
  description: 'A simple example provider',

  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    return {
      text: 'I am a provider',
      values: {},
      data: {},
    };
  },
};

export class StarterService extends Service {
  static serviceType = 'starter';
  capabilityDescription =
    'This is a starter service which is attached to the agent through the starter plugin.';

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime) {
    logger.info('*** Starting starter service ***');
    const service = new StarterService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping starter service ***');
    // get the service from the runtime
    const service = runtime.getService(StarterService.serviceType);
    if (!service) {
      throw new Error('Starter service not found');
    }
    service.stop();
  }

  async stop() {
    logger.info('*** Stopping starter service instance ***');
  }
}

const plugin: Plugin = {
  name: 'starter',
  description: 'A starter plugin for Eliza',
  // Set lowest priority so real models take precedence
  priority: -1000,
  config: {
    EXAMPLE_PLUGIN_VARIABLE: process.env.EXAMPLE_PLUGIN_VARIABLE,
  },
  async init(config: Record<string, string>) {
    logger.info('*** Initializing starter plugin ***');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw error;
    }
  },
  models: process.env.IGNORE_LLM
    ? {}
    : {
        [ModelType.TEXT_SMALL]: async (
          _runtime,
          { prompt, stopSequences = [] }: GenerateTextParams
        ) => {
          return 'Never gonna give you up, never gonna let you down, never gonna run around and desert you...';
        },
        [ModelType.TEXT_LARGE]: async (
          _runtime,
          {
            prompt,
            stopSequences = [],
            maxTokens = 8192,
            temperature = 0.7,
            frequencyPenalty = 0.7,
            presencePenalty = 0.7,
          }: GenerateTextParams
        ) => {
          return 'Never gonna make you cry, never gonna say goodbye, never gonna tell a lie and hurt you...';
        },
      },
  routes: [
    {
      name: 'helloworld',
      path: '/helloworld',
      type: 'GET',
      handler: async (_req: any, res: any) => {
        // send a response
        res.json({
          message: 'Hello World!',
        });
      },
    },
  ],
  events: {
    MESSAGE_RECEIVED: [
      async (params) => {
        const { runtime, message, callback, source } = params as unknown as {
          runtime: IAgentRuntime
          message: Memory
          callback: HandlerCallback
          source: string
        }

        const text = (message?.content as Content)?.text ?? ''
        const textLower = text.toLowerCase()
        const isTelegram = (message?.content as Content)?.source === 'telegram' || source === 'telegram'

        if (!isTelegram || !textLower) return

        // Debounce para no manejar duplicados inmediatos
        if (!shouldHandleOnce(message, textLower)) return

        // 1) Crear cuenta invisible (wallet/alcancía/cuenta)
        if (
          textLower.includes('crear') &&
          (textLower.includes('alcancía') || textLower.includes('cuenta') || textLower.includes('wallet'))
        ) {
          logger.info({ text }, '[Router] CREATE_INVISIBLE_STARKNET_ACCOUNT matched')
          const action = runtime.actions.find((a: Action) => a.name === 'CREATE_INVISIBLE_STARKNET_ACCOUNT')
          if (!action?.handler) return
          if (!shouldRunActionOnce(message, 'CREATE_INVISIBLE_STARKNET_ACCOUNT')) return
          await action.handler(runtime, message, { values: {}, data: {}, text: '' }, {}, callback, [])
          return
        }

        // 2) Desplegar meme token
        if (
          textLower.includes('crear token') ||
          textLower.includes('meme token') ||
          textLower.includes('lanzar token')
        ) {
          logger.info({ text }, '[Router] DEPLOY_MEME_TOKEN_INVISIBLE matched')
          const action = runtime.actions.find((a: Action) => a.name === 'DEPLOY_MEME_TOKEN_INVISIBLE')
          if (!action?.handler) return
          if (!shouldRunActionOnce(message, 'DEPLOY_MEME_TOKEN_INVISIBLE')) return
          await action.handler(runtime, message, { values: {}, data: {}, text: '' }, {}, callback, [])
          return
        }

        // 3) Transferencia simple
        if (textLower.includes('enviar') || textLower.includes('transfer')) {
          logger.info({ text }, '[Router] TRANSFER_STARKNET_TOKENS_INVISIBLE matched')
          const action = runtime.actions.find((a: Action) => a.name === 'TRANSFER_STARKNET_TOKENS_INVISIBLE')
          if (!action?.handler) return
          if (!shouldRunActionOnce(message, 'TRANSFER_STARKNET_TOKENS_INVISIBLE')) return
          await action.handler(runtime, message, { values: {}, data: {}, text: '' }, {}, callback, [])
          return
        }

        // 4) Dirección de la alcancía
        if (
          textLower.includes('dirección') ||
          textLower.includes('direccion') ||
          textLower.includes('address')
        ) {
          logger.info({ text }, '[Router] SHOW_INVISIBLE_ACCOUNT_ADDRESS matched')
          const action = runtime.actions.find((a: Action) => a.name === 'SHOW_INVISIBLE_ACCOUNT_ADDRESS')
          if (!action?.handler) return
          if (!shouldRunActionOnce(message, 'SHOW_INVISIBLE_ACCOUNT_ADDRESS')) return
          await action.handler(runtime, message, { values: {}, data: {}, text: '' }, {}, callback, [])
          return
        }

        // 5) Balance de la alcancía
        if (textLower.includes('balance') || textLower.includes('saldo')) {
          logger.info({ text }, '[Router] SHOW_INVISIBLE_ACCOUNT_BALANCE matched')
          const action = runtime.actions.find((a: Action) => a.name === 'SHOW_INVISIBLE_ACCOUNT_BALANCE')
          if (!action?.handler) return
          if (!shouldRunActionOnce(message, 'SHOW_INVISIBLE_ACCOUNT_BALANCE')) return
          await action.handler(runtime, message, { values: {}, data: {}, text: '' }, {}, callback, [])
          return
        }
      },
    ],
    VOICE_MESSAGE_RECEIVED: [
      async (params) => {
        logger.info('VOICE_MESSAGE_RECEIVED event received');
        // print the keys
        logger.info({ keys: Object.keys(params) }, 'VOICE_MESSAGE_RECEIVED param keys');
      },
    ],
    WORLD_CONNECTED: [
      async (params) => {
        logger.info('WORLD_CONNECTED event received');
        // print the keys
        logger.info({ keys: Object.keys(params) }, 'WORLD_CONNECTED param keys');
      },
    ],
    WORLD_JOINED: [
      async (params) => {
        logger.info('WORLD_JOINED event received');
        // print the keys
        logger.info({ keys: Object.keys(params) }, 'WORLD_JOINED param keys');
      },
    ],
  },
  services: [StarterService],
  actions: [
    helloWorldAction,
    {
      name: 'CREATE_INVISIBLE_STARKNET_ACCOUNT',
      similes: ['CREATE_STARKNET_WALLET', 'CREATE_WALLET', 'SETUP_STARKNET_ACCOUNT'],
      description:
        'Crea una cuenta Starknet invisible asociada al usuario (Telegram). Nunca expone la clave privada.',
      validate: async (_runtime, message): Promise<boolean> => {
        if (!message?.entityId) return false;
        const text = (message.content?.text ?? '').toLowerCase();
        return text.includes('crear') || text.includes('cuenta') || text.includes('alcancía');
      },
      handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback,
        _responses?: Memory[]
      ): Promise<ActionResult> => {
        try {
          if (!shouldRunActionOnce(message, 'CREATE_INVISIBLE_STARKNET_ACCOUNT'))
            return { success: false, text: 'duplicate ignored' } as ActionResult
          const entityId = String(message.entityId ?? '');
          if (!entityId) {
            await callback({ text: 'No pude identificar al usuario.' });
            return { success: false, text: 'missing entityId' } as ActionResult;
          }

          const account = telegramStarknetStore.ensureAccountForEntityId(entityId);

          // Intento de despliegue real (best-effort): si falla por gas, mantenemos la dirección calculada/provisional
          const deploy = await deploySmartAccountIfPossible(account.privateKeyHex)
          if (deploy?.address) {
            telegramStarknetStore.setAccountAddress(entityId, deploy.address)
          }

          const addressShown = telegramStarknetStore.getAccountByEntityId(entityId)?.accountAddressHex
          const addressText = addressShown
            ? `Tu dirección de alcancía es: ${addressShown}`
            : 'Te compartiré la dirección cuando esté disponible.'

          await callback({
            text: `Listo. Creé tu alcancía digital en Starknet (cuenta invisible). ${addressText}`,
            action: 'CREATE_INVISIBLE_STARKNET_ACCOUNT',
            source: message.content.source,
          });

          return {
            success: true,
            text: 'Invisible account ready',
            values: { createdAtMs: account.createdAtMs },
            data: { entityId },
          } as ActionResult;
        } catch (error) {
          logger.error({ error }, 'CREATE_INVISIBLE_STARKNET_ACCOUNT failed');
          await callback({ text: 'No pude crear tu alcancía digital ahora. Inténtalo más tarde.' });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) } as ActionResult;
        }
      },
      examples: [
        [
          { name: '{{name1}}', content: { text: 'Quiero crear mi alcancía digital en Starknet' } },
          {
            name: '{{name2}}',
            content: {
              text:
                'Listo. Creé tu alcancía digital en Starknet (cuenta invisible). Te compartiré la dirección cuando esté disponible.',
              actions: ['CREATE_INVISIBLE_STARKNET_ACCOUNT'],
            },
          },
        ],
      ],
    },

    {
      name: 'SHOW_INVISIBLE_ACCOUNT_ADDRESS',
      similes: ['SHOW_ADDRESS', 'ADDRESS', 'DIRECCION_ALCANCIA'],
      description: 'Muestra la dirección pública de la alcancía digital en Starknet.',
      validate: async (_runtime, message): Promise<boolean> => {
        const t = (message.content?.text ?? '').toLowerCase();
        return t.includes('dirección') || t.includes('direccion') || t.includes('address') || t.includes('alcancía');
      },
      handler: async (
        _runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
      ): Promise<ActionResult> => {
        if (!shouldRunActionOnce(message, 'SHOW_INVISIBLE_ACCOUNT_ADDRESS'))
          return { success: false, text: 'duplicate ignored' } as ActionResult
        const entityId = String(message.entityId ?? '');
        if (!entityId) {
          await callback({ text: 'No pude identificar al usuario.' });
          return { success: false, text: 'missing entityId' } as ActionResult;
        }
        const acc = telegramStarknetStore.getAccountByEntityId(entityId);
        if (!acc) {
          if (shouldWarnNoAccount(entityId, 'address') && callback)
            await callback({ text: 'Primero crea tu alcancía con: "crear alcancía"' });
          return { success: false, text: 'no account' } as ActionResult;
        }
        if (!acc.accountAddressHex) {
          await callback({ text: 'Tu alcancía está creada, pero aún no tengo la dirección disponible.' });
          return { success: true, text: 'address not available yet' } as ActionResult;
        }
        await callback({ text: `Tu dirección de alcancía es: ${acc.accountAddressHex}` });
        return { success: true, text: 'address shown' } as ActionResult;
      },
      examples: [
        [
          { name: '{{name1}}', content: { text: 'Cuál es la dirección de mi alcancía?' } },
          { name: '{{name2}}', content: { text: 'Tu dirección de alcancía es: 0x...' } },
        ],
      ],
    },

    {
      name: 'SHOW_INVISIBLE_ACCOUNT_BALANCE',
      similes: ['BALANCE', 'ETH_BALANCE', 'MOSTRAR_BALANCE'],
      description: 'Muestra el balance de ETH de la alcancía en Starknet.',
      validate: async (_runtime, message): Promise<boolean> => {
        const t = (message.content?.text ?? '').toLowerCase();
        return t.includes('balance') || t.includes('saldo')
      },
      handler: async (_runtime, message, _state, _options, callback): Promise<ActionResult> => {
        if (!shouldRunActionOnce(message, 'SHOW_INVISIBLE_ACCOUNT_BALANCE'))
          return { success: false, text: 'duplicate ignored' } as ActionResult
        const entityId = String(message.entityId ?? '');
        if (!entityId) {
          if (callback) await callback({ text: 'No pude identificar al usuario.' });
          return { success: false, text: 'missing entityId' } as ActionResult;
        }
        const acc = telegramStarknetStore.getAccountByEntityId(entityId);
        if (!acc?.accountAddressHex) {
          if (shouldWarnNoAccount(entityId, 'balance') && callback)
            await callback({ text: 'Primero crea tu alcancía con: "crear alcancía"' });
          return { success: false, text: 'no address' } as ActionResult;
        }

        const wei = await getEthBalanceWei(acc.accountAddressHex);
        const eth = formatWeiToEth(wei);
        if (callback) await callback({ text: `Balance de tu alcancía: ${eth} ETH` });
        return { success: true, text: 'balance shown', values: { wei: (wei ?? 0n).toString() } } as ActionResult;
      },
      examples: [
        [
          { name: '{{name1}}', content: { text: '¿Cuál es mi balance?' } },
          { name: '{{name2}}', content: { text: 'Balance de tu alcancía: 0.0 ETH' } },
        ],
      ],
    },

    {
      name: 'TRANSFER_STARKNET_TOKENS_INVISIBLE',
      similes: ['TRANSFER_TOKEN', 'SEND_TOKENS', 'ENVIAR_TOKENS'],
      description: 'Transfiere tokens desde la cuenta invisible del usuario sin exponer claves.',
      validate: async (_runtime, message): Promise<boolean> => {
        const text = (message.content?.text ?? '').toLowerCase();
        return text.includes('enviar') || text.includes('transfer');
      },
      handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback,
        _responses?: Memory[]
      ): Promise<ActionResult> => {
        try {
          if (!shouldRunActionOnce(message, 'TRANSFER_STARKNET_TOKENS_INVISIBLE'))
            return { success: false, text: 'duplicate ignored' } as ActionResult
          const entityId = String(message.entityId ?? '');
          if (!entityId) {
            await callback({ text: 'No pude identificar al usuario.' });
            return { success: false, text: 'missing entityId' } as ActionResult;
          }

          const account = telegramStarknetStore.getAccountByEntityId(entityId);
          if (!account) {
            if (shouldWarnNoAccount(entityId, 'transfer') && callback)
              await callback({ text: 'Primero crea tu alcancía digital con: "crear alcancía"' });
            return { success: false, text: 'no account' } as ActionResult;
          }

          const transferAction = runtime.actions.find((a: Action) => a.name === 'TRANSFER_TOKEN');
          if (!transferAction) {
            await callback({ text: 'Acción de transferencia no disponible.' });
            return { success: false, text: 'TRANSFER_TOKEN not found' } as ActionResult;
          }
          if (!transferAction.handler) {
            await callback({ text: 'Handler de TRANSFER_TOKEN no disponible.' });
            return { success: false, text: 'TRANSFER_TOKEN handler missing' } as ActionResult;
          }

          const subMessage: Memory = {
            ...message,
            content: {
              ...message.content,
              action: 'TRANSFER_TOKEN',
            } as Content,
          } as Memory;

          let acknowledged = false;
          const subCallback: HandlerCallback = async (response: Content) => {
            acknowledged = true;
            const maybeText = response?.text ?? ''
            const addressMatch = /0x[0-9a-fA-F]{40,66}/.exec(maybeText)
            if (addressMatch) telegramStarknetStore.setAccountAddress(entityId, addressMatch[0])
            await callback({
              text: response?.text ?? 'Transferencia procesada.',
              action: 'TRANSFER_STARKNET_TOKENS_INVISIBLE',
              source: message.content.source,
            });
            return [];
          };

          await transferAction.handler(
            runtime,
            subMessage,
            _state,
            { starknet: { privateKeyHex: account.privateKeyHex, accountAlias: entityId } },
            subCallback,
            []
          );

          if (!acknowledged) await callback({ text: 'Se inició la transferencia. Te aviso cuando se confirme.' });

          return { success: true, text: 'transfer requested' } as ActionResult;
        } catch (error) {
          logger.error({ error }, 'TRANSFER_STARKNET_TOKENS_INVISIBLE failed');
          await callback({ text: 'No pude realizar la transferencia ahora.' });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) } as ActionResult;
        }
      },
      examples: [
        [
          { name: '{{name1}}', content: { text: 'Envía 1 MEME a 0xabc...' } },
          {
            name: '{{name2}}',
            content: {
              text: 'Se inició la transferencia. Te aviso cuando se confirme.',
              actions: ['TRANSFER_STARKNET_TOKENS_INVISIBLE'],
            },
          },
        ],
      ],
    },

    {
      name: 'DEPLOY_MEME_TOKEN_INVISIBLE',
      similes: ['DEPLOY_STARKNET_UNRUGGABLE_MEME_TOKEN'],
      description: 'Envuelve el despliegue de token meme usando la acción del plugin, ocultando claves.',
      validate: async (_runtime, message): Promise<boolean> => {
        const text = (message.content?.text ?? '').toLowerCase();
        return text.includes('crear token') || text.includes('meme token') || text.includes('lanzar token');
      },
      handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback,
        _responses?: Memory[]
      ): Promise<ActionResult> => {
        try {
          if (!shouldRunActionOnce(message, 'DEPLOY_MEME_TOKEN_INVISIBLE'))
            return { success: false, text: 'duplicate ignored' } as ActionResult
          const entityId = String(message.entityId ?? '');
          if (!entityId) {
            await callback({ text: 'No pude identificar al usuario.' });
            return { success: false, text: 'missing entityId' } as ActionResult;
          }

          const account = telegramStarknetStore.getAccountByEntityId(entityId);
          if (!account) {
            if (shouldWarnNoAccount(entityId, 'deploy') && callback)
              await callback({ text: 'Primero crea tu alcancía digital con: "crear alcancía"' });
            return { success: false, text: 'no account' } as ActionResult;
          }

          const deployAction = runtime.actions.find(
            (a: Action) => a.name === 'DEPLOY_STARKNET_UNRUGGABLE_MEME_TOKEN'
          );
          if (!deployAction) {
            await callback({ text: 'Acción de despliegue no disponible.' });
            return { success: false, text: 'DEPLOY_STARKNET_UNRUGGABLE_MEME_TOKEN not found' } as ActionResult;
          }
          if (!deployAction.handler) {
            await callback({ text: 'Handler de despliegue no disponible.' });
            return { success: false, text: 'DEPLOY_STARKNET_UNRUGGABLE_MEME_TOKEN handler missing' } as ActionResult;
          }

          const subMessage: Memory = {
            ...message,
            content: {
              ...message.content,
              action: 'DEPLOY_STARKNET_UNRUGGABLE_MEME_TOKEN',
            } as Content,
          } as Memory;

          const subCallback: HandlerCallback = async (response: Content) => {
            const maybeText = response?.text ?? ''
            const addressMatch = /0x[0-9a-fA-F]{40,66}/.exec(maybeText)
            if (addressMatch) telegramStarknetStore.setAccountAddress(entityId, addressMatch[0])
            await callback({
              text: response?.text ?? 'Token desplegado en Starknet.',
              action: 'DEPLOY_MEME_TOKEN_INVISIBLE',
              source: message.content.source,
            });
            return [];
          };

          await deployAction.handler(
            runtime,
            subMessage,
            _state,
            { starknet: { privateKeyHex: account.privateKeyHex, accountAlias: entityId } },
            subCallback,
            []
          );

          return { success: true, text: 'deploy requested' } as ActionResult;
        } catch (error) {
          logger.error({ error }, 'DEPLOY_MEME_TOKEN_INVISIBLE failed');
          await callback({ text: 'No pude desplegar el token ahora.' });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) } as ActionResult;
        }
      },
      examples: [
        [
          { name: '{{name1}}', content: { text: 'Crea un meme token en Starknet' } },
          {
            name: '{{name2}}',
            content: {
              text: 'Token desplegado en Starknet.',
              actions: ['DEPLOY_MEME_TOKEN_INVISIBLE'],
            },
          },
        ],
      ],
    },
  ],
  providers: [helloWorldProvider],
};

export default plugin;
