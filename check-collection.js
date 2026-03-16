/**
 * check-collection.js
 * Проверяет состояние коллекции: nextItemIndex, owner, royalty
 * Запуск: node check-collection.js
 */

require("dotenv").config();
const { TonClient, Address } = require("@ton/ton");

const COLLECTION_ADDRESS = "EQBoON73hvFpPfHf_6DGgc2PnKeRrFFEpFwycPvU9Ob2xCeN";

async function main() {
  const client = new TonClient({
    endpoint: "https://toncenter.com/api/v2/jsonRPC",
    apiKey: process.env.TONCENTER_API_KEY,
  });

  const collectionAddr = Address.parse(COLLECTION_ADDRESS);

  console.log("Коллекция:", COLLECTION_ADDRESS);
  console.log("Запрашиваем данные...\n");

  try {
    // get_collection_data возвращает: next_item_index, collection_content, owner_address
    const result = await client.runMethod(collectionAddr, "get_collection_data", []);

    const nextItemIndex = result.stack.readNumber();
    const collectionContent = result.stack.readCell(); // пропускаем content cell
    const ownerAddress = result.stack.readAddress();

    console.log("✅ next_item_index:", nextItemIndex, "(следующий NFT будет иметь этот индекс)");
    console.log("✅ owner:", ownerAddress.toString());
  } catch (err) {
    console.error("❌ Ошибка при запросе к коллекции:", err.message);
    if (!process.env.TONCENTER_API_KEY) {
      console.log("💡 Подсказка: добавьте TONCENTER_API_KEY в .env (получить: https://t.me/tonapibot)");
    }
  }
}

main();
