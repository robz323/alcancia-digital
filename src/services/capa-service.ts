import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto-js';
import { logger } from '@elizaos/core';

interface CapaConfig {
  apiUrl: string;
  partnerId: string;
  apiKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
  defaultFiat: string;
  defaultCrypto: string;
  defaultBlockchain: string;
  webhookSecret: string;
}

interface OnRampRequest {
  crypto: string;
  fiat: string;
  blockchain: string;
  amount: number;
  userEntityId: string;
  walletAddress: string;
  redirectUrl?: string;
}

interface OffRampRequest {
  crypto: string;
  fiat: string;
  blockchain: string;
  amount: number;
  userEntityId: string;
  walletAddress: string;
  bankAccount?: string;
}

interface CapaTransaction {
  id: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  crypto: string;
  fiat: string;
  blockchain: string;
  userEntityId: string;
  walletAddress: string;
  transactionHash?: string;
  createdAt: string;
  updatedAt: string;
}

interface CapaResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export class CapaService {
  private config: CapaConfig;
  private client: AxiosInstance;

  constructor() {
    this.config = {
      apiUrl: 'https://app.capa.fi',
      partnerId: '860c9907-c0a8-44ce-aca6-8e242f668ef8',
      apiKey: process.env.CAPA_API_KEY || '',
      secretKey: process.env.CAPA_SECRET_KEY || '',
      environment: (process.env.CAPA_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
      defaultFiat: process.env.CAPA_DEFAULT_FIAT || 'MXN',
      defaultCrypto: process.env.CAPA_DEFAULT_CRYPTO || 'USDC',
      defaultBlockchain: process.env.CAPA_DEFAULT_BLOCKCHAIN || 'ethereum',
      webhookSecret: process.env.CAPA_WEBHOOK_SECRET || '',
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Partner-ID': this.config.partnerId,
        'X-API-Key': this.config.apiKey,
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use((config) => {
      if (config.data) {
        const timestamp = Date.now().toString();
        const signature = this.generateSignature(config.data, timestamp);
        config.headers['X-Timestamp'] = timestamp;
        config.headers['X-Signature'] = signature;
      }
      return config;
    });

    logger.info({
      environment: this.config.environment,
      partnerId: this.config.partnerId,
    }, '[Capa] Service initialized');
  }

  private generateSignature(data: any, timestamp: string): string {
    const payload = JSON.stringify(data) + timestamp;
    return crypto.HmacSHA256(payload, this.config.secretKey).toString();
  }

  /**
   * Generate a parametrized link for on-ramp (buy crypto with fiat)
   */
  generateOnRampLink(request: OnRampRequest): string {
    const params = new URLSearchParams({
      crypto: request.crypto,
      fiat: request.fiat,
      blockchain: request.blockchain,
      amount: request.amount.toString(),
      partnerId: this.config.partnerId,
      externalUserId: request.userEntityId,
      wallet: request.walletAddress,
      ...(request.redirectUrl && { redirectUrl: request.redirectUrl }),
    });

    const link = `${this.config.apiUrl}/buy?${params.toString()}`;
    
    logger.info({
      userEntityId: request.userEntityId,
      crypto: request.crypto,
      fiat: request.fiat,
      amount: request.amount,
    }, '[Capa] Generated on-ramp link');

    return link;
  }

  /**
   * Generate a parametrized link for off-ramp (sell crypto for fiat)
   */
  generateOffRampLink(request: OffRampRequest): string {
    const params = new URLSearchParams({
      crypto: request.crypto,
      fiat: request.fiat,
      blockchain: request.blockchain,
      amount: request.amount.toString(),
      partnerId: this.config.partnerId,
      externalUserId: request.userEntityId,
      wallet: request.walletAddress,
      ...(request.bankAccount && { bankAccount: request.bankAccount }),
    });

    const link = `${this.config.apiUrl}/sell?${params.toString()}`;
    
    logger.info({
      userEntityId: request.userEntityId,
      crypto: request.crypto,
      fiat: request.fiat,
      amount: request.amount,
    }, '[Capa] Generated off-ramp link');

    return link;
  }

  /**
   * Get transaction status by ID
   */
  async getTransactionStatus(transactionId: string): Promise<CapaResponse<CapaTransaction>> {
    try {
      const response = await this.client.get(`/transactions/${transactionId}`);
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      logger.error({
        transactionId,
        error: error.message,
      }, '[Capa] Failed to get transaction status');
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get user's transaction history
   */
  async getUserTransactions(userEntityId: string): Promise<CapaResponse<CapaTransaction[]>> {
    try {
      const response = await this.client.get(`/users/${userEntityId}/transactions`);
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      logger.error({
        userEntityId,
        error: error.message,
      }, '[Capa] Failed to get user transactions');
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get supported currencies and blockchains
   */
  async getSupportedCurrencies(): Promise<CapaResponse<{
    fiat: string[];
    crypto: { symbol: string; blockchains: string[] }[];
  }>> {
    try {
      const response = await this.client.get('/currencies');
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      logger.error({
        error: error.message,
      }, '[Capa] Failed to get supported currencies');
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get current exchange rates
   */
  async getExchangeRates(from: string, to: string): Promise<CapaResponse<{
    rate: number;
    fromCurrency: string;
    toCurrency: string;
    lastUpdated: string;
  }>> {
    try {
      const response = await this.client.get(`/rates/${from}/${to}`);
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      logger.error({
        from,
        to,
        error: error.message,
      }, '[Capa] Failed to get exchange rates');
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    const expectedSignature = crypto.HmacSHA256(payload, this.config.webhookSecret).toString();
    return crypto.enc.Hex.stringify(crypto.enc.Utf8.parse(expectedSignature)) === signature;
  }

  /**
   * Process webhook notification
   */
  async processWebhook(payload: any, signature: string): Promise<CapaResponse<void>> {
    try {
      if (!this.validateWebhookSignature(JSON.stringify(payload), signature)) {
        return {
          success: false,
          error: 'Invalid webhook signature',
        };
      }

      logger.info({
        type: payload.type,
        transactionId: payload.transactionId,
        status: payload.status,
      }, '[Capa] Processing webhook');

      // Here you can add your webhook processing logic
      // For example, update your database, notify users, etc.

      return {
        success: true,
      };
    } catch (error: any) {
      logger.error({
        error: error.message,
      }, '[Capa] Failed to process webhook');
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if Capa service is properly configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.partnerId &&
      this.config.apiKey &&
      this.config.secretKey
    );
  }

  /**
   * Get default configuration for quick operations
   */
  getDefaults() {
    return {
      fiat: this.config.defaultFiat,
      crypto: this.config.defaultCrypto,
      blockchain: this.config.defaultBlockchain,
    };
  }
}

// Export singleton instance
export const capaService = new CapaService();

// Export types for use in other modules
export type {
  CapaConfig,
  OnRampRequest,
  OffRampRequest,
  CapaTransaction,
  CapaResponse,
};
