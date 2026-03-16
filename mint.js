/**
 * mint.js — Минт SportBull NFT в существующую коллекцию на TON (mainnet)
 *
 * Что делает:
 * 1. Загружает метаданные NFT на Pinata (IPFS)
 * 2. Читает nextItemIndex из коллекции
 * 3. Отправляет mint-транзакцию в коллекцию
 *
 * Требования в .env:
 *   MNEMONIC, PINATA_API_KEY, PINATA_API_SECRET, TONCENTER_API_KEY
 *
 * Запуск: node mint.js
 */

require("dotenv").config();

const { TonClient, WalletContractV5R1, internal, SendMode, Address, beginCell, toNano } = require("@ton/ton");
const { mnemonicToPrivateKey } = require("@ton/crypto");
const pinataSDK = require("@pinata/sdk");
const { Readable } = require("stream");

// ─────────────────────────────────────────
//  Конфигурация
// ─────────────────────────────────────────

const COLLECTION_ADDRESS = "EQA1yiDok5CyRiE8wqNfEQmRLezp7DddRCqxFkEQ1aCFO_si";

// IPFS CID'ы уже загруженных файлов
const IMAGE_CID    = "QmfBzxTrLpXrceeEvYWc958Z2NuMGQLPNtSaq8hYr13QtZ";
const LOTTIE_CID   = "QmWfDzX6M75ijtM1Li8N8ZJXYHt2NQHtEGWMZxhvSkFQK4";

// ─────────────────────────────────────────
//  Метаданные NFT-айтема (TEP-64 стандарт)
//  ✏️  Редактируй здесь перед каждым минтом
// ─────────────────────────────────────────
const NFT_METADATA = {
  // Название NFT (рекомендовано 15–30 символов)
  name: "Cyber-Chrome Titan",

  // Описание (до 500 символов)
  description: "The pinnacle of engineering within the SportBull ecosystem. The Cyber-Chrome Titan is the armored guardian of your sports strategies. Its mirrored surface reflects millions of data streams processed by the neural network in real-time. This NFT symbolizes power, protection, and unwavering confidence in every prediction. Own the titan that knows no defeat.",

  // Превью-картинка (уже загружена на IPFS — не меняй)
  image: `ipfs://${IMAGE_CID}`,

  // Lottie-анимация (воспроизводится на странице NFT на GetGems — не меняй)
  lottie: `ipfs://${LOTTIE_CID}`,

  // Атрибуты/трейты — отображаются как свойства NFT
  attributes: [
    { trait_type: "Type",     value: "Animated" },
    { trait_type: "Platform", value: "SportBull" },
    { trait_type: "Edition",  value: "Genesis" }
  ],

  // Ссылки на соцсети (до 10 штук)
  social_links: [
    "https://t.me/sportbull_bot",
    "https://youtube.com/@sportbulllive",
    "https://sportbull.press"
  ]
};

// ─────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitSeqno(seqno, contract) {
  console.log("⏳ Ждём подтверждения транзакции...");
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(3000);
    const seqnoAfter = await contract.getSeqno();
    if (seqnoAfter > seqno) {
      console.log("✅ Транзакция подтверждена (seqno:", seqnoAfter, ")");
      return;
    }
  }
  console.warn("⚠️  Seqno не изменился за 60 сек. Проверьте транзакцию вручную.");
}

/**
 * Кодирует off-chain content URL в snake-cell (TEP-64)
 */
function bufferToChunks(buff, chunkSize) {
  const chunks = [];
  while (buff.byteLength > 0) {
    chunks.push(buff.subarray(0, chunkSize));
    buff = buff.subarray(chunkSize);
  }
  return chunks;
}

function makeSnakeCell(data) {
  const chunks = bufferToChunks(data, 127);
  if (chunks.length === 0) return beginCell().endCell();
  if (chunks.length === 1) return beginCell().storeBuffer(chunks[0]).endCell();

  let curCell = beginCell();
  for (let i = chunks.length - 1; i >= 0; i--) {
    curCell.storeBuffer(chunks[i]);
    if (i - 1 >= 0) {
      const nextCell = beginCell();
      nextCell.storeRef(curCell);
      curCell = nextCell;
    }
  }
  return curCell.endCell();
}

function encodeOffChainContent(content) {
  let data = Buffer.from(content);
  const offChainPrefix = Buffer.from([0x01]);
  data = Buffer.concat([offChainPrefix, data]);
  return makeSnakeCell(data);
}

// ─────────────────────────────────────────
//  Загрузка метаданных на Pinata
// ─────────────────────────────────────────

async function uploadMetadataToPinata(metadata) {
  const pinata = new pinataSDK({
    pinataApiKey:       process.env.PINATA_API_KEY,
    pinataSecretApiKey: process.env.PINATA_API_SECRET,
  });

  // Проверка подключения
  await pinata.testAuthentication();
  console.log("✅ Pinata: аутентификация успешна");

  const jsonString = JSON.stringify(metadata, null, 2);
  const stream = Readable.from([jsonString]);
  stream.path = "sportbull-nft-metadata.json";

  const result = await pinata.pinFileToIPFS(stream, {
    pinataMetadata: { name: "SportBull NFT #1 metadata" },
  });

  console.log("✅ Метаданные загружены на IPFS:", result.IpfsHash);
  return result.IpfsHash;
}

// ─────────────────────────────────────────
//  Формирование mint-body для коллекции
// ─────────────────────────────────────────

/**
 * Создаёт тело сообщения для минта NFT-айтема (op=1)
 * по стандарту TEP-62 NFT Collection
 */
function createMintBody({ itemIndex, itemOwnerAddress, metadataUrl, amount }) {
  const body = beginCell();
  body.storeUint(1, 32);            // op: deploy_nft_item
  body.storeUint(0, 64);            // query_id
  body.storeUint(itemIndex, 64);    // item_index
  body.storeCoins(amount);          // forward_amount для деплоя item-контракта

  const nftItemContent = beginCell();
  nftItemContent.storeAddress(itemOwnerAddress); // owner

  // content: полная ссылка на метаданные (если commonContentUrl коллекции пустой)
  // или относительная (если commonContentUrl содержит базовый путь).
  // Мы используем полный IPFS URL — безопасно в любом случае.
  const uriContent = beginCell();
  uriContent.storeBuffer(Buffer.from(metadataUrl));
  nftItemContent.storeRef(uriContent.endCell());

  body.storeRef(nftItemContent.endCell());
  return body.endCell();
}

// ─────────────────────────────────────────
//  Main
// ─────────────────────────────────────────

async function main() {
  // Валидация env (TONCENTER_API_KEY опционален — без него работает медленнее)
  const required = ["MNEMONIC", "PINATA_API_KEY", "PINATA_API_SECRET"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ Не задана переменная окружения: ${key}`);
      console.error("   Скопируйте .env.example в .env и заполните значения.");
      process.exit(1);
    }
  }

  // ── 1. Загружаем метаданные NFT на Pinata ──
  console.log("\n📤 Загружаем метаданные NFT на IPFS...");
  let metadataCid;
  try {
    metadataCid = await uploadMetadataToPinata(NFT_METADATA);
  } catch (err) {
    console.error("❌ Ошибка загрузки на Pinata:", err.message);
    process.exit(1);
  }
  const metadataUrl = `ipfs://${metadataCid}`;
  console.log("   URL метаданных:", metadataUrl);
  console.log("   Pinata gateway:  https://gateway.pinata.cloud/ipfs/" + metadataCid);

  // ── 2. Подключаемся к TON ──
  // Пробуем с API ключом, фолбэк на публичный эндпоинт
  const endpoints = [
    { endpoint: "https://toncenter.com/api/v2/jsonRPC", apiKey: process.env.TONCENTER_API_KEY },
    { endpoint: "https://toncenter.com/api/v2/jsonRPC", apiKey: undefined },
  ];

  let client, contract, keyPair, wallet, balance;
  for (const cfg of endpoints) {
    try {
      client   = new TonClient(cfg);
      const mn = process.env.MNEMONIC.split(" ");
      keyPair  = await mnemonicToPrivateKey(mn);
      wallet   = WalletContractV5R1.create({ publicKey: keyPair.publicKey });
      contract = client.open(wallet);
      balance  = await contract.getBalance(); // тест подключения
      console.log(cfg.apiKey ? "\n🌐 TonCenter: API-ключ принят" : "\n🌐 TonCenter: публичный режим (без ключа)");
      break;
    } catch (err) {
      if (err?.response?.status === 401 || err?.code === "ERR_BAD_REQUEST") {
        console.warn("⚠️  TONCENTER_API_KEY отклонён (401), пробуем без ключа...");
        continue;
      }
      throw err;
    }
  }

  const walletAddr = wallet.address.toString({ bounceable: false });
  console.log("👛 Кошелёк:", walletAddr);

  const balanceTON = Number(balance) / 1e9;
  console.log("   Баланс:", balanceTON.toFixed(3), "TON");

  if (balanceTON < 0.15) {
    console.error("❌ Недостаточно TON (нужно минимум ~0.15 TON). Пополните кошелёк.");
    process.exit(1);
  }

  // ── 3. Читаем nextItemIndex из коллекции ──
  const collectionAddr = Address.parse(COLLECTION_ADDRESS);
  console.log("\n📋 Читаем состояние коллекции...");

  let nextItemIndex;
  try {
    const result = await client.runMethod(collectionAddr, "get_collection_data", []);
    nextItemIndex = result.stack.readNumber();
    result.stack.readCell();                  // collection_content (пропускаем)
    const owner = result.stack.readAddress();
    console.log("   next_item_index:", nextItemIndex);
    console.log("   owner:", owner.toString());
  } catch (err) {
    console.error("❌ Ошибка чтения коллекции:", err.message);
    process.exit(1);
  }

  // ── 4. Отправляем mint-транзакцию ──
  console.log("\n🚀 Минтим NFT item #" + nextItemIndex + "...");

  const mintBody = createMintBody({
    itemIndex:        nextItemIndex,
    itemOwnerAddress: wallet.address,          // NFT будет принадлежать нашему кошельку
    metadataUrl,                               // полный IPFS URL метаданных
    amount:           toNano("0.05"),          // TON для деплоя item-контракта
  });

  const seqno = await contract.getSeqno();

  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        value: "0.1",                          // 0.05 для item + газ + буфер
        to:    collectionAddr,
        body:  mintBody,
        bounce: true,
      }),
    ],
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
  });

  console.log("   Транзакция отправлена (seqno:", seqno, ")");

  // ── 5. Ждём подтверждения ──
  await waitSeqno(seqno, contract);

  // ── 6. Получаем адрес созданного NFT ──
  console.log("\n🔍 Получаем адрес созданного NFT...");
  await sleep(5000); // ждём деплоя item-контракта

  try {
    const nftResult = await client.runMethod(collectionAddr, "get_nft_address_by_index", [
      { type: "int", value: BigInt(nextItemIndex) },
    ]);
    const nftAddress = nftResult.stack.readAddress().toString();
    console.log("\n🎉 NFT успешно создан!");
    console.log("   Адрес NFT:", nftAddress);
    console.log("   Просмотр:  https://getgems.io/nft/" + nftAddress);
    console.log("   Метаданные:", metadataUrl);
  } catch (err) {
    console.log("\n🎉 Транзакция отправлена! Адрес NFT ещё не доступен (нормально, подождите ~30 сек).");
    console.log("   Проверьте коллекцию: https://getgems.io/collection/" + COLLECTION_ADDRESS);
  }
}

main().catch(err => {
  console.error("❌ Необработанная ошибка:", err);
  process.exit(1);
});
