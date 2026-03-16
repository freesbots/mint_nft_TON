# SportBull NFT Mint Script

Скрипт для минта NFT в существующую TON-коллекцию.

## Данные

| | |
|---|---|
| Коллекция | `EQBoON73hvFpPfHf_6DGgc2PnKeRrFFEpFwycPvU9Ob2xCeN` |
| Картинка (IPFS) | `bafybeiebmizjzhwuocgehtnybc74gb2crw234xzd2p2fsuuo22vngspdz4` |
| Lottie JSON (IPFS) | `bafybeiejsrgwjne7r2atqykbvzvvz2a6tefosgn75gqukgdeyivned2ra4` |

## Установка

```bash
cd gifts/nft/mint-script
npm install
```

## Настройка

Скопируй `.env.example` в `.env` и заполни:

```bash
cp .env.example .env
```

```env
MNEMONIC=слово1 слово2 ... слово24     # сид-фраза кошелька владельца коллекции
PINATA_API_KEY=...                      # https://app.pinata.cloud/keys
PINATA_API_SECRET=...
TONCENTER_API_KEY=...                   # https://t.me/tonapibot  (mainnet)
```

> ⚠️ Кошелёк должен быть **владельцем коллекции** и иметь минимум **0.15 TON** на балансе.

## Запуск

**Проверить состояние коллекции:**
```bash
npm run check
```

**Заминтить NFT:**
```bash
npm run mint
```

## Что происходит внутри

1. `mint.js` загружает `NFT_METADATA` (JSON с ссылками на уже загруженные IPFS-файлы) на Pinata
2. Читает `nextItemIndex` из контракта коллекции (`get_collection_data`)
3. Отправляет транзакцию на адрес коллекции с `op=1` (deploy_nft_item)
4. Ждёт подтверждения и выводит адрес созданного NFT
5. Ссылка на просмотр: `https://getgems.io/nft/<адрес>`

## Структура метаданных NFT (TEP-64)

```json
{
  "name": "SportBull #1",
  "description": "...",
  "image": "ipfs://bafybei...z4",
  "lottie": "ipfs://bafybei...a4",
  "attributes": [...]
}
```

Поле `lottie` отображает анимацию на странице NFT (поддерживается GetGems).
