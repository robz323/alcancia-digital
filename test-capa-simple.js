#!/usr/bin/env node

// Script simple para probar la configuración de Capa
require('dotenv').config();

console.log('🧪 Prueba Simple de Capa Network con Valores Dummy\n');

// Verificar variables de entorno
const config = {
  partnerId: process.env.CAPA_PARTNER_ID,
  apiKey: process.env.CAPA_API_KEY,
  secretKey: process.env.CAPA_SECRET_KEY,
  environment: process.env.CAPA_ENVIRONMENT,
  defaultFiat: process.env.CAPA_DEFAULT_FIAT,
  defaultCrypto: process.env.CAPA_DEFAULT_CRYPTO,
  defaultBlockchain: process.env.CAPA_DEFAULT_BLOCKCHAIN,
  webhookSecret: process.env.CAPA_WEBHOOK_SECRET
};

console.log('📋 Variables de Entorno Cargadas:');
Object.entries(config).forEach(([key, value]) => {
  const status = value ? '✅' : '❌';
  const displayValue = (key.includes('secret') || key.includes('Key')) ? '***' : value;
  console.log(`   ${status} ${key}: ${displayValue || 'NOT SET'}`);
});

const allConfigured = Object.values(config).every(v => v);
console.log(`\n🔧 Estado: ${allConfigured ? '✅ CONFIGURADO' : '❌ INCOMPLETO'}`);

if (allConfigured) {
  console.log('\n🚀 Simulando Funcionalidades de Capa:\n');
  
  // Mock data
  const mockUser = {
    entityId: 'telegram_user_123456',
    wallet: '0x742d35Cc1dF3c6b44e7d1A029b0e12345abcdef'
  };
  
  // Simular enlaces de compra/venta
  console.log('💰 Enlace de Compra (On-Ramp):');
  const buyParams = new URLSearchParams({
    crypto: config.defaultCrypto,
    fiat: config.defaultFiat,
    blockchain: config.defaultBlockchain,
    amount: '100',
    partnerId: config.partnerId,
    externalUserId: mockUser.entityId,
    wallet: mockUser.wallet
  });
  console.log(`   🔗 https://capa.fi/buy?${buyParams.toString()}\n`);
  
  console.log('💸 Enlace de Venta (Off-Ramp):');
  const sellParams = new URLSearchParams({
    crypto: config.defaultCrypto,
    fiat: config.defaultFiat,
    blockchain: config.defaultBlockchain,
    amount: '50',
    partnerId: config.partnerId,
    externalUserId: mockUser.entityId,
    wallet: mockUser.wallet
  });
  console.log(`   🔗 https://capa.fi/sell?${sellParams.toString()}\n`);
  
  console.log('📱 Comandos de Telegram Disponibles:');
  console.log('   • "comprar crypto" - Generar enlace de compra');
  console.log('   • "comprar 100 USDC" - Compra con monto específico');
  console.log('   • "vender crypto" - Generar enlace de venta');  
  console.log('   • "vender 50 USDC" - Venta con monto específico');
  console.log('   • "estado transacciones capa" - Ver estado');
  
  console.log('\n✨ ¡Integración de Capa lista para usar!');
  console.log('\n🎯 Próximos pasos:');
  console.log('   1. Iniciar bot: npm run dev');
  console.log('   2. Ir a Telegram y probar comandos');
  console.log('   3. Obtener credenciales reales de Capa Network');
  
} else {
  console.log('\n❌ Faltan variables de entorno. Verifica tu archivo .env');
}

console.log('\n📁 Archivos importantes:');
console.log('   • .env - Variables de configuración');
console.log('   • src/services/capa-service.ts - Servicio principal');
console.log('   • src/services/capa-actions.ts - Acciones de Telegram');
console.log('   • CAPA_INTEGRATION.md - Documentación completa');

console.log('\n⚠️  Nota: Los valores dummy no funcionarán con la API real de Capa.');
console.log('   Contacta a Capa Network para obtener credenciales de producción.');
