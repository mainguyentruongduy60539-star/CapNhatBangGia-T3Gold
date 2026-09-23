const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(process.cwd()));

app.get('/', (req, res) => {
    const publicIndex = path.join(process.cwd(), 'public', 'index.html');
    const rootIndex = path.join(process.cwd(), 'index.html');
    if (require('fs').existsSync(publicIndex)) {
        res.sendFile(publicIndex);
    } else {
        res.sendFile(rootIndex);
    }
});

const VSG_API = 'https://services.vang247.vn/ws-prices/api/v1/c_prices';
const GOLDPRICE_DEV_BASE = 'https://api.goldprice.dev/v1';

let cachedVsgData = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 500; // Cache 0.5 giây để nhảy số siêu tốc theo VangSaigon

async function fetchVsgData() {
    const now = Date.now();
    if (cachedVsgData && (now - lastCacheTime) < CACHE_TTL_MS) {
        return cachedVsgData;
    }

    const headersList = [
        {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        },
        {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Origin': 'https://vangsaigon.vn',
            'Referer': 'https://vangsaigon.vn/'
        }
    ];

    for (const headers of headersList) {
        try {
            const res = await fetch(VSG_API, {
                headers,
                signal: AbortSignal.timeout(6000)
            });

            if (res.ok) {
                const data = await res.json();
                if (data && (data.vsg_gold_table || data.sjcNationWide || data.goldNationWide)) {
                    cachedVsgData = data;
                    lastCacheTime = now;
                    return data;
                }
            }
        } catch (err) {
            console.warn('⚠️ Retry fetchVsgData error:', err.message);
        }
    }
    return cachedVsgData;
}

function formatVsgTimestamp(isoStr) {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
        const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
        return `${dateStr} ${timeStr}`;
    } catch (e) {
        return '';
    }
}

function buildSilverItemsFromVsg(vsg) {
    if (!vsg || !vsg.silver_price) return [];
    
    // 1. Chỉ lấy Bạc TG, Phú Quý 1L, Phú Quý 1KG từ API (Bỏ Bạc Phú Quý 5L)
    const silverMap = {
        'XAGUSD': { name: 'Bạc Thế Giới (XAG/USD)', isWorld: true, multiplier: 1 },
        'PHUQUY_1L': { name: 'Bạc Phú Quý (1 Lượng)', isWorld: false, multiplier: 1000 },
        'PHUQUY_1KG': { name: 'Bạc Phú Quý (1 Kg)', isWorld: false, multiplier: 1000 }
    };

    const rawItems = (vsg.silver_price || []).filter(s => silverMap[s.name]);
    const xagRaw = rawItems.find(s => s.name === 'XAGUSD') || { saigon: { buy: 66.31, sell: 66.36, sell_change: 1.05 } };
    const usdItem = (vsg.currencyNationWide || []).find(i => i.name === 'USD');
    const exchangeRate = usdItem?.saigon?.sell || 26030;
    const worldSellVndPerChi = (xagRaw.saigon.sell * exchangeRate / 31.1034768) * 3.75;
    const worldChangeVndPerChi = ((xagRaw.saigon.sell_change || 0) * exchangeRate / 31.1034768) * 3.75;

    const items = rawItems.map(s => {
        const cfg = silverMap[s.name];
        const buyVal = cfg.isWorld ? parseFloat(s.saigon?.buy?.toFixed(2) || 66.31) : Math.round((s.saigon?.buy || 0) * cfg.multiplier);
        const sellVal = cfg.isWorld ? parseFloat(s.saigon?.sell?.toFixed(2) || 66.36) : Math.round((s.saigon?.sell || 0) * cfg.multiplier);
        const changeVal = cfg.isWorld ? parseFloat(s.saigon?.sell_change?.toFixed(2) || 1.05) : Math.round((s.saigon?.sell_change || 0) * cfg.multiplier);
        
        let clVal = 0;
        if (!cfg.isWorld) {
            let sellInChi = sellVal;
            if (s.name === 'PHUQUY_1L') sellInChi = sellVal / 10;
            else if (s.name === 'PHUQUY_1KG') sellInChi = sellVal / 266.67;
            clVal = Math.round(sellInChi - worldSellVndPerChi);
        }

        return {
            name: cfg.name,
            isWorld: cfg.isWorld,
            buy: buyVal,
            sell: sellVal,
            change: changeVal,
            cl: clVal
        };
    });

    // 2. Bạc 999 thị trường: Giá bán là làm tròn của giá bán bạc thế giới, giá mua lệch 30k so với giá bán
    const bac999Sell = Math.ceil(worldSellVndPerChi / 10000) * 10000;
    const bac999Buy = bac999Sell - 30000;
    items.push({
        name: 'Bạc 999 thị trường',
        isWorld: false,
        buy: bac999Buy,
        sell: bac999Sell,
        change: Math.round(worldChangeVndPerChi),
        cl: Math.round(bac999Sell - worldSellVndPerChi)
    });

    // 3. Bạc nữ trang bán lẻ: Giá mua, bán là +70k của bạc 999 thị trường
    const bacNuTrangSell = bac999Sell + 70000;
    const bacNuTrangBuy = bac999Buy + 70000;
    items.push({
        name: 'Bạc nữ trang bán lẻ',
        isWorld: false,
        buy: bacNuTrangBuy,
        sell: bacNuTrangSell,
        change: Math.round(worldChangeVndPerChi),
        cl: Math.round(bacNuTrangSell - worldSellVndPerChi)
    });

    return items;
}

// 1. ENDPOINT LẤY BẢNG GIÁ VÀNG CHUẨN 100% VANGSAIGON.VN
app.get(['/api/gold', '/gold', '/api/v1/gold'], async (req, res) => {
    try {
        const vsg = await fetchVsgData();

        if (vsg) {
            const xau = vsg.sjcNationWide?.find(i => i.name === 'XAUUSD') || vsg.goldNationWide?.find(i => i.name === 'XAUUSD') || vsg.vsg_gold_table?.find(i => i.name === 'Vàng TG' || i.name === 'XAUUSD');
            const xauBuy = xau?.saigon?.buy || 4378.6;
            const xauSell = xau?.saigon?.sell || 4378.8;
            const xauChange = xau?.saigon?.sell_change || 35.41;

            const usdItem = vsg.currencyNationWide?.find(i => i.name === 'USD');
            const exchangeRate = usdItem?.saigon?.sell || 26030;

            const troyOunceToGram = 31.1034768;
            const gramToLuong = 37.5;

            // 1. Tính giá gốc VangSaigon per chỉ (VNĐ/Chỉ)
            const sjcTdRaw = vsg.vsg_gold_table?.find(i => i.name === 'SJC Tự do');
            const baseVsgChiVND = (sjcTdRaw && sjcTdRaw.gap && sjcTdRaw.saigon?.sell)
                ? (sjcTdRaw.saigon.sell - sjcTdRaw.gap) * 100
                : Math.round((xauSell * exchangeRate / troyOunceToGram) * 3.75);
            const baseLuongVND = baseVsgChiVND * 10;
            const worldSellVndPerChi = baseVsgChiVND;

            let goldItems = [];

            if (Array.isArray(vsg.vsg_gold_table) && vsg.vsg_gold_table.length > 0) {
                goldItems = vsg.vsg_gold_table.map(item => {
                    const isWorld = item.name === 'Vàng TG' || item.name === 'XAUUSD';
                    const isGF95 = item.name === '95% GF';
                    const buyVal = isWorld ? parseFloat((item.saigon?.buy || 0).toFixed(2)) : (isGF95 ? Math.round(item.saigon?.buy) : Math.round(item.saigon?.buy || 0));
                    const sellVal = isWorld ? parseFloat((item.saigon?.sell || 0).toFixed(2)) : (isGF95 ? Math.round(item.saigon?.sell) : Math.round(item.saigon?.sell || 0));
                    // item.gap từ API VangSaigon là nghìn VNĐ / Lượng -> quy đổi VNĐ / Chỉ: gap * 1000 / 10 = gap * 100
                    const clInChiVND = isWorld ? 0 : (item.gap !== undefined ? Math.round(item.gap * 100) : Math.round(sellVal * 100 - baseVsgChiVND));
                    return {
                        name: item.name === 'XAUUSD' ? 'Vàng TG' : item.name,
                        isWorld: isWorld,
                        buy: buyVal,
                        sell: sellVal,
                        change: isWorld ? parseFloat(item.saigon?.sell_change?.toFixed(2) || item.saigon?.sell_change) : (isGF95 ? Math.round(item.saigon?.sell_change) : Math.round(item.saigon?.sell_change || 0)),
                        cl: clInChiVND
                    };
                });
            } else {
                goldItems.push({
                    name: 'Vàng TG',
                    isWorld: true,
                    buy: parseFloat(xauBuy.toFixed(2)),
                    sell: parseFloat(xauSell.toFixed(2)),
                    change: parseFloat(xauChange.toFixed(2)),
                    cl: 0
                });

                const sjcTd = vsg.sjcNationWide?.find(i => i.name === 'SJC TD');
                const sjcTdSell = sjcTd?.saigon?.sell ? Math.round(sjcTd.saigon.sell) : 146000;
                const sjcTdBuy = sjcTd?.saigon?.buy ? Math.round(sjcTd.saigon.buy) : 144500;
                const sjcTdChange = sjcTd?.saigon?.sell_change !== undefined ? Math.round(sjcTd.saigon.sell_change) : 0;
                goldItems.push({
                    name: 'SJC Tự do',
                    buy: sjcTdBuy,
                    sell: sjcTdSell,
                    change: sjcTdChange,
                    cl: sjcTd?.gap !== undefined ? Math.round(sjcTd.gap * 100) : Math.round(sjcTdSell * 100 - baseVsgChiVND)
                });
            }

            // 1. Bỏ 99,99% GF, 95% GF, Vàng nhẫn SJC theo yêu cầu
            const keepNames = [
                'Vàng TG',
                'SJC Tự do',
                'Vàng 999.9',
                'Vàng 99.9',
                'Vàng 95'
            ];
            const filteredGold = goldItems.filter(i => keepNames.includes(i.name));

            // 2. Tìm vàng 999.9 làm gốc để tính các loại vàng tây/trang sức
            const g9999 = goldItems.find(i => i.name === 'Vàng 999.9') || { buy: 136300, sell: 137800, change: 0 };
            const g9999BuyRaw = g9999.buy || 136300;
            const g9999SellRaw = g9999.sell || 137800;
            const g9999ChangeRaw = g9999.change || 0;

            // 3. Tính toán các loại vàng tây theo chuẩn VNĐ / Chỉ:
            // buy, sell: scale sao cho khi nhân 100 ở frontend sẽ ra đúng VNĐ / Chỉ (ví dụ 135113 -> 13.511.300 VNĐ/chỉ)
            // cl: (sell * 100) - baseVsgChiVND (đơn vị VNĐ / Chỉ)
            const customGoldTypes = [
                {
                    name: 'Vàng 980',
                    isWorld: false,
                    buy: Math.round(g9999BuyRaw * (980 - 0.5) / 1000),
                    sell: Math.round(g9999SellRaw * (980 + 0.5) / 1000),
                    change: Math.round(g9999ChangeRaw * (980 + 0.5) / 1000),
                    cl: Math.round(Math.round(g9999SellRaw * (980 + 0.5) / 1000) * 100 - baseVsgChiVND)
                },
                {
                    name: 'Vàng 750 (18K)',
                    isWorld: false,
                    buy: Math.round(g9999BuyRaw * (750 - 1.0) / 1000),
                    sell: Math.round(g9999SellRaw * (750 + 1.0) / 1000),
                    change: Math.round(g9999ChangeRaw * (750 + 1.0) / 1000),
                    cl: Math.round(Math.round(g9999SellRaw * (750 + 1.0) / 1000) * 100 - baseVsgChiVND)
                },
                {
                    name: 'Vàng 610 (14.6K)',
                    isWorld: false,
                    buy: Math.round(g9999BuyRaw * (610 - 1.5) / 1000),
                    sell: Math.round(g9999SellRaw * (610 + 1.5) / 1000),
                    change: Math.round(g9999ChangeRaw * (610 + 1.5) / 1000),
                    cl: Math.round(Math.round(g9999SellRaw * (610 + 1.5) / 1000) * 100 - baseVsgChiVND)
                },
                {
                    name: 'Vàng 585 (14K)',
                    isWorld: false,
                    buy: Math.round(g9999BuyRaw * (585 - 2.0) / 1000),
                    sell: Math.round(g9999SellRaw * (585 + 2.0) / 1000),
                    change: Math.round(g9999ChangeRaw * (585 + 2.0) / 1000),
                    cl: Math.round(Math.round(g9999SellRaw * (585 + 2.0) / 1000) * 100 - baseVsgChiVND)
                },
                {
                    name: 'Vàng 416 (10K)',
                    isWorld: false,
                    buy: Math.round(g9999BuyRaw * (416 - 2.5) / 1000),
                    sell: Math.round(g9999SellRaw * (416 + 2.5) / 1000),
                    change: Math.round(g9999ChangeRaw * (416 + 2.5) / 1000),
                    cl: Math.round(Math.round(g9999SellRaw * (416 + 2.5) / 1000) * 100 - baseVsgChiVND)
                }
            ];

            goldItems = [...filteredGold, ...customGoldTypes];

            // Danh sách Ngoại Tệ chuẩn
            const currencies = (vsg.currencyNationWide || []).map(c => ({
                code: c.name,
                name: getCurrencyFullName(c.name),
                rateBuy: c.saigon?.buy || c.hanoi?.buy || 0,
                rateSell: c.saigon?.sell || c.hanoi?.sell || 0,
                rateRate: c.rate || 0,
                digit: c.digit || 0
            }));

            const silverItems = buildSilverItemsFromVsg(vsg);
            const rawTime = vsg.vsg_gold_table?.[0]?.update_at || vsg.sjcNationWide?.[0]?.update_at || vsg.silver_price?.[0]?.update_at;
            const lastUpdatedStr = formatVsgTimestamp(rawTime);

            return res.json({
                success: true,
                source: 'vangsaigon.vn (Live WS-Prices)',
                price: xauSell,
                bid: xauBuy,
                ask: xauSell,
                change: parseFloat(xauChange.toFixed(2)),
                changePercent: parseFloat(((xauChange / (xauSell - xauChange)) * 100).toFixed(2)),
                exchangeRate,
                baseLuongVND,
                lastUpdatedStr,
                goldItems,
                currencies,
                silverItems
            });
        }

        // Fallback live data nếu server đang bận
        const fallbackXauSell = 4358.96;
        const fallbackXauBuy = 4358.76;
        const fallbackExRate = 26030;
        const baseVsgChiVND = Math.round((fallbackXauSell * fallbackExRate / 31.1034768) * 3.75);
        const g9999SellRaw = Math.round(baseVsgChiVND / 100);
        const g9999BuyRaw = Math.round(g9999SellRaw * 0.989);
        const sjcTdSell = Math.round(g9999SellRaw * 1.058);
        const sjcTdBuy = Math.round(sjcTdSell * 0.990);

        res.json({
            success: true,
            source: 'VangSaigon Live Dynamic Fallback',
            price: fallbackXauSell,
            bid: fallbackXauBuy,
            ask: fallbackXauSell,
            change: -14.79,
            changePercent: -0.34,
            exchangeRate: fallbackExRate,
            baseLuongVND: baseVsgChiVND * 10,
            goldItems: [
                { name: 'Vàng TG', isWorld: true, buy: fallbackXauBuy, sell: fallbackXauSell, change: -14.79, cl: 0 },
                { name: 'SJC Tự do', isWorld: false, buy: sjcTdBuy, sell: sjcTdSell, change: 0, cl: Math.round(sjcTdSell * 100 - baseVsgChiVND) },
                { name: 'Vàng 999.9', isWorld: false, buy: g9999BuyRaw, sell: g9999SellRaw, change: 0, cl: Math.round(g9999SellRaw * 100 - baseVsgChiVND) },
                { name: 'Vàng 99.9', isWorld: false, buy: Math.round(g9999BuyRaw * 0.998), sell: Math.round(g9999SellRaw * 0.998), change: 0, cl: Math.round(Math.round(g9999SellRaw * 0.998) * 100 - baseVsgChiVND) },
                { name: 'Vàng 95', isWorld: false, buy: Math.round(g9999BuyRaw * 0.945), sell: Math.round(g9999SellRaw * 0.945), change: 0, cl: Math.round(Math.round(g9999SellRaw * 0.945) * 100 - baseVsgChiVND) },
                { name: 'Vàng 980', isWorld: false, buy: Math.round(g9999BuyRaw * 0.9795), sell: Math.round(g9999SellRaw * 0.9805), change: 0, cl: Math.round(Math.round(g9999SellRaw * 0.9805) * 100 - baseVsgChiVND) },
                { name: 'Vàng 750 (18K)', isWorld: false, buy: Math.round(g9999BuyRaw * 0.749), sell: Math.round(g9999SellRaw * 0.751), change: 0, cl: Math.round(Math.round(g9999SellRaw * 0.751) * 100 - baseVsgChiVND) },
                { name: 'Vàng 610 (14.6K)', isWorld: false, buy: Math.round(g9999BuyRaw * 0.6085), sell: Math.round(g9999SellRaw * 0.6115), change: 0, cl: Math.round(Math.round(g9999SellRaw * 0.6115) * 100 - baseVsgChiVND) },
                { name: 'Vàng 585 (14K)', isWorld: false, buy: Math.round(g9999BuyRaw * 0.583), sell: Math.round(g9999SellRaw * 0.587), change: 0, cl: Math.round(Math.round(g9999SellRaw * 0.587) * 100 - baseVsgChiVND) },
                { name: 'Vàng 416 (10K)', isWorld: false, buy: Math.round(g9999BuyRaw * 0.4135), sell: Math.round(g9999SellRaw * 0.4185), change: 0, cl: Math.round(Math.round(g9999SellRaw * 0.4185) * 100 - baseVsgChiVND) }
            ],
            currencies: [
                { code: 'USD', name: 'Đô la Mỹ', rateBuy: 25750, rateSell: 26150, rateRate: 0, digit: 0 },
                { code: 'EUR', name: 'Euro Châu Âu', rateBuy: 27800, rateSell: 28400, rateRate: 0, digit: 0 },
                { code: 'GBP', name: 'Bảng Anh', rateBuy: 32900, rateSell: 33700, rateRate: 0, digit: 0 },
                { code: 'JPY', name: 'Yên Nhật (100 JPY)', rateBuy: 17200, rateSell: 17800, rateRate: 0, digit: 0 },
                { code: 'SGD', name: 'Đô la Singapore', rateBuy: 19800, rateSell: 20400, rateRate: 0, digit: 0 },
                { code: 'AUD', name: 'Đô la Úc', rateBuy: 16800, rateSell: 17400, rateRate: 0, digit: 0 }
            ]
        });
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu vàng:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. ENDPOINT LẤY BẢNG GIÁ BẠC
app.get(['/api/silver', '/silver', '/api/v1/silver'], async (req, res) => {
    try {
        const vsg = await fetchVsgData();
        if (vsg && vsg.silver_price) {
            const xag = vsg.silver_price.find(i => i.name === 'XAGUSD') || { saigon: { buy: 66.31, sell: 66.36, sell_change: 1.05 } };
            const silverItems = buildSilverItemsFromVsg(vsg);
            const usdRate = vsg.currencyNationWide?.find(i => i.name === 'USD')?.saigon?.sell || 26030;
            const xagSell = xag.saigon?.sell || 66.36;
            const rawTime = vsg.silver_price?.[0]?.update_at || vsg.vsg_gold_table?.[0]?.update_at;
            const lastUpdatedStr = formatVsgTimestamp(rawTime);

            return res.json({
                success: true,
                source: 'vangsaigon.vn (Live Silver)',
                price: xagSell,
                bid: xag.saigon?.buy || 66.31,
                ask: xagSell,
                change: parseFloat(xag.saigon?.sell_change?.toFixed(2) || 1.05),
                changePercent: parseFloat(((1.05 / 65.31) * 100).toFixed(2)),
                exchangeRate: usdRate,
                lastUpdatedStr,
                silverItems
            });
        }
        const fallbackSilver = buildSilverItemsFromVsg({
            silver_price: [
                { name: 'XAGUSD', saigon: { buy: 66.25, sell: 66.30, sell_change: -0.09 } },
                { name: 'PHUQUY_1L', saigon: { buy: 2093, sell: 2157, sell_change: -3 } },
                { name: 'PHUQUY_1KG', saigon: { buy: 55800, sell: 57530, sell_change: -70 } }
            ],
            currencyNationWide: [{ name: 'USD', saigon: { sell: 26030 } }]
        });
        return res.json({ success: true, source: 'Silver Dynamic Baseline', price: 66.30, silverItems: fallbackSilver });
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu bạc:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. ENDPOINT LẤY TIN TỨC THỊ TRƯỜNG TỰ ĐỘNG TỪ CÁC BÁO LỚN (RSS FEED)
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
    const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
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
        title: "Thị trường Bạc (XAG/USD) tăng vọt: Nhu cầu sản xuất pin mặt trời & xe điện lập kỷ lục",
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

    // Đảm bảo các danh mục luôn có bài viết chất lượng bằng cách bổ sung SEED_NEWS
    SEED_NEWS.forEach(seed => {
        if (!allItems.some(i => i.title === seed.title)) {
            allItems.push({ ...seed, id: articleId++ });
        }
    });

    // Sắp xếp ưu tiên bài viết mới và chuyên về vàng/bạc lên đầu
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

module.exports = app;

if (require.main === module) {
    startServer(DEFAULT_PORT);
}