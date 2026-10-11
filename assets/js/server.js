try { require('dotenv').config(); } catch (e) {}

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
// Static files configuration
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(process.cwd()));


// ������ HìM H� TRỢ ������������������������������������������������������������������������������������������������������������������������

function getFormattedDateTimeStr() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
    return `${dateStr} ${timeStr}`;
}

function buildSilverItemsFromTv(xagSell, xagBuy, xagChange, usdRate) {
    const troyOunce = 31.1034768;
    const worldSellVndPerChi = (xagSell * usdRate / troyOunce) * 3.75;
    const worldChangeVndPerChi = (xagChange * usdRate / troyOunce) * 3.75;

    const pq1lSell  = Math.round(worldSellVndPerChi * 10 * 1.03 / 1000) * 1000;
    const pq1lBuy   = Math.round(pq1lSell * 0.97);
    const pq1kgSell = Math.round(worldSellVndPerChi * 266.67 * 1.03 / 1000) * 1000;
    const pq1kgBuy  = Math.round(pq1kgSell * 0.97);

    const bac999Sell     = Math.round((worldSellVndPerChi * 1.05) / 1000) * 1000;
    const bac999Buy      = bac999Sell - 30000;
    const bacNuTrangSell = bac999Sell + 70000;
    const bacNuTrangBuy  = Math.round(bacNuTrangSell * 0.6);

    return [
        { name: 'Bac The Gioi (XAG/USD)',  isWorld: true,  buy: parseFloat(xagBuy.toFixed(2)),  sell: parseFloat(xagSell.toFixed(2)),  change: parseFloat(xagChange.toFixed(2)), cl: 0 },
        { name: 'Bac Phu Quy (1 Luong)',   isWorld: false, buy: pq1lBuy,   sell: pq1lSell,   change: Math.round(worldChangeVndPerChi * 10),     cl: Math.round((pq1lSell  / 10)     - worldSellVndPerChi) },
        { name: 'Bac Phu Quy (1 Kg)',      isWorld: false, buy: pq1kgBuy,  sell: pq1kgSell,  change: Math.round(worldChangeVndPerChi * 266.67), cl: Math.round((pq1kgSell / 266.67) - worldSellVndPerChi) },
        { name: 'Bac 999 thi truong',      isWorld: false, buy: bac999Buy,     sell: bac999Sell,     change: Math.round(worldChangeVndPerChi), cl: Math.round(bac999Sell     - worldSellVndPerChi) },
        { name: 'Bac nu trang ban le',     isWorld: false, buy: bacNuTrangBuy, sell: bacNuTrangSell, change: Math.round(worldChangeVndPerChi), cl: Math.round(bacNuTrangSell - worldSellVndPerChi) }
    ].map(item => ({
        ...item,
        name: item.name
            .replace('Bac The Gioi (XAG/USD)',  'Bạc Thế Gi�:i (XAG/USD)')
            .replace('Bac Phu Quy (1 Luong)',   'Bạc Phú Quý (1 Lượng)')
            .replace('Bac Phu Quy (1 Kg)',      'Bạc Phú Quý (1 Kg)')
            .replace('Bac 999 thi truong',      'Bạc 999 th�9 trường')
            .replace('Bac nu trang ban le',     'Bạc nữ trang bán lẻ')
    }));
}

async function fetchTvLivePrice() {
    const timestamp = Date.now();
    let xauResult = null;
    let xagResult = null;

    // 1. PRIMARY: TradingView Scanners (OANDA:XAUUSD & OANDA:XAGUSD - Exact Chart Source)
    const tvPayload = JSON.stringify({
        symbols: { tickers: ['OANDA:XAUUSD', 'OANDA:XAGUSD'] },
        columns: ['close', 'bid', 'ask', 'change', 'change_abs']
    });

    const endpoints = [
        'https://scanner.tradingview.com/forex/scan?t=' + timestamp,
        'https://scanner.tradingview.com/cfd/scan?t=' + timestamp,
        'https://scanner.tradingview.com/global/scan?t=' + timestamp
    ];

    for (const url of endpoints) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                body: tvPayload,
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://www.tradingview.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: AbortSignal.timeout(2500)
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.data && data.data.length > 0) {
                    const xau = data.data.find(item => item.s === 'OANDA:XAUUSD') || data.data.find(item => item.s === 'TVC:GOLD');
                    const xag = data.data.find(item => item.s === 'OANDA:XAGUSD') || data.data.find(item => item.s === 'TVC:SILVER');
                    if (!xauResult && xau && xau.d) xauResult = { close: parseFloat(xau.d[0]), bid: parseFloat(xau.d[1] || xau.d[0]), ask: parseFloat(xau.d[2] || xau.d[0]), change: parseFloat(xau.d[3] !== undefined ? xau.d[3] : 0) };
                    if (!xagResult && xag && xag.d) xagResult = { close: parseFloat(xag.d[0]), bid: parseFloat(xag.d[1] || xag.d[0]), ask: parseFloat(xag.d[2] || xag.d[0]), change: parseFloat(xag.d[3] !== undefined ? xag.d[3] : 0) };
                    if (xauResult && xagResult) break;
                }
            }
        } catch (e) {}
    }

    if (xauResult || xagResult) {
        return { xau: xauResult, xag: xagResult };
    }

    // 2. FALLBACK: Yahoo Finance SPOT GOLD (XAUUSD=X) & SPOT SILVER (XAGUSD=X)
    try {
        if (!xauResult) {
            const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=1m&range=1d&_t=${timestamp}`, { signal: AbortSignal.timeout(2500) });
            if (res.ok) {
                const yData = await res.json();
                const meta = yData?.chart?.result?.[0]?.meta;
                if (meta && meta.regularMarketPrice) {
                    const price = parseFloat(meta.regularMarketPrice);
                    const change = parseFloat(meta.fulldayChange !== undefined ? meta.fulldayChange : (meta.regularMarketPrice - meta.previousClose));
                    if (price > 1000) xauResult = { close: price, bid: price - 0.2, ask: price + 0.2, change };
                }
            }
        }
        if (!xagResult) {
            const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/XAGUSD=X?interval=1m&range=1d&_t=${timestamp}`, { signal: AbortSignal.timeout(2500) });
            if (res.ok) {
                const yData = await res.json();
                const meta = yData?.chart?.result?.[0]?.meta;
                if (meta && meta.regularMarketPrice) {
                    const price = parseFloat(meta.regularMarketPrice);
                    const change = parseFloat(meta.fulldayChange !== undefined ? meta.fulldayChange : (meta.regularMarketPrice - meta.previousClose));
                    if (price > 0) xagResult = { close: price, bid: price - 0.05, ask: price + 0.05, change };
                }
            }
        }
    } catch (e) {}

    // 3. FALLBACK: Vang247 API (https://vang247.com/price-service/api/v1/c_prices)
    try {
        if (!xauResult || !xagResult) {
            const res = await fetch(`https://vang247.com/price-service/api/v1/c_prices`, { signal: AbortSignal.timeout(2500) });
            if (res.ok) {
                const vData = await res.json();
                if (!xauResult) {
                    const xauItem = (vData.sjcNationWide || []).find(i => i && i.name === 'XAUUSD') || (vData.goldNationWide || []).find(i => i && i.name === 'XAUUSD');
                    if (xauItem && (xauItem.saigon || xauItem.hanoi)) {
                        const sg = xauItem.saigon || xauItem.hanoi;
                        const buy = parseFloat(sg.buy);
                        const sell = parseFloat(sg.sell);
                        if (buy > 1000) {
                            xauResult = { close: sell, bid: buy, ask: sell, change: parseFloat(sg.sell_change !== undefined ? sg.sell_change : 0) };
                        }
                    }
                }
                if (!xagResult) {
                    const xagItem = (vData.silver_price || []).find(i => i && i.name === 'XAGUSD');
                    if (xagItem && (xagItem.saigon || xagItem.hanoi)) {
                        const sg = xagItem.saigon || xagItem.hanoi;
                        const buy = parseFloat(sg.buy);
                        const sell = parseFloat(sg.sell);
                        if (buy > 0) {
                            xagResult = { close: sell, bid: buy, ask: sell, change: parseFloat(sg.sell_change !== undefined ? sg.sell_change : 0) };
                        }
                    }
                }
            }
        }
    } catch (e) {}

    return (xauResult || xagResult) ? { xau: xauResult, xag: xagResult } : null;
}

async function fetchVang247Backend() {
    try {
        const res = await fetch('https://vang247.com/price-service/api/v1/c_prices', {
            cache: 'no-store',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
            const data = await res.json();
            let sjc = null, g9999 = null, g999 = null, g95 = null;
            let worldGold = null;
            let worldSilver = null;

            const goldList = [
                ...(data.sjcNationWide || []),
                ...(data.goldNationWide || []),
                ...(data.vsg_gold_table || [])
            ];

            for (const item of goldList) {
                if (!item || !item.name) continue;
                const nameUpper = item.name.toUpperCase().trim();
                const sg = item.saigon || item.hanoi;
                if (!worldGold && (nameUpper === 'XAUUSD' || nameUpper === 'XAU/USD')) {
                    if (sg && (parseFloat(sg.buy) > 0 || parseFloat(sg.sell) > 0)) {
                        worldGold = {
                            buy: parseFloat(sg.buy) || parseFloat(sg.sell),
                            sell: parseFloat(sg.sell) || parseFloat(sg.buy),
                            change: parseFloat(sg.sell_change !== undefined ? sg.sell_change : (sg.buy_change || 0))
                        };
                    }
                }
                if (!sg) continue;
                const nameClean = item.name.trim();
                const nameLower = nameClean.toLowerCase().replace(/\s+/g, ' ');

                if (!sjc && (nameClean === 'SJC TD' || nameLower.includes('sjc td') || nameLower.includes('sjc t� do') || nameClean === 'SJC')) {
                    sjc = item.saigon || item.hanoi;
                }
                else if (!g9999 && (nameClean === '999,9 TD' || nameClean === '999.9 TD' || nameLower.includes('999,9 td') || nameLower.includes('999.9 td') || nameLower.includes('999.9') || nameLower.includes('999,9'))) {
                    g9999 = item.saigon || item.hanoi;
                }
                else if (!g999 && (nameClean === '99,9 TD' || nameClean === '99.9 TD' || nameLower.includes('99,9 td') || nameLower.includes('99.9 td') || nameLower.includes('99.9') || nameLower.includes('99,9'))) {
                    g999 = item.saigon || item.hanoi;
                }
                else if (!g95 && (nameClean.includes('95%') || nameLower.includes('v�ng 95') || nameLower.includes('95%'))) {
                    g95 = item.saigon || item.hanoi;
                }
            }

            let phuquy1L = null;
            const silverList = data.silver_price || data.silverTable || [];
            for (const sItem of silverList) {
                if (!sItem || !sItem.name) continue;
                const sNameUpper = sItem.name.toUpperCase().trim();
                const sg = sItem.saigon || sItem.hanoi;
                if (!worldSilver && (sNameUpper === 'XAGUSD' || sNameUpper === 'XAG/USD')) {
                    if (sg && (parseFloat(sg.buy) > 0 || parseFloat(sg.sell) > 0)) {
                        worldSilver = {
                            buy: parseFloat(sg.buy) || parseFloat(sg.sell),
                            sell: parseFloat(sg.sell) || parseFloat(sg.buy),
                            change: parseFloat(sg.sell_change !== undefined ? sg.sell_change : (sg.buy_change || 0))
                        };
                    }
                }
                if (!phuquy1L && (sNameUpper.includes('PHUQUY_1L') || sNameUpper.includes('PHUQUY'))) phuquy1L = sg;
            }

            const parsePrice = (raw, offset = 20) => {
                if (raw === undefined || raw === null) return null;
                const val = parseFloat(raw);
                if (isNaN(val) || val <= 0) return null;
                const baseChi = val > 50000 ? Math.round(val / 10) : Math.round(val);
                return baseChi + offset;
            };

            const parseRawPrice = (raw) => {
                if (raw === undefined || raw === null) return null;
                const val = parseFloat(raw);
                return (isNaN(val) || val <= 0) ? null : Math.round(val);
            };

            let currencies = [];
            const rawCurrencyList = data.currencyNationWide || data.exchangeRateTable || [];
            if (Array.isArray(rawCurrencyList) && rawCurrencyList.length > 0) {
                currencies = rawCurrencyList.map(item => {
                    const sg = item.saigon || item.hanoi || {};
                    const rawName = item.name || '';
                    let code = rawName.toUpperCase().trim();
                    if (rawName.includes('USD')) code = 'USD';
                    else if (rawName.includes('EUR')) code = 'EUR';
                    else if (rawName.includes('GBP')) code = 'GBP';
                    else if (rawName.includes('JPY')) code = 'JPY';
                    else if (rawName.includes('AUD')) code = 'AUD';
                    else if (rawName.includes('CAD')) code = 'CAD';
                    else if (rawName.includes('SGD')) code = 'SGD';
                    else if (rawName.includes('CHF')) code = 'CHF';
                    else if (rawName.includes('CNY')) code = 'CNY';
                    else if (rawName.includes('THB')) code = 'THB';

                    const buy = parseFloat(sg.buy) || 0;
                    const sell = parseFloat(sg.sell) || 0;
                    const midRate = (buy > 0 && sell > 0) ? Math.round((buy + sell) / 2) : (buy || sell || 0);

                    return {
                        code: code,
                        name: rawName,
                        rateBuy: buy,
                        rateSell: sell,
                        rateRate: midRate,
                        digit: (code === 'JPY' || code === 'THB' || code === 'KRW' || code === 'IDR' || code === 'PHP') ? 1 : 0
                    };
                });
            }

            return {
                worldGold,
                worldSilver,
                sjcBuy: parsePrice(sjc?.buy),
                sjcSell: parsePrice(sjc?.sell),
                g9999Buy: parsePrice(g9999?.buy),
                g9999Sell: parsePrice(g9999?.sell),
                g999Buy: parsePrice(g999?.buy),
                g999Sell: parsePrice(g999?.sell),
                g95Buy: parsePrice(g95?.buy),
                g95Sell: parsePrice(g95?.sell),
                phuquy1LBuy: parseRawPrice(phuquy1L?.buy),
                phuquy1LSell: parseRawPrice(phuquy1L?.sell),
                currencies
            };
        }
    } catch (e) {}
    return null;
}

app.get(['/api/gold-rates', '/api/gold-prices', '/api/vang247', '/vang247', '/api/v1/vang247'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    const v247Data = await fetchVang247Backend();
    return res.json({ success: true, data: v247Data });
});

app.get(['/api/tv-price', '/tv-price', '/api/index.js/tv-price'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const tv = await fetchTvLivePrice();
    return res.json({ success: true, data: tv });
});

// ���� S� li�!u n�"i ��9a tĩnh (cập nhật thủ công khi cần) ����
const STATIC_USD_RATE = 26030;

const STATIC_GOLD = {
    sjcBuy: 142147, sjcSell: 143447, sjcChange: -53,
    g9999Buy: 132321, g9999Sell: 133821, g9999Change: 21,
    g999Buy: 132031, g999Sell: 133531, g999Change: 31,
    g95Buy: 125439, g95Sell: 126939, g95Change: -611
};

const STATIC_CURRENCIES = [
    { code: 'USD', name: 'Đô la Mỹ',          rateBuy: 25750, rateSell: 26150, rateRate: 0, digit: 0 },
    { code: 'EUR', name: 'Euro Châu �u',       rateBuy: 27800, rateSell: 28400, rateRate: 0, digit: 0 },
    { code: 'GBP', name: 'Bảng Anh',           rateBuy: 32900, rateSell: 33700, rateRate: 0, digit: 0 },
    { code: 'JPY', name: 'Yên Nhật (100 JPY)', rateBuy: 17200, rateSell: 17800, rateRate: 0, digit: 0 },
    { code: 'SGD', name: 'Đô la Singapore',    rateBuy: 19800, rateSell: 20400, rateRate: 0, digit: 0 },
    { code: 'AUD', name: 'Đô la �aC',           rateBuy: 16800, rateSell: 17400, rateRate: 0, digit: 0 },
    { code: 'CAD', name: 'Đô la Canada',        rateBuy: 18900, rateSell: 19500, rateRate: 0, digit: 0 }
];

// 1. ENDPOINT LẤY BẢNG GIÁ VÀNG DỰA TRÊN VANG247 / TRADINGVIEW
app.get(['/api/gold', '/gold', '/api/v1/gold', '/api/index.js', '/api'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
        const v247Data = await fetchVang247Backend();
        const tvPrice = await fetchTvLivePrice();

        const xauSell   = (v247Data && v247Data.worldGold && v247Data.worldGold.sell > 0) ? v247Data.worldGold.sell : (tvPrice?.xau ? tvPrice.xau.close : 4172.00);
        const xauBuy    = (v247Data && v247Data.worldGold && v247Data.worldGold.buy > 0) ? v247Data.worldGold.buy : xauSell;
        const xauChange = (v247Data && v247Data.worldGold && v247Data.worldGold.change !== undefined) ? v247Data.worldGold.change : (tvPrice?.xau ? tvPrice.xau.change : 0);

        const xagSell   = (v247Data && v247Data.worldSilver && v247Data.worldSilver.sell > 0) ? v247Data.worldSilver.sell : (tvPrice?.xag ? tvPrice.xag.close : 66.36);
        const xagBuy    = (v247Data && v247Data.worldSilver && v247Data.worldSilver.buy > 0) ? v247Data.worldSilver.buy : xagSell;
        const xagChange = (v247Data && v247Data.worldSilver && v247Data.worldSilver.change !== undefined) ? v247Data.worldSilver.change : (tvPrice?.xag ? tvPrice.xag.change : 0);

        const activeUsdRate = (v247Data && v247Data.currencies && v247Data.currencies.length > 0) ? (v247Data.currencies.find(c => c.code === 'USD')?.rateSell || STATIC_USD_RATE) : STATIC_USD_RATE;

        const sjcBuy   = (v247Data && v247Data.sjcBuy)   ? v247Data.sjcBuy   : STATIC_GOLD.sjcBuy;
        const sjcSell  = (v247Data && v247Data.sjcSell)  ? v247Data.sjcSell  : STATIC_GOLD.sjcSell;
        const sjcChange = -53;

        const g9999Buy  = (v247Data && v247Data.g9999Buy)  ? v247Data.g9999Buy  : STATIC_GOLD.g9999Buy;
        const g9999Sell = (v247Data && v247Data.g9999Sell) ? v247Data.g9999Sell : STATIC_GOLD.g9999Sell;
        const g9999Change = 21;

        const g999Buy  = (v247Data && v247Data.g999Buy)  ? v247Data.g999Buy  : STATIC_GOLD.g999Buy;
        const g999Sell = (v247Data && v247Data.g999Sell) ? v247Data.g999Sell : STATIC_GOLD.g999Sell;
        const g999Change = 31;

        const g95Buy  = (v247Data && v247Data.g95Buy)  ? v247Data.g95Buy  : STATIC_GOLD.g95Buy;
        const g95Sell = (v247Data && v247Data.g95Sell) ? v247Data.g95Sell : STATIC_GOLD.g95Sell;
        const g95Change = -611;

        const troyOunce = 31.1034768;
        const baseChiVND     = Math.round((xauSell * activeUsdRate / troyOunce) * 0.375);
        const baseLuongVND   = baseChiVND * 10;
        const baseLuongInNgan = Math.round(baseLuongVND / 100);

        const sjcSellL   = sjcSell   > 50000 ? sjcSell   : sjcSell   * 10;
        const g9999SellL = g9999Sell > 50000 ? g9999Sell : g9999Sell * 10;
        const g999SellL  = g999Sell  > 50000 ? g999Sell  : g999Sell  * 10;
        const g95SellL   = g95Sell   > 50000 ? g95Sell   : g95Sell   * 10;

        const goldItems = [
            { name: 'Vàng TG',    isWorld: true,  buy: parseFloat(xauBuy.toFixed(2)),  sell: parseFloat(xauSell.toFixed(2)),  change: parseFloat(xauChange.toFixed(2)),  cl: 0 },
            { name: 'SJC Tự do',  isWorld: false, buy: sjcBuy,   sell: sjcSell,   change: sjcChange,   cl: Math.round(sjcSellL   - baseLuongInNgan) },
            { name: 'Vàng 999.9', isWorld: false, buy: g9999Buy, sell: g9999Sell, change: g9999Change, cl: Math.round(g9999SellL - baseLuongInNgan) },
            { name: 'Vàng 99.9',  isWorld: false, buy: g999Buy,  sell: g999Sell,  change: g999Change,  cl: Math.round(g999SellL  - baseLuongInNgan) },
            { name: 'Vàng 95',    isWorld: false, buy: g95Buy,   sell: g95Sell,   change: g95Change,   cl: Math.round(g95SellL   - baseLuongInNgan) },
            { name: 'Vàng 980',   isWorld: false, buy: Math.round(g9999Buy*0.980), sell: Math.round(g9999Sell*0.980), change: Math.round(g9999Change*0.980), cl: Math.round(Math.round(g9999SellL*0.980)-baseLuongInNgan) },
            { name: 'Vàng 750',   isWorld: false, buy: Math.round(g9999Buy*0.750), sell: Math.round(g9999Sell*0.750), change: Math.round(g9999Change*0.750), cl: Math.round(Math.round(g9999SellL*0.750)-baseLuongInNgan) },
            { name: 'Vàng 610',   isWorld: false, buy: Math.round(g9999Buy*0.610), sell: Math.round(g9999Sell*0.610), change: Math.round(g9999Change*0.610), cl: Math.round(Math.round(g9999SellL*0.610)-baseLuongInNgan) },
            { name: 'Vàng 585',   isWorld: false, buy: Math.round(g9999Buy*0.585), sell: Math.round(g9999Sell*0.585), change: Math.round(g9999Change*0.585), cl: Math.round(Math.round(g9999SellL*0.585)-baseLuongInNgan) },
            { name: 'Vàng 416',   isWorld: false, buy: Math.round(g9999Buy*0.416), sell: Math.round(g9999Sell*0.416), change: Math.round(g9999Change*0.416), cl: Math.round(Math.round(g9999SellL*0.416)-baseLuongInNgan) }
        ];

        const activeCurrencies = (v247Data && v247Data.currencies && v247Data.currencies.length > 0) ? v247Data.currencies : STATIC_CURRENCIES;
        const silverItems = buildSilverItemsFromTv(xagSell, xagBuy, xagChange, activeUsdRate);

        return res.json({
            success: true,
            source: 'Vang247 API Live',
            price: xauSell,
            bid: xauBuy,
            ask: xauSell,
            change: parseFloat(xauChange.toFixed(2)),
            changePercent: parseFloat(((xauChange / Math.max(xauSell - xauChange, 1)) * 100).toFixed(2)),
            exchangeRate: activeUsdRate,
            baseLuongVND,
            lastUpdatedStr: getFormattedDateTimeStr(),
            goldItems,
            currencies: activeCurrencies,
            silverItems
        });
        return;
    } catch (error) {
        console.error('Error fetching gold data:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});


// 2. ENDPOINT LẤY BẢNG GIÁ BẠC
app.get(['/api/silver', '/silver', '/api/v1/silver'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
        const v247Data = await fetchVang247Backend();
        const tvPrice = await fetchTvLivePrice();

        const xagSell   = (v247Data && v247Data.worldSilver && v247Data.worldSilver.sell > 0) ? v247Data.worldSilver.sell : (tvPrice?.xag ? tvPrice.xag.close : 66.36);
        const xagBuy    = (v247Data && v247Data.worldSilver && v247Data.worldSilver.buy > 0) ? v247Data.worldSilver.buy : xagSell;
        const xagChange = (v247Data && v247Data.worldSilver && v247Data.worldSilver.change !== undefined) ? v247Data.worldSilver.change : (tvPrice?.xag ? tvPrice.xag.change : 0);

        const activeUsdRate = (v247Data && v247Data.currencies && v247Data.currencies.length > 0) ? (v247Data.currencies.find(c => c.code === 'USD')?.rateSell || STATIC_USD_RATE) : STATIC_USD_RATE;

        const silverItems = buildSilverItemsFromTv(xagSell, xagBuy, xagChange, activeUsdRate);
        return res.json({
            success: true,
            source: 'Vang247 API Live (Silver)',
            price: parseFloat(xagSell.toFixed(2)),
            bid: parseFloat(xagBuy.toFixed(2)),
            ask: parseFloat(xagSell.toFixed(2)),
            change: parseFloat(xagChange.toFixed(2)),
            exchangeRate: activeUsdRate,
            lastUpdatedStr: getFormattedDateTimeStr(),
            silverItems
        });
    } catch (error) {
        console.error('Lá»—i khi láº¥y dá»¯ liá»‡u báº¡c:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2b. ENDPOINT L�Y GI� TR�C TI�P TRADINGVIEW
app.get(['/api/tv-price', '/tv-price'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    try {
        const tvData = await fetchTvLivePrice();
        return res.json({ success: true, data: tvData });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});



// 3. ENDPOINT LẤY TIN TỨC TH�` TRƯ�SNG TỰ Đ��NG TỪ CÁC BÁO L�aN (RSS FEED)
let cachedNewsData = null;
let lastNewsCacheTime = 0;
const NEWS_CACHE_TTL = 5 * 60 * 1000; // Cache 5 phút

const RSS_FEEDS = [
    { name: 'VnExpress', url: 'https://vnexpress.net/rss/kinh-doanh.rss' },
    { name: 'CafeF', url: 'https://cafef.vn/thi-truong.rss' },
    { name: 'CafeF Quốc Tế', url: 'https://cafef.vn/tai-chinh-quoc-te.rss' },
    { name: 'CafeF Ngân Hàng', url: 'https://cafef.vn/tai-chinh-ngan-hang.rss' },
    { name: 'VietnamNet', url: 'https://vietnamnet.vn/rss/kinh-doanh.rss' },
    { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/kinh-doanh.rss' }
];

function extractTag(xml, tagName) {
    const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i'));
    if (!match) return '';
    let val = match[1].trim();
    val = val.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
    return val.trim();
}

function extractImage(html) {
    if (!html) return '';
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match) return match[1];
    const enclosureMatch = html.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (enclosureMatch) return enclosureMatch[1];
    const mediaMatch = html.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    if (mediaMatch) return mediaMatch[1];
    return '';
}

function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim();
}

function isStrictGoldSilver(title, summary) {
    const titleLower = title.toLowerCase();
    
    // Loại bỏ các bài không thuộc kinh tế / tài chính (thể thao, giải trí, showbiz)
    const nonFinancialMetaphors = ['bàn thắng', 'bóng đá', 'thể thao', 'showbiz', 'hoa hậu', 'giải trí', 'ca sĩ', 'diễn viên', 'phim'];
    for (const m of nonFinancialMetaphors) {
        if (titleLower.includes(m)) return false;
    }

    return true; // Giữ lại tất cả bài báo từ RSS Kinh tế, Tài chính 24/7 của VnExpress, CafeF, VietnamNet, Tuổi Trẻ
}

function categorizeArticle(title, description) {
    const text = (title + ' ' + description).toLowerCase();
    
    // 1. Bạc & Kim loại quý khác (Check kỹ tránh nhầm 'vàng bạc' hay 'tiệm vàng bạc')
    const hasSilverKeyword = text.includes('giá bạc') || text.includes('thị trường bạc') || text.includes('bạc thỏi') || text.includes('bạc miếng') || text.includes('silver') || text.includes('xag') || text.includes('kim loại bạc') || (text.includes('bạc') && !text.includes('vàng bạc') && !text.includes('bạc triệu') && !text.includes('bạc tỷ') && !text.includes('bạc phận'));
    if (hasSilverKeyword) {
        return {
            category: 'silver',
            categoryName: 'Thị Trường Bạc',
            badgeClass: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
        };
    }

    // 2. Chính sách & Quản lý thị trường
    if (text.includes('ngân hàng nhà nước') || text.includes('nhnn') || text.includes('nghị định') || text.includes('chính sách') || text.includes('thanh tra') || text.includes('đấu thầu') || text.includes('thuế') || text.includes('quản lý') || text.includes('bình ổn') || text.includes('kiểm tra') || text.includes('hóa đơn')) {
        return {
            category: 'policy',
            categoryName: 'Chính Sách & Quản Lý',
            badgeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
        };
    }

    // 3. Phân tích & Dự báo & Nhận định
    if (text.includes('dự báo') || text.includes('nhận định') || text.includes('chuyên gia') || text.includes('phân tích') || text.includes('xu hướng') || text.includes('liệu') || text.includes('kịch bản') || text.includes('tại sao') || text.includes('vì sao') || text.includes('nên làm gì') || text.includes('chiến lược') || text.includes('triển vọng') || text.includes('sức ép') || text.includes('tăng mạnh') || text.includes('giảm sâu') || text.includes('quay xe') || text.includes('đảo chiều') || text.includes('biến động') || text.includes('bất ngờ') || text.includes('rơi thẳng')) {
        return {
            category: 'analysis',
            categoryName: 'Phân Tích & Dự Báo',
            badgeClass: 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
        };
    }

    // 4. Vàng thế giới / Quốc tế
    if (text.includes('thế giới') || text.includes('quốc tế') || text.includes('fed') || text.includes('mỹ') || text.includes('usd') || text.includes('trung quốc') || text.includes('anh') || text.includes('wall street') || text.includes('kitco') || text.includes('xau') || text.includes('toàn cầu') || text.includes('ngoại tệ') || text.includes('châu á') || text.includes('châu âu')) {
        return {
            category: 'world',
            categoryName: 'Vàng Quốc Tế',
            badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
        };
    }

    // 5. Vàng trong nước
    return {
        category: 'gold',
        categoryName: 'Vàng SJC & Trong nước',
        badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
    };
}

const SEED_NEWS = [
    {
        id: 901,
        title: "Ngân hàng Nhà nước đẩy mạnh các giải pháp quản lý và bình ổn thị trường vàng",
        category: "policy",
        categoryName: "Chính Sách & Quản Lý",
        badgeClass: "bg-rose-500/20 text-rose-300 border border-rose-500/40",
        image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=60",
        summary: "Ngân hàng Nhà nước phối hợp cùng các bộ ngành liên quan siết chặt kiểm tra hóa đơn điện tử từng lần bán, nguồn gốc xuất xứ vàng trang sức mỹ nghệ và hoàn thiện sửa đổi Nghị định 24.",
        source: "Cổng Thông Tin NHNN",
        link: "https://sbv.gov.vn",
        date: "Hôm nay",
        readTime: "3 phút đọc",
        featured: false
    },
    {
        id: 902,
        title: "Thị trường Bạc (XAG/USD) tăng vọt: Nhu cầu sản xuất pin mặt trời & xe điện lập kỷ kỷ lục",
        category: "silver",
        categoryName: "Thị Trường Bạc",
        badgeClass: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40",
        image: "https://images.unsplash.com/photo-1605792657660-596af9009e82?w=800&auto=format&fit=crop&q=60",
        summary: "Bạc không chỉ đóng vai trò kim loại quý tích trữ mà còn là nguyên liệu công nghiệp thiết yếu. Tốc độ tiêu thụ bạc trong ngành năng lượng tái tạo đã vượt qua mọi dự báo quý 3.",
        source: "Viện Bạc Quốc Tế (Silver Institute)",
        link: "https://silverinstitute.org",
        date: "Hôm nay",
        readTime: "4 phút đọc",
        featured: false
    },
    {
        id: 903,
        title: "Phân tích kỹ thuật & Triển vọng giá vàng: Liệu XAU/USD có sớm vượt mốc 3.000 USD/Ounce?",
        category: "analysis",
        categoryName: "Phân Tích & Dự Báo",
        badgeClass: "bg-purple-500/20 text-purple-300 border border-purple-500/40",
        image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=60",
        summary: "Các chuyên gia phân tích tài chính Phố Wall từ Goldman Sachs và Citi nhận định xu hướng mua ròng của các NHTW cùng chu kỳ cắt giảm lãi suất sẽ là động lực chính hỗ trợ giá vàng.",
        source: "Kitco & Bloomberg",
        link: "https://kitco.com",
        date: "Hôm nay",
        readTime: "5 phút đọc",
        featured: false
    },
    {
        id: 904,
        title: "Giá vàng hôm nay: SJC và Vàng nhẫn 999.9 duy trì đà tăng mạnh trước thềm công bố chính sách tiền tệ",
        category: "gold",
        categoryName: "Vàng SJC & Trong nước",
        badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
        image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800&auto=format&fit=crop&q=60",
        summary: "Thị trường vàng trong nước ghi nhận sức mua tăng đột biến ở cả vàng miếng SJC và vàng nhẫn trơn 9999.",
        source: "Ban Biên Tập Thị Trường",
        link: "#",
        date: "Hôm nay",
        readTime: "3 phút đọc",
        featured: true
    },
    {
        id: 905,
        title: "Sức mua vàng nhẫn trơn 999.9 tăng vọt: Người dân ưu tiên tài sản có tính thanh khoản cao",
        category: "gold",
        categoryName: "Vàng SJC & Trong nước",
        badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
        image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=60",
        summary: "Nhu cầu mua vàng nhẫn 9999 từ các thương hiệu lớn như PNJ, DOJI, Bảo Tín Minh Châu tiếp tục duy trì ở mức cao.",
        source: "Ban Tài Chính Trong Nước",
        link: "#",
        date: "Hôm nay",
        readTime: "3 phút đọc",
        featured: false
    },
    {
        id: 906,
        title: "Chỉ số USD Index hạ nhiệt thúc đẩy dòng tiền quay trở lại thị trường Vàng & Kim loại quý",
        category: "world",
        categoryName: "Vàng Quốc Tế",
        badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
        image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&auto=format&fit=crop&q=60",
        summary: "Đồng USD suy yếu trên thị trường quốc tế là động lực hỗ trợ đà bứt phá của giá vàng XAU/USD và bạc XAG/USD.",
        source: "Reuters & FXStreet",
        link: "#",
        date: "Hôm nay",
        readTime: "4 phút đọc",
        featured: false
    }
];

async function fetchRssNews() {
    const now = Date.now();
    if (cachedNewsData && (now - lastNewsCacheTime) < NEWS_CACHE_TTL) {
        return cachedNewsData;
    }

    let allItems = [];
    let articleId = 1;

    const feedPromises = RSS_FEEDS.map(async (feed) => {
        try {
            const res = await fetch(feed.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: AbortSignal.timeout(3500)
            });

            if (res.ok) {
                const xml = await res.text();
                const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
                const items = [];

                for (const itemXml of itemMatches) {
                    const title = stripHtml(extractTag(itemXml, 'title'));
                    const link = extractTag(itemXml, 'link');
                    const rawDesc = extractTag(itemXml, 'description');
                    const summary = stripHtml(rawDesc);
                    let image = extractImage(itemXml) || extractImage(rawDesc);
                    if (!image || !image.startsWith('http')) {
                        image = 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800&auto=format&fit=crop&q=60';
                    }
                    const pubDateStr = extractTag(itemXml, 'pubDate');

                    if (!title || title.length < 10) continue;

                    if (isStrictGoldSilver(title, summary)) {
                        const { category, categoryName, badgeClass } = categorizeArticle(title, summary);
                        
                        let dateFormatted = 'Hôm nay';
                        if (pubDateStr) {
                            try {
                                const d = new Date(pubDateStr);
                                if (!isNaN(d.getTime())) {
                                    dateFormatted = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                }
                            } catch (e) {}
                        }

                        items.push({
                            title: title,
                            category: category,
                            categoryName: categoryName,
                            badgeClass: badgeClass,
                            image: image,
                            summary: summary.length > 200 ? summary.substring(0, 200) + '...' : summary,
                            source: feed.name,
                            link: link,
                            date: dateFormatted,
                            readTime: `${Math.max(2, Math.round(summary.length / 70))} phút đọc`,
                            featured: false
                        });
                    }
                }
                return items;
            }
        } catch (err) {
            console.warn(`⚠️ Lỗi khi nạp RSS từ ${feed.name}:`, err.message);
        }
        return [];
    });

    const results = await Promise.allSettled(feedPromises);
    results.forEach(res => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            res.value.forEach(item => {
                if (!allItems.some(i => i.title === item.title)) {
                    allItems.push({ ...item, id: articleId++ });
                }
            });
        }
    });

    SEED_NEWS.forEach(seed => {
        if (!allItems.some(i => i.title === seed.title)) {
            allItems.push({ ...seed, id: articleId++ });
        }
    });

    allItems.sort((a, b) => {
        const score = (item) => {
            const t = (item.title + ' ' + item.summary).toLowerCase();
            if (item.category === 'policy') return 5;
            if (item.category === 'silver') return 5;
            if (t.includes('giá vàng hôm nay') || t.includes('vàng miếng') || t.includes('vàng nhẫn') || t.includes('sjc')) return 4;
            if (t.includes('vàng') || t.includes('bạc')) return 3;
            if (t.includes('fed') || t.includes('xau') || t.includes('xag')) return 2;
            return 1;
        };
        return score(b) - score(a);
    });

    if (allItems.length > 0) {
        allItems[0].featured = true;
    }

    cachedNewsData = allItems.slice(0, 100);
    lastNewsCacheTime = now;
    return cachedNewsData;
}

app.get(['/api/news', '/news', '/api/v1/news'], async (req, res) => {
    try {
        const news = await fetchRssNews();
        res.json({
            success: true,
            count: news.length,
            lastUpdated: new Date(lastNewsCacheTime).toISOString(),
            data: news
        });
    } catch (error) {
        console.error('Lỗi API Tin Tức:', error);
        res.json({
            success: true,
            count: 0,
            data: []
        });
    }
});

function getCurrencyFullName(code) {
    const map = {
        'USD': 'Đô la Mỹ',
        'USD Interbank': 'USD Liên ngân hàng',
        'AUD': 'Đô la Úc',
        'CAD': 'Đô la Canada',
        'EUR': 'Euro Châu Âu',
        'GBP': 'Bảng Anh',
        'CHF': 'Franc Thụy Sĩ',
        'JPY': 'Yên Nhật',
        'NZD': 'Đô la New Zealand',
        'SGD': 'Đô la Singapore',
        'THB': 'Baht Thái Lan',
        'TWD': 'Tân Đài Tệ',
        'KRW': 'Won Hàn Quốc',
        'MYR': 'Ringgit Malaysia',
        'HKD': 'Đô la Hồng Kông',
        'CNY': 'Nhân Dân Tệ'
    };
    return map[code] || code;
}

const DEFAULT_PORT = process.env.PORT || 3001;

function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`✅ Backend GoldPrice & RSS News Server đang chạy tại: http://localhost:${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️ Cổng ${port} bận, thử cổng ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err);
        }
    });
}

if (require.main === module) {
    startServer(DEFAULT_PORT);
}

app.startServer = startServer;

module.exports = app;
module.exports.app = app;
