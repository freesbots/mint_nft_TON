/**
 * deploy-collection.js
 * Деплоим свою коллекцию на TON (mainnet), затем минтим первый NFT.
 *
 * commonContentUrl = "" (пустой) → individual_content = полный IPFS URL.
 * Это позволяет передавать произвольные метаданные (с lottie, attributes и т.д.)
 * через IPFS, и GetGems их корректно отображает.
 *
 * Запуск: node deploy-collection.js
 */

require("dotenv").config();

const {
  TonClient, WalletContractV5R1, internal, SendMode,
  Address, beginCell, contractAddress, toNano, Cell,
} = require("@ton/ton");
const { mnemonicToPrivateKey } = require("@ton/crypto");
const pinataSDK = require("@pinata/sdk");
const { Readable } = require("stream");

// ─────────────────────────────────────────
//  Метаданные коллекции (TEP-64)
// ─────────────────────────────────────────
const COLLECTION_METADATA = {
  name: "SportBull AI: Genesis Collection",
  description: "Animated NFT collection from the SportBull platform — your ultimate sports companion powered by AI.",
  image: "ipfs://bafybeiebmizjzhwuocgehtnybc74gb2crw234xzd2p2fsuuo22vngspdz4",
  cover_image: "ipfs://bafybeiebmizjzhwuocgehtnybc74gb2crw234xzd2p2fsuuo22vngspdz4",
  social_links: [
    "https://t.me/sportbull_bot",
    "https://youtube.com/@sportbulllive",
    "https://sportbull.press"
  ],
};

// Метаданные первого NFT-айтема
const NFT_METADATA = {
  name: "Cyber-Chrome Titan",
  description: "The pinnacle of engineering within the SportBull ecosystem. The Cyber-Chrome Titan is the armored guardian of your sports strategies. Its mirrored surface reflects millions of data streams processed by the neural network in real-time. This NFT symbolizes power, protection, and unwavering confidence in every prediction. Own the titan that knows no defeat.",
  image: "ipfs://bafybeiebmizjzhwuocgehtnybc74gb2crw234xzd2p2fsuuo22vngspdz4",
  lottie: "ipfs://bafybeiejsrgwjne7r2atqykbvzvvz2a6tefosgn75gqukgdeyivned2ra4",
  attributes: [
    { trait_type: "Type",     value: "Animated" },
    { trait_type: "Platform", value: "SportBull" },
    { trait_type: "Edition",  value: "Genesis" },
  ],
  social_links: [
    "https://t.me/sportbull_bot",
    "https://youtube.com/@sportbulllive",
    "https://sportbull.press"
  ],
};

// ─────────────────────────────────────────
//  Код смарт-контрактов (стандарт TEP-62)
// ─────────────────────────────────────────
const NFT_COLLECTION_CODE_BOC = "te6cckECFAEAAh8AART/APSkE/S88sgLAQIBYgIDAgLNBAUCASAODwTn0QY4BIrfAA6GmBgLjYSK3wfSAYAOmP6Z/2omh9IGmf6mpqGEEINJ6cqClAXUcUG6+CgOhBCFRlgFa4QAhkZYKoAueLEn0BCmW1CeWP5Z+A54tkwCB9gHAbKLnjgvlwyJLgAPGBEuABcYES4AHxgRgZgeACQGBwgJAgEgCgsAYDUC0z9TE7vy4ZJTE7oB+gDUMCgQNFnwBo4SAaRDQ8hQBc8WE8s/zMzMye1Ukl8F4gCmNXAD1DCON4BA9JZvpSCOKQakIIEA+r6T8sGP3oEBkyGgUyW78vQC+gDUMCJUSzDwBiO6kwKkAt4Ekmwh4rPmMDJQREMTyFAFzxYTyz/MzMzJ7VQALDI0AfpAMEFEyFAFzxYTyz/MzMzJ7VQAPI4V1NQwEDRBMMhQBc8WE8s/zMzMye1U4F8EhA/y8AIBIAwNAD1FrwBHAh8AV3gBjIywVYzxZQBPoCE8trEszMyXH7AIAC0AcjLP/gozxbJcCDIywET9AD0AMsAyYAAbPkAdMjLAhLKB8v/ydCACASAQEQAlvILfaiaH0gaZ/qamoYLehqGCxABDuLXTHtRND6QNM/1NTUMBAkXwTQ1DHUMNBxyMsHAc8WzMmAIBIBITAC+12v2omh9IGmf6mpqGDYg6GmH6Yf9IBhAALbT0faiaH0gaZ/qamoYCi+CeAI4APgCwGlAMbg==";
const NFT_ITEM_CODE_BOC = "te6cckECDQEAAdIAART/APSkE/S88sgLAQIBYgIDAgLOBAUACaEfn+AFAgEgBgcCASALDALbDIhxwCSXwPg0NMDAXGwkl8D4PpA+kAx+gAxcdch+gAx+gAw8AIEs44UMGwiNFIyxwXy4ZUB+kDUMBAj8APgBtMf0z+CEF/MPRRSMLqOiTIQN14yQBPbPOAwNDQ1NYIQL8smohK64wJfBIQP8vCAICQARPpEMHC68uFNgAfZRNccF8uGR+kAh8AH6QNIAMfoAggr68IAboSGUUxWgod4i1wsBwwAgkgahkTbiIML/8uGSIY4+ghAFE42RyFAJzxZQC88WcSRJFFRGoHCAEMjLBVAHzxZQBfoCFctqEssfyz8ibrOUWM8XAZEy4gHJAfsAEEeUECo3W+IKAHJwghCLdxc1BcjL/1AEzxYQJIBAcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wAAggKONSbwAYIQ1TJ22xA3RABtcXCAEMjLBVAHzxZQBfoCFctqEssfyz8ibrOUWM8XAZEy4gHJAfsAkzAyNOJVAvADADs7UTQ0z/6QCDXScIAmn8B+kDUMBAkECPgMHBZbW2AAHQDyMs/WM8WAc8WzMntVILJYI9Y=";

// ─────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitSeqno(seqno, contract) {
  console.log("⏳ Ждём подтверждения...");
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    if (await contract.getSeqno() > seqno) { console.log("✅ Подтверждено"); return; }
  }
  console.warn("⚠️  Timeout — проверьте вручную");
}

function bufferToChunks(buff, chunkSize) {
  const chunks = [];
  while (buff.byteLength > 0) { chunks.push(buff.subarray(0, chunkSize)); buff = buff.subarray(chunkSize); }
  return chunks;
}
function makeSnakeCell(data) {
  const chunks = bufferToChunks(data, 127);
  if (chunks.length === 0) return beginCell().endCell();
  if (chunks.length === 1) return beginCell().storeBuffer(chunks[0]).endCell();
  let cur = beginCell();
  for (let i = chunks.length - 1; i >= 0; i--) {
    cur.storeBuffer(chunks[i]);
    if (i - 1 >= 0) { const next = beginCell(); next.storeRef(cur); cur = next; }
  }
  return cur.endCell();
}
function encodeOffChainContent(url) {
  let data = Buffer.from(url);
  data = Buffer.concat([Buffer.from([0x01]), data]);
  return makeSnakeCell(data);
}

// ─────────────────────────────────────────
//  Pinata upload
// ─────────────────────────────────────────

async function uploadJson(pinata, obj, name) {
  const stream = Readable.from([JSON.stringify(obj, null, 2)]);
  stream.path = name;
  const r = await pinata.pinFileToIPFS(stream, { pinataMetadata: { name } });
  console.log(`   ✅ ${name} → ipfs://${r.IpfsHash}`);
  return r.IpfsHash;
}

// ─────────────────────────────────────────
//  Collection StateInit
// ─────────────────────────────────────────

function buildCollectionStateInit({ ownerAddress, collectionContentUrl, royaltyAddress, royaltyPercent }) {
  const code = Cell.fromBase64(NFT_COLLECTION_CODE_BOC);

  const collectionContentCell = encodeOffChainContent(collectionContentUrl);
  // commonContentUrl = "" (пустой) — individual_content будет полным IPFS URL
  const commonContentCell = beginCell().endCell();

  const contentCell = beginCell()
    .storeRef(collectionContentCell)
    .storeRef(commonContentCell)
    .endCell();

  const royaltyBase = 1000;
  const royaltyFactor = Math.floor(royaltyPercent * royaltyBase);
  const royaltyCell = beginCell()
    .storeUint(royaltyFactor, 16)
    .storeUint(royaltyBase, 16)
    .storeAddress(royaltyAddress)
    .endCell();

  const nftItemCode = Cell.fromBase64(NFT_ITEM_CODE_BOC);
  const data = beginCell()
    .storeAddress(ownerAddress)
    .storeUint(0, 64)           // nextItemIndex = 0
    .storeRef(contentCell)
    .storeRef(nftItemCode)
    .storeRef(royaltyCell)
    .endCell();

  return { code, data };
}

// ─────────────────────────────────────────
//  Mint body
// ─────────────────────────────────────────

function createMintBody({ itemIndex, itemOwnerAddress, metadataUrl, amount }) {
  // individual_content — полный IPFS URL (т.к. commonContentUrl пустой)
  const uriContent = beginCell().storeBuffer(Buffer.from(metadataUrl)).endCell();
  const nftContent = beginCell().storeAddress(itemOwnerAddress).storeRef(uriContent).endCell();

  return beginCell()
    .storeUint(1, 32)           // op: deploy_nft_item
    .storeUint(0, 64)           // query_id
    .storeUint(itemIndex, 64)
    .storeCoins(amount)
    .storeRef(nftContent)
    .endCell();
}

// ─────────────────────────────────────────
//  Main
// ─────────────────────────────────────────

async function main() {
  const required = ["MNEMONIC", "PINATA_API_KEY", "PINATA_API_SECRET"];
  for (const k of required) {
    if (!process.env[k]) { console.error(`❌ Нет переменной: ${k}`); process.exit(1); }
  }

  const pinata = new pinataSDK({ pinataApiKey: process.env.PINATA_API_KEY, pinataSecretApiKey: process.env.PINATA_API_SECRET });
  await pinata.testAuthentication();
  console.log("✅ Pinata OK\n");

  // ── 1. Загружаем метаданные на IPFS ──
  console.log("📤 Загружаем метаданные на IPFS...");
  const collectionCid = await uploadJson(pinata, COLLECTION_METADATA, "collection.json");
  const nftCid        = await uploadJson(pinata, NFT_METADATA, "sportbull-0.json");

  const collectionMetaUrl = `ipfs://${collectionCid}`;
  const nftMetaUrl        = `ipfs://${nftCid}`;

  // ── 2. Кошелёк ──
  const client   = new TonClient({ endpoint: "https://toncenter.com/api/v2/jsonRPC", apiKey: process.env.TONCENTER_API_KEY });
  const keyPair  = await mnemonicToPrivateKey(process.env.MNEMONIC.split(" "));
  const wallet   = WalletContractV5R1.create({ publicKey: keyPair.publicKey });
  const contract = client.open(wallet);

  const balance    = await contract.getBalance();
  const balanceTON = Number(balance) / 1e9;
  console.log(`\n👛 Кошелёк: ${wallet.address.toString({ bounceable: false })}`);
  console.log(`   Баланс: ${balanceTON.toFixed(3)} TON`);

  if (balanceTON < 0.2) { console.error("❌ Нужно минимум 0.2 TON"); process.exit(1); }

  // ── 3. Деплоим коллекцию ──
  console.log("\n🚀 Деплоим новую коллекцию...");
  const stateInit    = buildCollectionStateInit({
    ownerAddress:       wallet.address,
    collectionContentUrl: collectionMetaUrl,
    royaltyAddress:     wallet.address,
    royaltyPercent:     0.05,
  });
  const collectionAddr = contractAddress(0, stateInit);
  console.log("   Адрес коллекции:", collectionAddr.toString());

  let seqno = await contract.getSeqno();
  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [internal({ value: "0.07", to: collectionAddr, init: stateInit, body: new Cell(), bounce: false })],
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
  });
  console.log("   Транзакция деплоя отправлена (seqno:", seqno, ")");
  await waitSeqno(seqno, contract);

  // ── 4. Минтим первый NFT ──
  console.log("\n🎨 Минтим NFT #0...");
  const mintBody = createMintBody({
    itemIndex: 0,
    itemOwnerAddress: wallet.address,
    metadataUrl: nftMetaUrl,
    amount: toNano("0.05"),
  });

  seqno = await contract.getSeqno();
  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [internal({ value: "0.1", to: collectionAddr, body: mintBody, bounce: true })],
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
  });
  console.log("   Транзакция минта отправлена (seqno:", seqno, ")");
  await waitSeqno(seqno, contract);

  // ── 5. Адрес NFT ──
  await sleep(5000);
  try {
    const r = await client.runMethod(collectionAddr, "get_nft_address_by_index", [{ type: "int", value: BigInt(0) }]);
    const nftAddr = r.stack.readAddress().toString();
    console.log("\n🎉 Готово!");
    console.log("   Коллекция: https://getgems.io/collection/" + collectionAddr.toString());
    console.log("   NFT #0:    https://getgems.io/nft/" + nftAddr);
    console.log("   Метаданные NFT:", nftMetaUrl);
    console.log("   Pinata preview: https://gateway.pinata.cloud/ipfs/" + nftCid);
  } catch(e) {
    console.log("\n🎉 Деплой завершён!");
    console.log("   Коллекция: https://getgems.io/collection/" + collectionAddr.toString());
  }
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
