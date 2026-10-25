export const WRITABLE_CHAIN_IDS = Object.freeze([31337, 11155111]);

const REAL_WALLETS = [
  '0xD7648FffA48e06b0107435a966F3F1e9DBe10B7d',
  '0x6298BfEd428B843d326dDAE1A406441CDB40db80',
  '0x7a448169e9d5DB6405087dAB9dfF774Db6589b05',
  '0x409C4A8eC8eEBf4132E33122164D57C5B7039E59',
].map((a) => a.toLowerCase());

// Throws unless the chain id is anvil or Sepolia.
export function assertWritableChain(chainId) {
  const id = Number(chainId);
  if (!WRITABLE_CHAIN_IDS.includes(id)) {
    throw new Error(`write refused: chainId ${chainId} is not in the allowlist ${WRITABLE_CHAIN_IDS.join(',')}`);
  }
  return id;
}

// Throws if the recipient is a wallet named in the court record.
export function assertNotRealWallet(address, extra = []) {
  const deny = new Set([...REAL_WALLETS, ...extra.map((a) => String(a).toLowerCase())]);
  if (deny.has(String(address).toLowerCase())) {
    throw new Error(`write refused: ${address} is a real wallet from the court record`);
  }
  return address;
}
