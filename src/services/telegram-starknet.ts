import crypto from 'node:crypto'
import { ec, hash, CallData, RpcProvider, Account } from 'starknet'
import { logger } from '@elizaos/core'

export interface InvisibleAccount {
  userEntityId: string
  privateKeyHex: string
  createdAtMs: number
  accountAddressHex?: string
}

export interface TelegramStarknetStore {
  getAccountByEntityId: (entityId: string) => InvisibleAccount | undefined
  ensureAccountForEntityId: (entityId: string) => InvisibleAccount
  setAccountAddress: (entityId: string, accountAddressHex: string) => void
}

function generatePrivateKeyHex(): string {
  const priv = ec.starkCurve.utils.randomPrivateKey()
  return '0x' + Buffer.from(priv).toString('hex')
}

function deriveDeterministicPrivateKeyHex(secretSalt: string, entityId: string): string {
  // HMAC-SHA256(secretSalt, entityId:context) -> 32 bytes, map into [1, n-1]
  const context = `starknet-invisible:${process.env.STARKNET_ACCOUNT_VARIANT || 'oz'}`
  const hmac = crypto.createHmac('sha256', Buffer.from(secretSalt, 'utf8'))
  hmac.update(`${entityId}:${context}`)
  const digest = hmac.digest() // 32 bytes

  const hex = digest.toString('hex')
  const n = ec.starkCurve.CURVE.n
  let k = BigInt('0x' + hex) % (n - 1n)
  if (k === 0n) k = 1n
  return '0x' + k.toString(16)
}

function deriveProvisionalAddressFromPrivateKey(privateKeyHex: string): string | undefined {
  try {
    const cleaned = privateKeyHex.startsWith('0x') ? privateKeyHex : `0x${privateKeyHex}`
    // Derivar clave pública (no es una address on-chain, pero sirve como identificador provisional)
    const publicKey = ec.starkCurve.getStarkKey(cleaned)
    const withPrefix = publicKey.startsWith('0x') ? publicKey : `0x${publicKey}`
    return withPrefix
  } catch {
    return undefined
  }
}

function deriveSmartAccountAddressFromPrivateKey(privateKeyHex: string): string | undefined {
  try {
    const cleaned = privateKeyHex.startsWith('0x') ? privateKeyHex : `0x${privateKeyHex}`
    const publicKey = ec.starkCurve.getStarkKey(cleaned)
    const pubKeyHex = publicKey.startsWith('0x') ? publicKey : `0x${publicKey}`

    const classHash = process.env.STARKNET_ACCOUNT_CLASS_HASH?.trim()
    if (!classHash) return undefined

    // Variante de cuenta: 'oz' (por defecto) o 'argent'
    const variant = (process.env.STARKNET_ACCOUNT_VARIANT || 'oz').toLowerCase()

    // Constructor calldata: la mayoría de cuentas (OZ/Argent) requieren al menos publicKey
    // Para guardian se puede omitir/0 en pruebas
    let constructorCalldata: string[]
    if (variant === 'oz') {
      // Cairo 1 OpenZeppelin Account suele aceptar { publicKey }
      constructorCalldata = CallData.compile({ publicKey: pubKeyHex })
    } else {
      // ArgentX también inicializa con publicKey habitualmente
      constructorCalldata = CallData.compile({ publicKey: pubKeyHex })
    }

    // Salt: usamos el publicKey para direcciones determinísticas reproducibles
    const salt = pubKeyHex
    const deployerAddress = '0x0'
    const accountAddress = hash.calculateContractAddressFromHash(salt, classHash, constructorCalldata, deployerAddress)
    return accountAddress
  } catch {
    return undefined
  }
}

class InMemoryTelegramStarknetStore implements TelegramStarknetStore {
  private entityIdToAccount = new Map<string, InvisibleAccount>()

  getAccountByEntityId(entityId: string): InvisibleAccount | undefined {
    return this.entityIdToAccount.get(entityId)
  }

  ensureAccountForEntityId(entityId: string): InvisibleAccount {
    const existing = this.entityIdToAccount.get(entityId)
    if (existing) return existing

    const secretSalt = process.env.SECRET_SALT?.trim()
    const privateKeyHex = secretSalt
      ? deriveDeterministicPrivateKeyHex(secretSalt, entityId)
      : generatePrivateKeyHex()

    const account: InvisibleAccount = {
      userEntityId: entityId,
      privateKeyHex,
      createdAtMs: Date.now(),
    }
    // Intentar derivar dirección de cuenta SMART si hay class hash configurado; si no, usar pública provisional
    const smart = deriveSmartAccountAddressFromPrivateKey(account.privateKeyHex)
    if (smart) account.accountAddressHex = smart
    else {
      const provisional = deriveProvisionalAddressFromPrivateKey(account.privateKeyHex)
      if (provisional) account.accountAddressHex = provisional
    }
    this.entityIdToAccount.set(entityId, account)
    logger.info({ entityId, hasSmart: Boolean(smart), address: account.accountAddressHex, deterministic: Boolean(secretSalt) }, '[Starknet] ensureAccountForEntityId created')
    return account
  }

  setAccountAddress(entityId: string, accountAddressHex: string): void {
    const acc = this.entityIdToAccount.get(entityId)
    if (!acc) return
    acc.accountAddressHex = accountAddressHex
    this.entityIdToAccount.set(entityId, acc)
    logger.info({ entityId, accountAddressHex }, '[Starknet] setAccountAddress updated')
  }
}

export const telegramStarknetStore: TelegramStarknetStore = new InMemoryTelegramStarknetStore()

// ---- starknet.js helpers (provider, compute, deploy) ----

export function createStarknetProvider(): RpcProvider | undefined {
  const nodeUrl = process.env.STARKNET_RPC_URL?.trim()
  if (!nodeUrl) return undefined
  logger.info({ nodeUrl }, '[Starknet] Creating RpcProvider')
  return new RpcProvider({ nodeUrl })
}

export interface SmartAccountDetails {
  classHash: string
  publicKey: string
  constructorCalldata: string[]
  addressSalt: string
  precalculatedAddress: string
}

export function computeSmartAccountDetails(privateKeyHex: string): SmartAccountDetails | undefined {
  try {
    const cleaned = privateKeyHex.startsWith('0x') ? privateKeyHex : `0x${privateKeyHex}`
    const publicKey = ec.starkCurve.getStarkKey(cleaned)
    const pubKeyHex = publicKey.startsWith('0x') ? publicKey : `0x${publicKey}`

    const variant = (process.env.STARKNET_ACCOUNT_VARIANT || 'oz').toLowerCase()
    const defaultOzClassHash = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'
    const defaultArgentClassHash = '0x1a736d6ed154502257f02b1ccdf4d9d1089f80811cd6acad48e6b6a9d1f2003'
    const classHash = (process.env.STARKNET_ACCOUNT_CLASS_HASH?.trim() || (variant === 'argent' ? defaultArgentClassHash : defaultOzClassHash))

    let constructorCalldata: string[]
    if (variant === 'argent') constructorCalldata = CallData.compile({ owner: pubKeyHex, guardian: '0' })
    else constructorCalldata = CallData.compile({ publicKey: pubKeyHex })

    const addressSalt = pubKeyHex
    const precalculatedAddress = hash.calculateContractAddressFromHash(addressSalt, classHash, constructorCalldata, 0)

    logger.info({ variant, classHash, pubKeyHex, addressSalt, precalculatedAddress }, '[Starknet] Computed smart account details')

    return { classHash, publicKey: pubKeyHex, constructorCalldata, addressSalt, precalculatedAddress }
  } catch (e) {
    logger.error({ error: e instanceof Error ? e.message : String(e) }, '[Starknet] computeSmartAccountDetails failed')
    return undefined
  }
}

export async function deploySmartAccountIfPossible(privateKeyHex: string): Promise<{ address?: string; txHash?: string; error?: Error }>
{
  try {
    const provider = createStarknetProvider()
    if (!provider) return { error: new Error('Missing STARKNET_RPC_URL') }

    const details = computeSmartAccountDetails(privateKeyHex)
    if (!details) return { error: new Error('Cannot compute smart account details') }

    logger.info({ precalculatedAddress: details.precalculatedAddress }, '[Starknet] Deploy attempt')
    const account = new Account(provider, details.precalculatedAddress, privateKeyHex)
    const deployPayload = {
      classHash: details.classHash,
      constructorCalldata: details.constructorCalldata,
      addressSalt: details.addressSalt,
    }

    // Optional estimation step (can throw if not funded); we can skip to direct deploy
    // const { suggestedMaxFee } = await account.estimateAccountDeployFee(deployPayload)
    const { transaction_hash, contract_address } = await account.deployAccount(deployPayload)
    logger.info({ transaction_hash, contract_address }, '[Starknet] Deploy submitted')
    await provider.waitForTransaction(transaction_hash)
    logger.info({ transaction_hash }, '[Starknet] Deploy confirmed')
    return { address: contract_address, txHash: transaction_hash }
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, '[Starknet] Deploy failed')
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// ---- balances ----

export async function getEthBalanceWei(addressHex: string): Promise<bigint | undefined> {
  try {
    const provider = createStarknetProvider()
    if (!provider) {
      logger.error({}, '[Starknet] getEthBalanceWei missing provider')
      return undefined
    }

    const tokenAddress = process.env.STARKNET_ETH_TOKEN_ADDRESS?.trim()
    if (!tokenAddress) {
      logger.error({}, '[Starknet] STARKNET_ETH_TOKEN_ADDRESS not set')
      return undefined
    }

    const res = await provider.callContract({
      contractAddress: tokenAddress,
      entrypoint: 'balanceOf',
      calldata: [addressHex],
    })
    const raw = (Array.isArray(res) ? res[0] : (res as any)?.result?.[0]) as string | undefined
    if (!raw) return 0n
    // raw is decimal string; convert to bigint safely
    const value = BigInt(raw)
    return value
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, '[Starknet] getEthBalanceWei failed')
    return undefined
  }
}

export function formatWeiToEth(wei?: bigint): string {
  if (wei === undefined) return 'N/D'
  const denom = 10n ** 18n
  const whole = wei / denom
  const frac = wei % denom
  const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '') || '0'
  return `${whole.toString()}.${fracStr}`
}


