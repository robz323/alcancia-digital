#!/usr/bin/env node

// Script de prueba para verificar la integración de Capa Network
import { config } from 'dotenv';
import path from 'path';

// Cargar variables de entorno
config({ path: path.resolve('.env') });

console.log('🧪 Probando integración de Capa Network con valores dummy\n');

// Verificar variables de entorno
const requiredVars = [
  'CAPA_PARTNER_ID',
  'CAPA_API_KEY', 
  'CAPA_SECRET_KEY',
  'CAPA_ENVIRONMENT',
  'CAPA_DEFAULT_FIAT',
  'CAPA_DEFAULT_CRYPTO',
  'CAPA_DEFAULT_BLOCKCHAIN',
  'CAPA_WEBHOOK_SECRET'
];

console.log('📋 Verificando variables de entorno de Capa:');
let allConfigured = true;

requiredVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✅' : '❌';
  console.log(`${status} ${varName}: ${value ? (value.includes('secret') || value.includes('key') ? '***' : value) : 'NOT SET'}`);
  if (!value) allConfigured = false;
});

console.log('\n🔧 Estado de configuración:', allConfigured ? '✅ COMPLETA' : '❌ INCOMPLETA');

if (allConfigured) {
  console.log('\n🚀 Simulando funcionalidades de Capa:\n');
  
  // Simular generación de enlaces
  const mockUserEntityId = 'test_user_123';
  const mockWalletAddress = '0x742d35Cc1dF3c...' + 'abc123';
  
  console.log('💰 Simulando compra de crypto (On-Ramp):');
  const onRampParams = new URLSearchParams({
    crypto: process.env.CAPA_DEFAULT_CRYPTO,
    fiat: process.env.CAPA_DEFAULT_FIAT,
    blockchain: process.env.CAPA_DEFAULT_BLOCKCHAIN,
    amount: '100',
    partnerId: process.env.CAPA_PARTNER_ID,
    externalUserId: mockUserEntityId,
    wallet: mockWalletAddress,
  });
  
  const mockOnRampLink = `https://capa.fi/buy?${onRampParams.toString()}`;
  console.log(`   🔗 ${mockOnRampLink}\n`);
  
  console.log('💸 Simulando venta de crypto (Off-Ramp):');
  const offRampParams = new URLSearchParams({
    crypto: process.env.CAPA_DEFAULT_CRYPTO,
    fiat: process.env.CAPA_DEFAULT_FIAT,
    blockchain: process.env.CAPA_DEFAULT_BLOCKCHAIN,
    amount: '50',
    partnerId: process.env.CAPA_PARTNER_ID,
    externalUserId: mockUserEntityId,
    wallet: mockWalletAddress,
  });
  
  const mockOffRampLink = `https://capa.fi/sell?${offRampParams.toString()}`;
  console.log(`   🔗 ${mockOffRampLink}\n`);
  
  console.log('📊 Configuración por defecto:');
  console.log(`   • Moneda fiat: ${process.env.CAPA_DEFAULT_FIAT}`);
  console.log(`   • Criptomoneda: ${process.env.CAPA_DEFAULT_CRYPTO}`);
  console.log(`   • Blockchain: ${process.env.CAPA_DEFAULT_BLOCKCHAIN}`);
  console.log(`   • Ambiente: ${process.env.CAPA_ENVIRONMENT}`);
  
  console.log('\n✨ ¡Configuración de Capa Network verificada exitosamente!');
  console.log('\n📝 Próximos pasos:');
  console.log('   1. Ejecutar: npm run dev');
  console.log('   2. Probar en Telegram: "comprar crypto"');
  console.log('   3. Probar en Telegram: "vender crypto"');
  console.log('   4. Reemplazar con credenciales reales de Capa');
  
} else {
  console.log('\n❌ Configuración incompleta. Revisa las variables de entorno faltantes.');
}

console.log('\n🔧 Archivo de configuración: .env');
console.log('🔗 Documentación: CAPA_INTEGRATION.md');
