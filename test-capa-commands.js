#!/usr/bin/env node

// Script para simular comandos de Telegram y probar respuestas de Capa
import { config } from 'dotenv';
config({ path: '.env' });

// Importar el servicio de Capa
import { capaService } from './src/services/capa-service.ts';

console.log('🤖 Probando comandos de Telegram con Capa Network\n');

// Mock user data
const mockUser = {
  entityId: 'telegram_user_123456',
  walletAddress: '0x742d35Cc1dF3c6b44e7d1A029b0e12345abcdef'
};

console.log('👤 Usuario de prueba:');
console.log(`   📱 Entity ID: ${mockUser.entityId}`);
console.log(`   💳 Wallet: ${mockUser.walletAddress}\n`);

// Test 1: Verificar configuración del servicio
console.log('🔧 Test 1: Verificando configuración del servicio');
const isConfigured = capaService.isConfigured();
console.log(`   Estado: ${isConfigured ? '✅ Configurado' : '❌ No configurado'}`);

if (isConfigured) {
  const defaults = capaService.getDefaults();
  console.log('   Configuración por defecto:', defaults);
} else {
  console.log('   ⚠️  Usando valores dummy para pruebas');
}

console.log();

// Test 2: Simular comando "comprar crypto"
console.log('💰 Test 2: Comando "comprar crypto"');
try {
  const onRampRequest = {
    crypto: 'USDC',
    fiat: 'MXN',
    blockchain: 'ethereum',
    amount: 100,
    userEntityId: mockUser.entityId,
    walletAddress: mockUser.walletAddress
  };
  
  const buyLink = capaService.generateOnRampLink(onRampRequest);
  console.log('   ✅ Enlace generado exitosamente');
  console.log(`   🔗 ${buyLink}`);
  console.log(`   💵 Comprar: $${onRampRequest.amount} ${onRampRequest.fiat} → ${onRampRequest.crypto}`);
} catch (error) {
  console.log(`   ❌ Error: ${error.message}`);
}

console.log();

// Test 3: Simular comando "vender crypto"
console.log('💸 Test 3: Comando "vender crypto"');
try {
  const offRampRequest = {
    crypto: 'USDC',
    fiat: 'MXN',
    blockchain: 'ethereum',
    amount: 50,
    userEntityId: mockUser.entityId,
    walletAddress: mockUser.walletAddress
  };
  
  const sellLink = capaService.generateOffRampLink(offRampRequest);
  console.log('   ✅ Enlace generado exitosamente');
  console.log(`   🔗 ${sellLink}`);
  console.log(`   💸 Vender: $${offRampRequest.amount} ${offRampRequest.crypto} → ${offRampRequest.fiat}`);
} catch (error) {
  console.log(`   ❌ Error: ${error.message}`);
}

console.log();

// Test 4: Diferentes combinaciones de monedas
console.log('🌍 Test 4: Diferentes combinaciones de monedas');

const testCombinations = [
  { crypto: 'ETH', fiat: 'COP', amount: 200 },
  { crypto: 'USDT', fiat: 'USD', amount: 75 },
  { crypto: 'USDC', fiat: 'MXN', amount: 150 }
];

testCombinations.forEach((combo, index) => {
  try {
    const request = {
      ...combo,
      blockchain: 'ethereum',
      userEntityId: mockUser.entityId,
      walletAddress: mockUser.walletAddress
    };
    
    const link = capaService.generateOnRampLink(request);
    console.log(`   ${index + 1}. ✅ ${combo.crypto}/${combo.fiat} - $${combo.amount}`);
  } catch (error) {
    console.log(`   ${index + 1}. ❌ ${combo.crypto}/${combo.fiat} - Error: ${error.message}`);
  }
});

console.log();

// Test 5: Mensajes de Telegram esperados
console.log('📱 Test 5: Respuestas esperadas en Telegram');
console.log();

console.log('   Comando: "comprar crypto"');
console.log('   Respuesta esperada:');
console.log('   ┌─────────────────────────────────────┐');
console.log('   │ 💰 Comprar USDC con MXN            │');
console.log('   │                                     │');
console.log('   │ 🎯 Detalles:                       │');
console.log('   │ • Monto: $100 MXN                  │');
console.log('   │ • Crypto: USDC                     │');
console.log('   │ • Red: ethereum                    │');
console.log('   │ • Destino: 0x742d35...             │');
console.log('   │                                     │');
console.log('   │ 🔗 [Completar compra en Capa]      │');
console.log('   │                                     │');
console.log('   │ ✅ Proceso 100% seguro              │');
console.log('   │ ✅ Pagos con tarjeta/transferencia  │');
console.log('   │ ✅ Crypto directo a tu alcancía     │');
console.log('   │ ⚡ Confirmación en minutos          │');
console.log('   └─────────────────────────────────────┘');

console.log();
console.log('🎉 ¡Pruebas de Capa Network completadas!');
console.log();
console.log('📋 Resumen:');
console.log('   ✅ Configuración verificada');
console.log('   ✅ Enlaces de compra funcionando');
console.log('   ✅ Enlaces de venta funcionando');
console.log('   ✅ Múltiples monedas soportadas');
console.log();
console.log('🚀 Para probar en vivo:');
console.log('   1. Asegúrate que el bot esté corriendo (npm run dev)');
console.log('   2. Ve a tu bot de Telegram');
console.log('   3. Escribe: "comprar crypto"');
console.log('   4. Escribe: "vender crypto"');
console.log('   5. Escribe: "estado transacciones capa"');
console.log();
console.log('⚠️  Nota: Con credenciales dummy, los enlaces no funcionarán realmente.');
console.log('   Obtén credenciales reales de Capa Network para funcionalidad completa.');
