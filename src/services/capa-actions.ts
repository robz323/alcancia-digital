import { Action, IAgentRuntime, Memory, HandlerCallback, ActionResult } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { capaService, OnRampRequest, OffRampRequest } from './capa-service';
import { telegramStarknetStore } from './telegram-starknet';

/**
 * Action to buy crypto with fiat (On-Ramp) using Capa
 */
export const BUY_CRYPTO_WITH_CAPA: Action = {
  name: 'BUY_CRYPTO_WITH_CAPA',
  description: 'Genera un enlace para comprar criptomonedas con dinero fiat usando Capa Network',
  similes: [
    'COMPRAR_CRYPTO_CAPA',
    'BUY_CRYPTO_FIAT',
    'ONRAMP_CAPA',
    'COMPRAR_USDC_PESOS',
    'COMPRAR_CRYPTO_DINERO',
  ],
  examples: [
    [
      {
        name: '{{user1}}',
        content: {
          text: 'comprar crypto con pesos',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: '¡Te ayudo a comprar crypto con pesos mexicanos! 💰\n\nAquí tienes el enlace para comprar USDC:\n\n🔗 [Comprar USDC con MXN](https://capa.fi/buy?crypto=USDC&fiat=MXN&amount=100&partnerId=alcancia&externalUserId=user123&wallet=0x...)\n\nEste enlace te llevará a Capa donde podrás:\n✅ Usar tu tarjeta o transferencia bancaria\n✅ Recibir USDC directamente en tu alcancía\n✅ Transacción segura y rápida',
          action: 'BUY_CRYPTO_WITH_CAPA',
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'quiero comprar 50 dólares de USDC',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: '💵 Perfecto, te genero el enlace para comprar $50 USD en USDC\n\n🔗 [Comprar $50 USDC](https://capa.fi/buy?crypto=USDC&fiat=MXN&amount=50&partnerId=alcancia&externalUserId=user123&wallet=0x...)\n\nDetalles:\n• Monto: $50 USD en USDC\n• Método: Tarjeta/Transferencia\n• Destino: Tu alcancía digital\n• Red: Ethereum\n\n¡El proceso toma solo unos minutos! 🚀',
          action: 'BUY_CRYPTO_WITH_CAPA',
        },
      },
    ],
  ],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content as any)?.text?.toLowerCase() || '';
    return (
      (text.includes('comprar') && (text.includes('crypto') || text.includes('usdc') || text.includes('ethereum'))) ||
      (text.includes('buy') && text.includes('crypto')) ||
      text.includes('onramp') ||
      text.includes('fiat') ||
      (text.includes('pesos') && text.includes('crypto'))
    );
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: any,
    options?: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      if (!capaService.isConfigured()) {
        return {
          text: '❌ **Error de configuración**\n\nEl servicio de Capa no está configurado correctamente.\n\nContacta al administrador para configurar las credenciales de Capa Network.',
          success: false,
        };
      }

      const userEntityId = (message.content as any)?.source === 'telegram' 
        ? (message as any)?.userId?.toString() || message.agentId 
        : message.agentId;

      // Get or create account for user
      const account = telegramStarknetStore.ensureAccountForEntityId(userEntityId);
      if (!account.accountAddressHex) {
        return {
          text: '❌ **Error**\n\nPrimero necesitas crear tu alcancía digital.\n\nEscribe: "crear alcancía"',
          success: false,
        };
      }

      const text = (message.content as any)?.text?.toLowerCase() || '';
      const defaults = capaService.getDefaults();
      
      // Extract amount from text (simple regex)
      let amount = 100; // default
      const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
      if (amountMatch) {
        amount = parseFloat(amountMatch[1]);
      }

      // Determine crypto and fiat based on text
      let crypto = defaults.crypto;
      let fiat = defaults.fiat;
      
      if (text.includes('eth') || text.includes('ethereum')) crypto = 'ETH';
      if (text.includes('usdc')) crypto = 'USDC';
      if (text.includes('usdt')) crypto = 'USDT';
      
      if (text.includes('usd') || text.includes('dólar') || text.includes('dollar')) fiat = 'USD';
      if (text.includes('mxn') || text.includes('peso')) fiat = 'MXN';
      if (text.includes('cop') || text.includes('colombia')) fiat = 'COP';

      const onRampRequest: OnRampRequest = {
        crypto,
        fiat,
        blockchain: defaults.blockchain,
        amount,
        userEntityId,
        walletAddress: account.accountAddressHex,
      };

      const buyLink = capaService.generateOnRampLink(onRampRequest);

      const responseText = `💰 **Comprar ${crypto} con ${fiat}**\n\n` +
        `🎯 **Detalles:**\n` +
        `• Monto: $${amount} ${fiat}\n` +
        `• Crypto: ${crypto}\n` +
        `• Red: ${defaults.blockchain}\n` +
        `• Destino: ${account.accountAddressHex.slice(0, 10)}...${account.accountAddressHex.slice(-8)}\n\n` +
        `🔗 **[Completar compra en Capa](${buyLink})**\n\n` +
        `✅ Proceso 100% seguro\n` +
        `✅ Pagos con tarjeta/transferencia\n` +
        `✅ Crypto directo a tu alcancía\n` +
        `⚡ Confirmación en minutos\n\n` +
        `_Clic en el enlace para continuar en Capa Network_`;

      logger.info({
        userEntityId,
        crypto,
        fiat,
        amount,
        walletAddress: account.accountAddressHex,
      }, 'Generated Capa buy link');

      if (callback) {
        await callback({
          text: responseText,
          action: BUY_CRYPTO_WITH_CAPA.name,
          source: message.content.source,
        });
      }

      return {
        text: responseText,
        success: true,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
      }, 'Error in BUY_CRYPTO_WITH_CAPA action');
      
      const errorText = '❌ **Error**\n\nHubo un problema al generar el enlace de compra. Inténtalo de nuevo en unos momentos.';
      if (callback) {
        await callback({
          text: errorText,
          action: BUY_CRYPTO_WITH_CAPA.name,
          source: message.content.source,
        });
      }
      return {
        text: errorText,
        success: false,
      };
    }
  },
};

/**
 * Action to sell crypto for fiat (Off-Ramp) using Capa
 */
export const SELL_CRYPTO_WITH_CAPA: Action = {
  name: 'SELL_CRYPTO_WITH_CAPA',
  description: 'Genera un enlace para vender criptomonedas por dinero fiat usando Capa Network',
  similes: [
    'VENDER_CRYPTO_CAPA',
    'SELL_CRYPTO_FIAT',
    'OFFRAMP_CAPA',
    'VENDER_USDC_PESOS',
    'CONVERTIR_CRYPTO_DINERO',
  ],
  examples: [
    [
      {
        name: '{{user1}}',
        content: {
          text: 'vender crypto por pesos',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: '💸 ¡Te ayudo a convertir tu crypto a pesos! \n\nAquí tienes el enlace para vender USDC:\n\n🔗 [Vender USDC por MXN](https://capa.fi/sell?crypto=USDC&fiat=MXN&amount=100&partnerId=alcancia&externalUserId=user123&wallet=0x...)\n\nEste enlace te llevará a Capa donde podrás:\n✅ Recibir pesos en tu cuenta bancaria\n✅ Proceso rápido y seguro\n✅ Mejores tasas de cambio',
          action: 'SELL_CRYPTO_WITH_CAPA',
        },
      },
    ],
  ],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content as any)?.text?.toLowerCase() || '';
    return (
      (text.includes('vender') && (text.includes('crypto') || text.includes('usdc') || text.includes('ethereum'))) ||
      (text.includes('sell') && text.includes('crypto')) ||
      text.includes('offramp') ||
      text.includes('convertir') ||
      (text.includes('pesos') && (text.includes('vender') || text.includes('convertir')))
    );
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: any,
    options?: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      if (!capaService.isConfigured()) {
        return {
          text: '❌ **Error de configuración**\n\nEl servicio de Capa no está configurado correctamente.\n\nContacta al administrador para configurar las credenciales de Capa Network.',
          success: false,
        };
      }

      const userEntityId = (message.content as any)?.source === 'telegram' 
        ? (message as any)?.userId?.toString() || message.agentId 
        : message.agentId;

      // Get or create account for user
      const account = telegramStarknetStore.ensureAccountForEntityId(userEntityId);
      if (!account.accountAddressHex) {
        return {
          text: '❌ **Error**\n\nPrimero necesitas crear tu alcancía digital.\n\nEscribe: "crear alcancía"',
          success: false,
        };
      }

      const text = (message.content as any)?.text?.toLowerCase() || '';
      const defaults = capaService.getDefaults();
      
      // Extract amount from text (simple regex)
      let amount = 100; // default
      const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
      if (amountMatch) {
        amount = parseFloat(amountMatch[1]);
      }

      // Determine crypto and fiat based on text
      let crypto = defaults.crypto;
      let fiat = defaults.fiat;
      
      if (text.includes('eth') || text.includes('ethereum')) crypto = 'ETH';
      if (text.includes('usdc')) crypto = 'USDC';
      if (text.includes('usdt')) crypto = 'USDT';
      
      if (text.includes('usd') || text.includes('dólar') || text.includes('dollar')) fiat = 'USD';
      if (text.includes('mxn') || text.includes('peso')) fiat = 'MXN';
      if (text.includes('cop') || text.includes('colombia')) fiat = 'COP';

      const offRampRequest: OffRampRequest = {
        crypto,
        fiat,
        blockchain: defaults.blockchain,
        amount,
        userEntityId,
        walletAddress: account.accountAddressHex,
      };

      const sellLink = capaService.generateOffRampLink(offRampRequest);

      const responseText = `💸 **Vender ${crypto} por ${fiat}**\n\n` +
        `🎯 **Detalles:**\n` +
        `• Monto: $${amount} ${crypto}\n` +
        `• Recibir: ${fiat}\n` +
        `• Red: ${defaults.blockchain}\n` +
        `• Origen: ${account.accountAddressHex.slice(0, 10)}...${account.accountAddressHex.slice(-8)}\n\n` +
        `🔗 **[Completar venta en Capa](${sellLink})**\n\n` +
        `✅ Transferencia directa a tu banco\n` +
        `✅ Mejores tasas del mercado\n` +
        `✅ Proceso seguro y rápido\n` +
        `⚡ Dinero en tu cuenta en horas\n\n` +
        `_Clic en el enlace para continuar en Capa Network_`;

      logger.info({
        userEntityId,
        crypto,
        fiat,
        amount,
        walletAddress: account.accountAddressHex,
      }, 'Generated Capa sell link');

      if (callback) {
        await callback({
          text: responseText,
          action: SELL_CRYPTO_WITH_CAPA.name,
          source: message.content.source,
        });
      }

      return {
        text: responseText,
        success: true,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
      }, 'Error in SELL_CRYPTO_WITH_CAPA action');
      
      const errorText = '❌ **Error**\n\nHubo un problema al generar el enlace de venta. Inténtalo de nuevo en unos momentos.';
      if (callback) {
        await callback({
          text: errorText,
          action: SELL_CRYPTO_WITH_CAPA.name,
          source: message.content.source,
        });
      }
      return {
        text: errorText,
        success: false,
      };
    }
  },
};

/**
 * Action to check Capa transaction status
 */
export const CHECK_CAPA_TRANSACTION: Action = {
  name: 'CHECK_CAPA_TRANSACTION',
  description: 'Consulta el estado de transacciones de Capa Network',
  similes: [
    'ESTADO_TRANSACCION_CAPA',
    'CHECK_CAPA_STATUS',
    'VER_ESTADO_CAPA',
    'CONSULTAR_CAPA',
  ],
  examples: [
    [
      {
        name: '{{user1}}',
        content: {
          text: 'estado transacciones capa',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: '📊 **Estado de tus transacciones Capa**\n\n🔄 **Transacciones recientes:**\n\n1. **Compra USDC** - $100 MXN\n   ✅ Completada (hace 2 horas)\n   🆔 TX: capa_tx_123...\n\n2. **Venta ETH** - $50 USD\n   ⏳ Pendiente\n   🆔 TX: capa_tx_456...\n\n_Para más detalles, visita tu panel en Capa Network_',
          action: 'CHECK_CAPA_TRANSACTION',
        },
      },
    ],
  ],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content as any)?.text?.toLowerCase() || '';
    return (
      text.includes('estado') ||
      text.includes('status') ||
      text.includes('transaccion') ||
      text.includes('capa')
    ) && (
      text.includes('capa') ||
      text.includes('estado') ||
      text.includes('consultar')
    );
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: any,
    options?: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      if (!capaService.isConfigured()) {
        const errorText = '❌ **Error de configuración**\n\nEl servicio de Capa no está configurado correctamente.';
        if (callback) {
          await callback({
            text: errorText,
            action: CHECK_CAPA_TRANSACTION.name,
            source: message.content.source,
          });
        }
        return {
          text: errorText,
          success: false,
        };
      }

      const userEntityId = (message.content as any)?.source === 'telegram' 
        ? (message as any)?.userId?.toString() || message.agentId 
        : message.agentId;

      const transactionsResult = await capaService.getUserTransactions(userEntityId);

      if (!transactionsResult.success || !transactionsResult.data) {
        const errorText = '❌ **Error**\n\nNo se pudieron obtener las transacciones. Inténtalo más tarde.';
        if (callback) {
          await callback({
            text: errorText,
            action: CHECK_CAPA_TRANSACTION.name,
            source: message.content.source,
          });
        }
        return {
          text: errorText,
          success: false,
        };
      }

      const transactions = transactionsResult.data;

      if (transactions.length === 0) {
        const noTxText = '📊 **Transacciones Capa**\n\n🔍 No tienes transacciones registradas en Capa Network.\n\n💡 **¿Quieres empezar?**\n• "comprar crypto" - Para comprar con pesos\n• "vender crypto" - Para convertir a fiat';
        if (callback) {
          await callback({
            text: noTxText,
            action: CHECK_CAPA_TRANSACTION.name,
            source: message.content.source,
          });
        }
        return {
          text: noTxText,
          success: true,
        };
      }

      let responseText = '📊 **Tus transacciones Capa**\n\n';

      transactions.slice(0, 5).forEach((tx, index) => {
        const statusEmoji = tx.status === 'completed' ? '✅' : 
                           tx.status === 'pending' ? '⏳' : 
                           tx.status === 'failed' ? '❌' : '❓';
        
        const typeText = tx.crypto && tx.fiat ? 
          `${tx.crypto} ↔️ ${tx.fiat}` : 
          `${tx.crypto || 'Crypto'}`;

        responseText += `${index + 1}. **${typeText}** - $${tx.amount}\n`;
        responseText += `   ${statusEmoji} ${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}\n`;
        responseText += `   🆔 ${tx.id.slice(0, 12)}...\n\n`;
      });

      if (transactions.length > 5) {
        responseText += `_Y ${transactions.length - 5} transacciones más..._\n\n`;
      }

      responseText += '💡 **Tip:** Visita [Capa Network](https://capa.fi) para ver detalles completos';

      if (callback) {
        await callback({
          text: responseText,
          action: CHECK_CAPA_TRANSACTION.name,
          source: message.content.source,
        });
      }
      return {
        text: responseText,
        success: true,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
      }, 'Error in CHECK_CAPA_TRANSACTION action');
      
      const errorText = '❌ **Error**\n\nHubo un problema al consultar las transacciones. Inténtalo de nuevo.';
      if (callback) {
        await callback({
          text: errorText,
          action: CHECK_CAPA_TRANSACTION.name,
          source: message.content.source,
        });
      }
      return {
        text: errorText,
        success: false,
      };
    }
  },
};

export const capaActions = [
  BUY_CRYPTO_WITH_CAPA,
  SELL_CRYPTO_WITH_CAPA,
  CHECK_CAPA_TRANSACTION,
];
