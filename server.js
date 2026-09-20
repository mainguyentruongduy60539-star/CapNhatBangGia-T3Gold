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
const CACHE_TTL_MS = 2000; // Cache 2 giây để cực kỳ nhạy và tránh quá tải

async function fetchVsgData() {
    const now = Date.now();
    if (cachedVsgData && (now - lastCacheTime) < CACHE_TTL_MS) {
        return cachedVsgData;
    }

    try {
        const res = await fetch(VSG_API, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://vangsaigon.vn',
                'Referer': 'https://vangsaigon.vn/'
            },
            signal: AbortSignal.timeout(5000)
        });

        if (res.ok) {
            const data = await res.json();
            cachedVsgData = data;
            lastCacheTime = now;
            return data;
        }
    } catch (err) {
        console.warn('⚠️ Không thể kết nối vang247, chuyển sang fallback goldprice.dev:', err.message);
    }
    return cachedVsgData;
}

function buildSilverItemsFromVsg(vsg) {
    if (!vsg || !vsg.silver_price) return [];
    
    // 1. Chỉ lấy Bạc TG, Phú Quý 1L, Phú Quý 1KG từ API (Bỏ Bạc Phú Quý 5L)
    const silverMap = {
        'XAGUSD': { name: 'Bạc Thế Giới (XAG/USD)', isWorld: true, multiplier: 1 },
        'PHUQUY_1L': { name: 'Bạc Phú Quý (1 Lượng)', isWorld: false, multiplier: 1000 },
        'PHUQUY_1KG': { name: 'Bạc Phú Quý (1 Kg)', isWorld: false, multiplier: 1000 }
    };

    const items = (vsg.silver_price || [])
        .filter(s => silverMap[s.name])
        .map(s => {
            const cfg = silverMap[s.name];
            return {
                name: cfg.name,
                isWorld: cfg.isWorld,
                buy: cfg.isWorld ? parseFloat(s.saigon?.buy?.toFixed(2) || 66.31) : Math.round((s.saigon?.buy || 0) * cfg.multiplier),
                sell: cfg.isWorld ? parseFloat(s.saigon?.sell?.toFixed(2) || 66.36) : Math.round((s.saigon?.sell || 0) * cfg.multiplier),
                change: cfg.isWorld ? parseFloat(s.saigon?.sell_change?.toFixed(2) || 1.05) : Math.round((s.saigon?.sell_change || 0) * cfg.multiplier),
                cl: 0
            };
        });

    // Tính giá bạc thế giới quy đổi ra VNĐ cho 1 chỉ (3.75g)
    const xagItem = items.find(i => i.isWorld) || { sell: 66.36, buy: 66.31, change: 1.05 };
    const usdItem = (vsg.currencyNationWide || []).find(i => i.name === 'USD');
    const exchangeRate = usdItem?.saigon?.sell || 26030;
    const worldSellVndPerChi = (xagItem.sell * exchangeRate / 31.1034768) * 3.75;
    const worldChangeVndPerChi = (xagItem.change * exchangeRate / 31.1034768) * 3.75;

    // 2. Bạc 999 thị trường: Giá bạc thế giới 1 chỉ làm tròn lên (ví dụ 208.259 -> 210, tức 210.000 VNĐ)
    const bac999Price = Math.ceil(worldSellVndPerChi / 10000) * 10000;
    items.push({
        name: 'Bạc 999 thị trường',
        isWorld: false,
        buy: bac999Price,
        sell: bac999Price,
        change: Math.round(worldChangeVndPerChi),
        cl: 0
    });

    // 3. Bạc Nữ trang: Giá bán = Giá bán thế giới + 60.000 VNĐ (60K); Giá mua = 60% của giá bán
    const bacNuTrangSell = Math.round(worldSellVndPerChi + 60000);
    const bacNuTrangBuy = Math.round(bacNuTrangSell * 0.6);
    items.push({
        name: 'Bạc Nữ trang',
        isWorld: false,
        buy: bacNuTrangBuy,
        sell: bacNuTrangSell,
        change: Math.round(worldChangeVndPerChi * 0.6),
        cl: 0
    });

    return items;
}

// 1. ENDPOINT LẤY BẢNG GIÁ VÀNG CHUẨN 100% VANGSAIGON.VN
app.get('/api/gold', async (req, res) => {
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
                    const buyVal = isWorld ? parseFloat(item.saigon?.buy?.toFixed(1) || item.saigon?.buy) : (isGF95 ? Math.round(item.saigon?.buy) : Math.round(item.saigon?.buy || 0));
                    const sellVal = isWorld ? parseFloat(item.saigon?.sell?.toFixed(1) || item.saigon?.sell) : (isGF95 ? Math.round(item.saigon?.sell) : Math.round(item.saigon?.sell || 0));
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
                    buy: parseFloat(xauBuy.toFixed(1)),
                    sell: parseFloat(xauSell.toFixed(1)),
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
                goldItems,
                currencies,
                silverItems
            });
        }

        // Fallback sang goldprice.dev
        res.json({ success: true, price: 4378.8, goldItems: [] });
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu vàng:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. ENDPOINT LẤY BẢNG GIÁ BẠC
app.get('/api/silver', async (req, res) => {
    try {
        const vsg = await fetchVsgData();
        if (vsg && vsg.silver_price) {
            const xag = vsg.silver_price.find(i => i.name === 'XAGUSD') || { saigon: { buy: 66.31, sell: 66.36, sell_change: 1.05 } };
            const silverItems = buildSilverItemsFromVsg(vsg);
            const usdRate = vsg.currencyNationWide?.find(i => i.name === 'USD')?.saigon?.sell || 26030;
            const xagSell = xag.saigon?.sell || 66.36;

            return res.json({
                success: true,
                source: 'vangsaigon.vn (Live Silver)',
                price: xagSell,
                bid: xag.saigon?.buy || 66.31,
                ask: xagSell,
                change: parseFloat(xag.saigon?.sell_change?.toFixed(2) || 1.05),
                changePercent: parseFloat(((1.05 / 65.31) * 100).toFixed(2)),
                exchangeRate: usdRate,
                silverItems
            });
        }
        res.json({ success: true, price: 66.36, silverItems: [] });
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
    const fullText = (title + ' ' + summary).toLowerCase();

    // 1. Loại bỏ các cụm từ ẩn dụ không liên quan đến kim loại quý
    const metaphors = ['khẩu vị vàng', 'thời gian vàng', 'khung giờ vàng', 'cơ hội vàng', 'thế hệ vàng', 'tấm lòng vàng', 'trái tim vàng', 'bàn thắng vàng', 'tuổi vàng', 'đất vàng', 'thẻ vàng', 'trái phiếu'];
    for (const m of metaphors) {
        if (titleLower.includes(m)) return false;
    }

    // 2. Các từ khóa cốt lõi về Vàng / Bạc
    const exactTitleTerms = [
        'vàng', 'sjc', 'doji', 'pnj', 'bảo tín', 'bạc', 'xau', 'xag', 'kim loại quý',
        'vàng nhẫn', 'vàng miếng', 'giá vàng', 'tiệm vàng', 'cây vàng', 'lượng vàng',
        'chỉ vàng', 'vàng 9999', 'vàng 24k', 'vàng 18k', 'thị trường vàng', 'đấu thầu vàng',
        'bạc thỏi', 'bạc miếng', 'giá bạc', 'thị trường bạc'
    ];

    const hasExactTitle = exactTitleTerms.some(term => titleLower.includes(term));
    if (hasExactTitle) return true;

    const strongSummaryTerms = [
        'giá vàng', 'vàng sjc', 'vàng miếng', 'vàng nhẫn', 'vàng 9999', 'vàng thế giới',
        'thị trường vàng', 'giá bạc', 'bạc thỏi', 'bạc miếng', 'kim loại quý'
    ];
    return strongSummaryTerms.some(term => fullText.includes(term));
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
    }
];

async function fetchRssNews() {
    const now = Date.now();
    if (cachedNewsData && (now - lastNewsCacheTime) < NEWS_CACHE_TTL) {
        return cachedNewsData;
    }

    let allItems = [];
    let articleId = 1;

    for (const feed of RSS_FEEDS) {
        try {
            const res = await fetch(feed.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: AbortSignal.timeout(4000)
            });

            if (res.ok) {
                const xml = await res.text();
                const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

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

                    // LỌC CHẶT CHẼ 100% CHỈ LẤY TIN VỀ VÀNG & BẠC
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

                        allItems.push({
                            id: articleId++,
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
            }
        } catch (err) {
            console.warn(`⚠️ Lỗi khi nạp RSS từ ${feed.name}:`, err.message);
        }
    }

    // Đảm bảo các danh mục luôn có bài viết chất lượng
    const currentCategories = new Set(allItems.map(i => i.category));
    SEED_NEWS.forEach(seed => {
        const count = allItems.filter(i => i.category === seed.category).length;
        if (count < 2) {
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

    cachedNewsData = allItems.slice(0, 100); // Lưu trữ đến 100 bài viết phân loại đầy đủ
    lastNewsCacheTime = now;
    return cachedNewsData;
}

app.get('/api/news', async (req, res) => {
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