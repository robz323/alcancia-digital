# Alcancía Digital (ElizaOS + Telegram + Starknet)

Agente que integra Telegram con Starknet para crear y operar una "alcancía digital" (wallet invisible) por usuario.

## Features

- Pre-configured project structure for ElizaOS development
- Default character configuration with plugin integration
- Example service, action, and provider implementations
- TypeScript configuration for optimal developer experience
- Built-in documentation and examples

## Requisitos

- Bun >= 1.0
- Node 18+

## Variables de entorno (.env)

Nombres requeridos (solo listado):

- ANTHROPIC_API_KEY
- TELEGRAM_BOT_TOKEN
- STARKNET_ADDRESS
- STARKNET_PRIVATE_KEY
- STARKNET_RPC_URL
- SECRET_SALT
- STARKNET_ACCOUNT_VARIANT
- STARKNET_ACCOUNT_CLASS_HASH

## Instalación y ejecución

```bash
bun install
bun run dev
```

## Comandos del agente (Telegram)

- "crear alcancía" — Crea tu alcancía digital (wallet invisible)
- "dirección" — Muestra la dirección de tu alcancía
- "balance" o "saldo" — Muestra balance de ETH
- "enviar <monto> <token?> a <0x...>" — Enviar tokens
- "crear token" — Desplegar meme token (wrapper)

Notas:
- La alcancía se liga 1:1 a tu usuario de Telegram.
- Dirección estable entre reinicios (derivación determinista con `SECRET_SALT`).

## Desarrollo

```bash
# Start development with hot-reloading (recommended)
elizaos dev

# OR start without hot-reloading
elizaos start
# Note: When using 'start', you need to rebuild after changes:
# bun run build

# Test the project
elizaos test
```

## Testing

ElizaOS employs a dual testing strategy:

1. **Component Tests** (`src/__tests__/*.test.ts`)

   - Run with Bun's native test runner
   - Fast, isolated tests using mocks
   - Perfect for TDD and component logic

2. **E2E Tests** (`src/__tests__/e2e/*.e2e.ts`)
   - Run with ElizaOS custom test runner
   - Real runtime with actual database (PGLite)
   - Test complete user scenarios

### Test Structure

```
src/
  __tests__/              # All tests live inside src
    *.test.ts            # Component tests (use Bun test runner)
    e2e/                 # E2E tests (use ElizaOS test runner)
      project-starter.e2e.ts  # E2E test suite
      README.md          # E2E testing documentation
  index.ts               # Export tests here: tests: [ProjectStarterTestSuite]
```

### Running Tests

- `elizaos test` - Run all tests (component + e2e)
- `elizaos test component` - Run only component tests
- `elizaos test e2e` - Run only E2E tests

### Writing Tests

Component tests use bun:test:

```typescript
// Unit test example (__tests__/config.test.ts)
describe('Configuration', () => {
  it('should load configuration correctly', () => {
    expect(config.debug).toBeDefined();
  });
});

// Integration test example (__tests__/integration.test.ts)
describe('Integration: Plugin with Character', () => {
  it('should initialize character with plugins', async () => {
    // Test interactions between components
  });
});
```

E2E tests use ElizaOS test interface:

```typescript
// E2E test example (e2e/project.test.ts)
export class ProjectTestSuite implements TestSuite {
  name = 'project_test_suite';
  tests = [
    {
      name: 'project_initialization',
      fn: async (runtime) => {
        // Test project in a real runtime
      },
    },
  ];
}

export default new ProjectTestSuite();
```

The test utilities in `__tests__/utils/` provide helper functions to simplify writing tests.

## Plugins y arquitectura

- `@elizaos/plugin-telegram`: cliente de Telegram
- `starter plugin` (`src/plugin.ts`):
  - Router de comandos (sin pasar por LLM) con dedupe/rate limit
  - Acciones personalizadas:
    - `CREATE_INVISIBLE_STARKNET_ACCOUNT`
    - `SHOW_INVISIBLE_ACCOUNT_ADDRESS`
    - `SHOW_INVISIBLE_ACCOUNT_BALANCE`
    - `TRANSFER_STARKNET_TOKENS_INVISIBLE` (wrapper de `TRANSFER_TOKEN`)
    - `DEPLOY_MEME_TOKEN_INVISIBLE` (wrapper de `DEPLOY_STARKNET_UNRUGGABLE_MEME_TOKEN`)
- `@elizaos/plugin-starknet`: capacidades on-chain subyacentes
- `@elizaos/plugin-sql`: soporte de almacenamiento del core
- `@elizaos/plugin-bootstrap`: embeddings (desactivar con `IGNORE_BOOTSTRAP=1`)
- Plugins LLM opcionales (si `IGNORE_LLM=0` y hay API keys): Anthropic/OpenAI/OpenRouter/Google/Ollama

## Capacidades del agente

- Crear alcancía digital (wallet invisible)
- Mostrar dirección
- Enviar tokens
- Estrategias y gestión financiera (requiere habilitar LLM)

## Producción (recomendado)

- Persistir claves cifradas (o usar KMS) en lugar de solo derivación determinista.
- Monitoreo de gas/fees y manejo de errores.
- Habilitar LLM si deseas respuestas de estrategia financiera.
