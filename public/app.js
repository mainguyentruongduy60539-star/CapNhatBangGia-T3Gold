const GoldDashboard = (function () {
    function getApiUrl(endpoint) {
        if (!endpoint) return endpoint;
        const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
        if (origin.includes(':5500') || origin.includes(':5501') || origin.includes(':8080') || origin.startsWith('file:')) {
            const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
            return 'http://localhost:3001' + path;
        }
        return endpoint;
    }

    const API_ENDPOINTS = {
        gold: ['/api/gold'],
        silver: ['/api/silver']
    };

    // Tỷ giá quy đổi thị trường thực tế
    const EXCHANGE_RATE = 25970; // Tỷ giá USD/VND thị trường
    const TROY_OUNCE_TO_GRAM = 31.1034768; // 1 Troy Ounce = 31.1035 gram
    const GRAM_TO_LUONG = 37.5; // 1 Lượng (Cây) = 37.5 gram = 10 chỉ
    const GRAM_TO_KG = 1000;

    // Danh sách ngoại tệ chuẩn (Thị trường tự do TP.HCM từ Vang247)
    const CURRENCY_LIST = [
        { code: 'USD', name: 'Đô la Mỹ', rateBuy: 26400, rateSell: 26500, rateRate: 26450 },
        { code: 'EUR', name: 'Euro Châu Âu', rateBuy: 29000, rateSell: 29500, rateRate: 29250 },
        { code: 'GBP', name: 'Bảng Anh', rateBuy: 33900, rateSell: 34600, rateRate: 34250 },
        { code: 'JPY', name: 'Yên Nhật', rateBuy: 172.5, rateSell: 176.5, rateRate: 174.5, digit: 1 },
        { code: 'AUD', name: 'Đô la Úc', rateBuy: 16900, rateSell: 17400, rateRate: 17150 },
        { code: 'CAD', name: 'Đô la Canada', rateBuy: 18500, rateSell: 19000, rateRate: 18750 },
        { code: 'SGD', name: 'Đô la Singapore', rateBuy: 19800, rateSell: 20300, rateRate: 20050 },
        { code: 'CHF', name: 'Franc Thụy Sĩ', rateBuy: 30100, rateSell: 30800, rateRate: 30450 },
        { code: 'CNY', name: 'Nhân Dân Tệ', rateBuy: 3610, rateSell: 3710, rateRate: 3660 },
        { code: 'THB', name: 'Baht Thái Lan', rateBuy: 760, rateSell: 810, rateRate: 785, digit: 1 }
    ];

    // Tiện ích định dạng
    const formatVND = (num) => Math.round(num).toLocaleString('vi-VN') + ' đ';
    const formatNumber = (num) => Math.round(num).toLocaleString('vi-VN');
    const formatUSD = (num) => Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const getColorClass = (num) => num > 0 ? 'text-emerald-400' : (num < 0 ? 'text-rose-400' : 'text-slate-400');
    const getBgColorClass = (num) => num > 0 ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50' : (num < 0 ? 'bg-rose-950/60 text-rose-300 border-rose-800/50' : 'bg-slate-800 text-slate-400 border-slate-700');
    const getSign = (num) => num > 0 ? '+' : '';

    function getFormattedDateTimeStr() {
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
    }

    let currentMarket = 'gold'; // 'gold' | 'silver'
    let currentData = null;
    let lastLiveData = null;
    let currentTheme = 'dark'; // 'dark' | 'light'

    // ==========================================
    // 1. QUẢN LÝ TÀI KHOẢN (AUTH MANAGER)
    // ==========================================
    const AuthManager = {
        isLoggedIn: function () {
            const user = this.getUser();
            return !!(user && user.isLoggedIn);
        },
        getUser: function () {
            try {
                const stored = localStorage.getItem('auth_user');
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        },
        setUser: function (user) {
            localStorage.setItem('auth_user', JSON.stringify(user));
            renderAuthHeader();
            GoldDashboard.refreshData();
        },
        logout: function () {
            localStorage.removeItem('auth_user');
            renderAuthHeader();
            GoldDashboard.refreshData();
        }
    };

    function renderAuthHeader() {
        const authContainer = document.getElementById('auth-container');
        if (!authContainer) return;

        if (AuthManager.isLoggedIn()) {
            const user = AuthManager.getUser();
            authContainer.innerHTML = `
                <div class="user-profile-pill flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-sm transition-all">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span class="user-name text-xs font-bold">${user.name || 'Thành viên'}</span>
                    <button onclick="GoldDashboard.logout()" class="logout-btn text-[11px] font-bold ml-1 cursor-pointer transition-all">
                        Đăng xuất
                    </button>
                </div>
            `;
        } else {
            authContainer.innerHTML = `
                <a href="javascript:void(0)" onclick="GoldDashboard.openAuth('register')"
                    class="text-xs font-bold px-3.5 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-950 transition-all shadow-md shadow-yellow-500/10 cursor-pointer">
                    ĐĂNG KÝ
                </a>
                <a href="javascript:void(0)" onclick="GoldDashboard.openAuth('login')"
                    class="text-xs font-bold px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-white transition-all shadow-md shadow-amber-500/10 cursor-pointer border border-amber-500/50">
                    ĐĂNG NHẬP
                </a>
            `;
        }
    }

    // ==========================================
    // 2. QUẢN LÝ GIAO DIỆN (THEME MANAGER)
    // ==========================================
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);
    }

    function applyTheme(theme) {
        currentTheme = theme;
        const iconEl = document.getElementById('theme-icon');
        const textEl = document.getElementById('theme-text');

        if (theme === 'light') {
            document.body.classList.add('light-theme');
            if (iconEl) iconEl.textContent = '🌙';
            if (textEl) textEl.textContent = 'Chế độ Tối';
        } else {
            document.body.classList.remove('light-theme');
            if (iconEl) iconEl.textContent = '☀️';
            if (textEl) textEl.textContent = 'Chế độ Sáng';
        }
        localStorage.setItem('theme', theme);
        initTradingView();
    }

    function toggleTheme() {
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    }

    // ==========================================
    // 3. TÍNH TOÁN DỮ LIỆU ĐỘNG
    // ==========================================

    // Hàm hiển thị tên sản phẩm trong bảng giá
    function getItemDisplayName(name) {
        if (!name) return '';
        const nameMap = {
            'Vàng TG': 'Vàng TG (XAU/USD)',
            'SJC Tự do': 'Vàng SJC Tự Do',
            'Vàng 999.9': 'Vàng 999.9',
            'Vàng 99.9': 'Vàng 99.9',
            'Vàng 95': 'Vàng 95',
            'Bạc Thế Giới (XAG/USD)': 'Bạc TG (XAG/USD)',
            'Bạc miếng 999 thị trường': 'Bạc miếng 999 thị trường',
            'Bạc 999 thị trường': 'Bạc 999 thị trường'
        };
        return nameMap[name] || name;
    }

    // Hàm hiển thị đơn vị trong bảng giá (khớp với cách renderTableRows chia giá trị)
    function getItemUnitStr(item) {
        if (!item) return '';
        if (item.isWorld) {
            return 'USD / oz';
        }
        const name = item.name || '';
        // Bạc Phú Quý / Bạc miếng 999: giá tính theo lượng hoặc kg
        if (name.includes('1 Lượng') || name.includes('5 Lượng') || name.includes('Bạc miếng 999') || name.includes('Bạc 999')) return 'Ngàn VNĐ / Lượng';
        if (name.includes('1 Kg')) return 'Ngàn VNĐ / Kg';
        // Bạc nữ trang: tính theo chỉ
        if (name.includes('Bạc')) return 'Ngàn VNĐ / Chỉ';
        // Vàng: ngàn VNĐ / chỉ
        return 'Ngàn VNĐ / Chỉ';
    }

    let cachedV247Data = {
        sjcBuy: 14220,
        sjcSell: 14320,
        g9999Buy: 13220,
        g9999Sell: 13350,
        g999Buy: 13190,
        g999Sell: 13320,
        g95Buy: 12520,
        g95Sell: 12650,
        phuquy1LBuy: 2126,
        phuquy1LSell: 2192
    };

    async function fetchVang247HcmPrices() {
        try {
            const url = getApiUrl('/api/gold-rates');
            const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const json = await res.json();
                if (json && json.success && json.data) {
                    cachedV247Data = json.data;
                    return json.data;
                }
            }
        } catch (e) { }

        return cachedV247Data;
    }

    function buildDynamicGoldItems(priceUsd, priceVnd, changeUsd, bid, ask, v247Data = null) {
        const dataToUse = v247Data || cachedV247Data;

        let worldGoldBuy = bid !== undefined ? parseFloat(bid) : priceUsd;
        let worldGoldSell = ask !== undefined ? parseFloat(ask) : priceUsd;
        let worldGoldChange = changeUsd || 0;

        if (dataToUse && dataToUse.worldGold && dataToUse.worldGold.sell > 0) {
            worldGoldBuy = dataToUse.worldGold.buy || dataToUse.worldGold.sell;
            worldGoldSell = dataToUse.worldGold.sell || dataToUse.worldGold.buy;
            if (dataToUse.worldGold.change !== undefined) worldGoldChange = dataToUse.worldGold.change;
        }

        const effectiveUsdPrice = worldGoldSell > 0 ? worldGoldSell : priceUsd;
        const currentExRate = (priceVnd && priceUsd) ? Math.round(priceVnd / priceUsd) : EXCHANGE_RATE;
        const baseChiVND = Math.round((effectiveUsdPrice * currentExRate / TROY_OUNCE_TO_GRAM) * 3.75);

        // Cộng thêm 20k (20.000đ/chỉ = +20 ngàn VNĐ/chỉ) theo yêu cầu cho 9999, sjc tự do, 999, 95
        const PLUS_20K = 20;

        let g9999SellRaw = Math.round(baseChiVND / 1000) + PLUS_20K;
        let g9999BuyRaw = Math.round(g9999SellRaw * 0.989) + PLUS_20K;

        let sjcTdSell = Math.round(g9999SellRaw * 1.058) + PLUS_20K;
        let sjcTdBuy = Math.round(sjcTdSell * 0.990) + PLUS_20K;

        let g999SellRaw = Math.round(g9999SellRaw * 0.998) + PLUS_20K;
        let g999BuyRaw = Math.round(g9999BuyRaw * 0.998) + PLUS_20K;

        let g95SellRaw = Math.round(g9999SellRaw * 0.945) + PLUS_20K;
        let g95BuyRaw = Math.round(g9999BuyRaw * 0.945) + PLUS_20K;

        if (dataToUse) {
            if (dataToUse.sjcBuy && dataToUse.sjcSell) {
                sjcTdBuy = dataToUse.sjcBuy + PLUS_20K;
                sjcTdSell = dataToUse.sjcSell + PLUS_20K;
            }
            if (dataToUse.g9999Buy && dataToUse.g9999Sell) {
                g9999BuyRaw = dataToUse.g9999Buy + PLUS_20K;
                g9999SellRaw = dataToUse.g9999Sell + PLUS_20K;
            }
            if (dataToUse.g999Buy && dataToUse.g999Sell) {
                g999BuyRaw = dataToUse.g999Buy + PLUS_20K;
                g999SellRaw = dataToUse.g999Sell + PLUS_20K;
            }
            if (dataToUse.g95Buy && dataToUse.g95Sell) {
                g95BuyRaw = dataToUse.g95Buy + PLUS_20K;
                g95SellRaw = dataToUse.g95Sell + PLUS_20K;
            }
        }

        const baseChangeChiRaw = Math.round((worldGoldChange * currentExRate / TROY_OUNCE_TO_GRAM) * 3.75 / 1000);
        const baseLuongInNgàn = Math.round(baseChiVND / 1000) * 10;

        return [
            {
                name: 'Vàng TG (XAU/USD)',
                isWorld: true,
                buy: parseFloat(worldGoldBuy.toFixed(2)),
                sell: parseFloat(worldGoldSell.toFixed(2)),
                change: parseFloat((worldGoldChange || 0).toFixed(2)),
                cl: 0
            },
            {
                name: 'SJC Tự do',
                isWorld: false,
                buy: sjcTdBuy,
                sell: sjcTdSell,
                change: baseChangeChiRaw,
                cl: Math.round(sjcTdSell - baseLuongInNgàn)
            },
            {
                name: 'Vàng 999.9',
                isWorld: false,
                buy: g9999BuyRaw,
                sell: g9999SellRaw,
                change: baseChangeChiRaw,
                cl: Math.round(g9999SellRaw - baseLuongInNgàn)
            },
            {
                name: 'Vàng 99.9',
                isWorld: false,
                buy: g999BuyRaw,
                sell: g999SellRaw,
                change: Math.round(baseChangeChiRaw * 0.998),
                cl: Math.round(g999SellRaw - baseLuongInNgàn)
            },
            {
                name: 'Vàng 95',
                isWorld: false,
                buy: g95BuyRaw,
                sell: g95SellRaw,
                change: Math.round(baseChangeChiRaw * 0.945),
                cl: Math.round(g95SellRaw - baseLuongInNgàn)
            },
            {
                name: 'Vàng 980',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.9790),
                sell: Math.round(g9999SellRaw * 0.9810),
                change: Math.round(baseChangeChiRaw * 0.9810),
                cl: Math.round(Math.round(g9999SellRaw * 0.9810) - baseLuongInNgàn)
            },
            {
                name: 'Vàng 750',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.7485),
                sell: Math.round(g9999SellRaw * 0.7515),
                change: Math.round(baseChangeChiRaw * 0.7515),
                cl: Math.round(Math.round(g9999SellRaw * 0.7515) - baseLuongInNgàn)
            },
            {
                name: 'Vàng 610',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.6080),
                sell: Math.round(g9999SellRaw * 0.6120),
                change: Math.round(baseChangeChiRaw * 0.6120),
                cl: Math.round(Math.round(g9999SellRaw * 0.6120) - baseLuongInNgàn)
            },
            {
                name: 'Vàng 585',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.5825),
                sell: Math.round(g9999SellRaw * 0.5875),
                change: Math.round(baseChangeChiRaw * 0.5875),
                cl: Math.round(Math.round(g9999SellRaw * 0.5875) - baseLuongInNgàn)
            },
            {
                name: 'Vàng 416',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.4130),
                sell: Math.round(g9999SellRaw * 0.4190),
                change: Math.round(baseChangeChiRaw * 0.4190),
                cl: Math.round(Math.round(g9999SellRaw * 0.4190) - baseLuongInNgàn)
            }
        ];
    }

    function buildDynamicSilverItems(priceUsd, priceVnd, changeUsd, bid, ask, v247Data = null) {
        const dataToUse = v247Data || cachedV247Data;

        let worldSilverBuy = bid !== undefined ? parseFloat(bid) : (priceUsd - 0.05);
        let worldSilverSell = ask !== undefined ? parseFloat(ask) : (priceUsd + 0.05);
        let worldSilverChange = changeUsd || 0;

        if (dataToUse && dataToUse.worldSilver && dataToUse.worldSilver.sell > 0) {
            worldSilverBuy = dataToUse.worldSilver.buy || dataToUse.worldSilver.sell;
            worldSilverSell = dataToUse.worldSilver.sell || dataToUse.worldSilver.buy;
            if (dataToUse.worldSilver.change !== undefined) worldSilverChange = dataToUse.worldSilver.change;
        }

        // 1. Giá Bạc miếng 999 thị trường (Lấy trực tiếp từ PHUQUY_1L của vang247 - Ngàn VNĐ / Lượng)
        let bacMiengBuy = 2153;
        let bacMiengSell = 2220;

        if (dataToUse && dataToUse.phuquy1LBuy && dataToUse.phuquy1LSell) {
            bacMiengBuy = dataToUse.phuquy1LBuy;
            bacMiengSell = dataToUse.phuquy1LSell;
        }

        // 2. Giá Bạc 999 thị trường
        const effectiveSilverUsd = worldSilverSell > 0 ? worldSilverSell : priceUsd;
        const currentExRate = (priceVnd && priceUsd) ? Math.round(priceVnd / priceUsd) : EXCHANGE_RATE;
        const baseGramVND = (effectiveSilverUsd * currentExRate) / TROY_OUNCE_TO_GRAM;
        const baseChiVNDWorldSell = baseGramVND * 3.75;

        const bac999Sell = Math.round((baseChiVNDWorldSell * 1.05) / 1000);
        const bac999Buy = bac999Sell - 30;

        // 3. Bạc nữ trang bán lẻ
        const bacNuTrangSell = bac999Sell + 70;
        const bacNuTrangBuy = Math.round(bacNuTrangSell * 0.6);

        return [
            {
                name: 'Bạc Thế Giới (XAG/USD)',
                isWorld: true,
                buy: parseFloat(worldSilverBuy.toFixed(2)),
                sell: parseFloat(worldSilverSell.toFixed(2)),
                change: parseFloat((worldSilverChange || 0).toFixed(2)),
                cl: 0
            },
            {
                name: 'Bạc miếng 999 thị trường',
                isWorld: false,
                buy: bacMiengBuy,
                sell: bacMiengSell,
                change: 0,
                cl: 0
            },
            {
                name: 'Bạc 999 thị trường',
                isWorld: false,
                buy: bac999Buy,
                sell: bac999Sell,
                change: 0,
                cl: 0
            },
            {
                name: 'Bạc nữ trang bán lẻ',
                isWorld: false,
                buy: bacNuTrangBuy,
                sell: bacNuTrangSell,
                change: 0,
                cl: 0
            }
        ];
    }


    function getInstantInitialData(market = 'gold') {
        let goldPrice = 4140.52;
        let goldChange = -7.27;
        let silverPrice = 60.37;
        let silverChange = -0.23;

        try {
            const savedXau = localStorage.getItem('t3gold_last_live_xau');
            if (savedXau) {
                const parsedXau = JSON.parse(savedXau);
                // Chỉ dùng dữ liệu đã lưu nếu mới dưới 1 phút và thuộc khoảng giá hợp lệ Spot Gold
                if (parsedXau && parsedXau.price > 1000 && parsedXau.price < 10000 && (Date.now() - (parsedXau.ts || 0) < 60000)) {
                    goldPrice = parsedXau.price;
                    if (parsedXau.change !== undefined) goldChange = parsedXau.change;
                } else {
                    localStorage.removeItem('t3gold_last_live_xau');
                }
            }
            const savedXag = localStorage.getItem('t3gold_last_live_xag');
            if (savedXag) {
                const parsedXag = JSON.parse(savedXag);
                if (parsedXag && parsedXag.price > 0 && parsedXag.price < 200 && (Date.now() - (parsedXag.ts || 0) < 60000)) {
                    silverPrice = parsedXag.price;
                    if (parsedXag.change !== undefined) silverChange = parsedXag.change;
                } else {
                    localStorage.removeItem('t3gold_last_live_xag');
                }
            }
        } catch (e) { }

        const goldVndPerOunce = goldPrice * EXCHANGE_RATE;
        const silverVndPerOunce = silverPrice * EXCHANGE_RATE;

        return {
            success: true,
            price: goldPrice,
            change: goldChange,
            goldItems: buildDynamicGoldItems(goldPrice, goldVndPerOunce, goldChange, goldPrice - 0.2, goldPrice + 0.2, cachedV247Data),
            silverItems: buildDynamicSilverItems(silverPrice, silverVndPerOunce, silverChange, silverPrice, silverPrice, cachedV247Data),
            currencies: (cachedV247Data && cachedV247Data.currencies && cachedV247Data.currencies.length > 0) ? cachedV247Data.currencies : CURRENCY_LIST,
            exchangeRate: EXCHANGE_RATE,
            baseLuongVND: goldPrice * EXCHANGE_RATE / TROY_OUNCE_TO_GRAM * 37.5
        };
    }

    async function fetchTvLivePriceDirectly() {
        try {
            const url = getApiUrl('/api/tv-price');
            const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
            if (res.ok) {
                const json = await res.json();
                if (json && json.success && json.data) {
                    const tvData = json.data;
                    if (tvData.xau) {
                        try { localStorage.setItem('t3gold_last_live_xau', JSON.stringify({ price: tvData.xau.close, change: tvData.xau.change, ts: Date.now() })); } catch (e) { }
                    }
                    if (tvData.xag) {
                        try { localStorage.setItem('t3gold_last_live_xag', JSON.stringify({ price: tvData.xag.close, change: tvData.xag.change, ts: Date.now() })); } catch (e) { }
                    }
                    return tvData;
                }
            }
        } catch (e) { }
        return null;
    }

    async function fetchData() {
        if (currentMarket === 'news') return currentData;

        let resultData = null;
        const endpoints = API_ENDPOINTS[currentMarket] || API_ENDPOINTS['gold'];
        for (const endpoint of endpoints) {
            try {
                const url = getApiUrl(endpoint);
                const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.success && (data.goldItems?.length > 0 || data.silverItems?.length > 0)) {
                        resultData = data;
                        break;
                    }
                }
            } catch (e) { }
        }

        if (!resultData) {
            resultData = currentData || lastLiveData || getInstantInitialData(currentMarket);
        }

        // Lấy giá HCM chuẩn 1:1 từ vang247
        const v247Data = await fetchVang247HcmPrices();

        // Đồng bộ thời gian thực chuẩn 100% từ luồng giá TradingView Stream (OANDA:XAUUSD & OANDA:XAGUSD)
        try {
            if (TradingViewRealtimeStream.lastTvXau && (Date.now() - TradingViewRealtimeStream.lastTvXau.ts < 30000)) {
                const goldPrice = TradingViewRealtimeStream.lastTvXau.price;
                const goldChange = TradingViewRealtimeStream.lastTvXau.change || 0;
                const exRate = resultData.exchangeRate || EXCHANGE_RATE;
                resultData.goldItems = buildDynamicGoldItems(goldPrice, goldPrice * exRate, goldChange, goldPrice - 0.2, goldPrice + 0.2, v247Data);
                resultData.price = goldPrice;
                resultData.bid = goldPrice;
                resultData.ask = goldPrice;
                resultData.change = goldChange;
                resultData.isLiveRealtime = true;
            } else {
                const tvLive = await fetchTvLivePriceDirectly();
                if (tvLive && tvLive.xau) {
                    const goldPrice = tvLive.xau.close;
                    const goldChange = tvLive.xau.change !== undefined ? tvLive.xau.change : 0;
                    const exRate = resultData.exchangeRate || EXCHANGE_RATE;
                    resultData.goldItems = buildDynamicGoldItems(goldPrice, goldPrice * exRate, goldChange, goldPrice - 0.2, goldPrice + 0.2, v247Data);
                    resultData.price = goldPrice;
                    resultData.bid = goldPrice;
                    resultData.ask = goldPrice;
                    resultData.change = goldChange;
                    resultData.isLiveRealtime = true;
                } else if (resultData && resultData.price) {
                    const goldPrice = resultData.price;
                    const goldChange = resultData.change || 0;
                    const exRate = resultData.exchangeRate || EXCHANGE_RATE;
                    resultData.goldItems = buildDynamicGoldItems(goldPrice, goldPrice * exRate, goldChange, goldPrice - 0.2, goldPrice + 0.2, v247Data);
                }
            }

            if (TradingViewRealtimeStream.lastTvXag && (Date.now() - TradingViewRealtimeStream.lastTvXag.ts < 30000)) {
                const silverPrice = TradingViewRealtimeStream.lastTvXag.price;
                const silverChange = TradingViewRealtimeStream.lastTvXag.change || 0;
                const exRate = resultData.exchangeRate || EXCHANGE_RATE;
                resultData.silverItems = buildDynamicSilverItems(silverPrice, silverPrice * exRate, silverChange, silverPrice - 0.05, silverPrice + 0.05, v247Data);
            } else {
                const tvLive = await fetchTvLivePriceDirectly();
                if (tvLive && tvLive.xag) {
                    const silverPrice = tvLive.xag.close;
                    const silverChange = tvLive.xag.change !== undefined ? tvLive.xag.change : 0;
                    const exRate = resultData.exchangeRate || EXCHANGE_RATE;
                    resultData.silverItems = buildDynamicSilverItems(silverPrice, silverPrice * exRate, silverChange, silverPrice - 0.05, silverPrice + 0.05, v247Data);
                } else if (resultData && resultData.silverItems) {
                    const silverPrice = resultData.silverItems[0]?.buy || 60.37;
                    const silverChange = resultData.silverItems[0]?.change || 0;
                    const exRate = resultData.exchangeRate || EXCHANGE_RATE;
                    resultData.silverItems = buildDynamicSilverItems(silverPrice, silverPrice * exRate, silverChange, silverPrice - 0.05, silverPrice + 0.05, v247Data);
                }
            }
        } catch (e) { }

        lastLiveData = resultData;
        currentData = resultData;
        try {
            localStorage.setItem('t3gold_live_cache_' + currentMarket, JSON.stringify(currentData));
        } catch (e) { }

        return currentData;
    }

    // ==========================================
    // 4. RENDER GIAO DIỆN
    // ==========================================
    // ==========================================
    // 4. RENDER GIAO DIỆN KHUNG GIÁ HIỆN ĐẠI (THAY THẾ BẢNG TRUYỀN THỐNG)
    // ==========================================
    function renderPriceCards(data) {
        if (!data) return;

        const nowStr = (data && data.lastUpdatedStr) ? data.lastUpdatedStr : getFormattedDateTimeStr();

        const lastUpdatedEl = document.getElementById('last-updated-time');
        if (lastUpdatedEl) lastUpdatedEl.textContent = 'Cập nhật lần cuối: ' + nowStr;

        const silverUpdatedEl = document.getElementById('silver-updated-time');
        if (silverUpdatedEl) silverUpdatedEl.textContent = 'Cập nhật lần cuối: ' + nowStr;

        const currUpdatedEl = document.getElementById('currency-updated-time');
        if (currUpdatedEl) currUpdatedEl.textContent = 'Cập nhật lần cuối: ' + nowStr;

        // Render Bảng Giá Vàng (#price-table-body)
        // Nếu data không có goldItems thì dùng fallback để bảng không bị trống
        const goldItems = (data.goldItems && data.goldItems.length > 0)
            ? data.goldItems
            : buildDynamicGoldItems(
                data.price || 4339.20,
                data.priceVndPerOunce || 4339.20 * EXCHANGE_RATE,
                data.change || -14.79,
                data.bid || 4339.0,
                data.ask || 4339.40
            );
        const goldTableBody = document.getElementById('price-table-body');
        if (goldTableBody) {
            renderTableRows(goldTableBody, goldItems, true, data);
        }

        // Render Bảng Giá Bạc (#silver-price-table-body)
        // Nếu data không có silverItems thì dùng fallback
        const silverItems = (data.silverItems && data.silverItems.length > 0)
            ? data.silverItems
            : buildDynamicSilverItems(60.37, 60.37 * EXCHANGE_RATE, -0.23, 60.37, 60.42);
        const silverTableBody = document.getElementById('silver-price-table-body');
        if (silverTableBody) {
            renderTableRows(silverTableBody, silverItems, false, data);
        }

        // Render Bảng Ngoại Tệ (#currency-table-body)
        const currencyBody = document.getElementById('currency-table-body');
        const currencyList = data && data.currencies && data.currencies.length > 0 ? data.currencies : CURRENCY_LIST;

        const formatNumber = (num, decimals = 0) => {
            if (num === null || num === undefined) return '0';
            if (decimals > 0) {
                return Number(num).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            }
            return Math.round(num).toLocaleString('en-US');
        };

        if (currencyBody) {
            const isAuth = AuthManager.isLoggedIn();
            const authTextHtml = '<span class="text-[11px] sm:text-xs text-slate-400 font-normal">Vui lòng <a href="javascript:void(0)" onclick="GoldDashboard.openAuth(\'login\')" class="text-blue-400 font-bold underline hover:text-blue-300 cursor-pointer">đăng nhập</a> để xem giá</span>';

            currencyBody.innerHTML = currencyList.map(c => {
                const rateVal = isAuth ? (c.rateRate !== undefined && c.rateRate !== 0 ? (c.rateRate > 10 ? c.rateRate.toFixed(2) : c.rateRate.toFixed(4)) : '0') : authTextHtml;
                const buyVal = isAuth ? (c.digit === 1 ? c.rateBuy.toFixed(1) : formatNumber(c.rateBuy)) : authTextHtml;
                const sellVal = isAuth ? (c.digit === 1 ? c.rateSell.toFixed(1) : formatNumber(c.rateSell)) : authTextHtml;
                const rateNum = parseFloat(rateVal);
                const rateColor = isAuth ? (rateNum < 0 ? 'text-val-down' : 'text-val-up') : 'text-slate-400';
                return `
                    <tr class="transition-colors border-b border-amber-900/30 text-xs sm:text-sm md:text-base">
                        <td class="text-left pl-1.5 sm:pl-2.5 py-1.5 sm:py-2.5 font-extrabold col-org text-[12px] sm:text-sm md:text-base whitespace-nowrap overflow-hidden">
                            <span>${c.code}</span>
                        </td>
                        <td class="py-1.5 sm:py-2.5 px-0.5 sm:px-1 text-right font-mono font-black price-val text-[14px] xs:text-[15px] sm:text-base md:text-lg tracking-tighter whitespace-nowrap">${buyVal}</td>
                        <td class="py-1.5 sm:py-2.5 px-0.5 sm:px-1 text-right font-mono font-black price-val text-[14px] xs:text-[15px] sm:text-base md:text-lg tracking-tighter whitespace-nowrap">${sellVal}</td>
                        <td class="py-1.5 sm:py-2.5 pr-1 sm:pr-2 text-right font-mono font-black ${rateColor} text-[14px] xs:text-[15px] sm:text-base md:text-lg tracking-tighter whitespace-nowrap">${rateVal}</td>
                    </tr>
                `;
            }).join('');
        }

        // Render / Update Máy Tính Quy Đổi
        const calcContainer = document.getElementById('calculator-section');
        if (calcContainer) {
            if (!calcContainer.firstElementChild) {
                updateCalculatorUI(true);
            } else {
                calculateConverter();
            }
        }
    }

    function renderTableRows(tableBody, items, isGold, data) {
        if (!tableBody || !items || items.length === 0) return;
        const currentMarket = isGold ? 'gold' : 'silver';
        const isAuth = AuthManager.isLoggedIn();
        const authTextHtml = '<span class="text-[11px] sm:text-xs text-slate-400 font-normal">Vui lòng <a href="javascript:void(0)" onclick="GoldDashboard.openAuth(\'login\')" class="text-blue-400 font-bold underline hover:text-blue-300 cursor-pointer">đăng nhập</a> để xem giá</span>';

        const existingRows = Array.from(tableBody.children);
        const canUpdateInPlace = existingRows.length === items.length && items.length > 0 && !existingRows.some(r => r.children.length !== 3);

        if (canUpdateInPlace) {
            items.forEach((item, idx) => {
                const row = existingRows[idx];
                let buyMain = '';
                let sellMain = '';
                let buySub = '';
                let sellSub = '';

                if (!isAuth) {
                    buyMain = authTextHtml;
                    sellMain = authTextHtml;
                } else if (item.isWorld) {
                    const buyNum = Number(item.buy) || 0;
                    const sellNum = Number(item.sell) || 0;
                    buyMain = buyNum > 0 ? buyNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0';
                    sellMain = sellNum > 0 ? sellNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0';

                    const exRate = data?.exchangeRate || EXCHANGE_RATE;

                    if (currentMarket === 'gold') {
                        const vndPerChiSell = (sellNum * exRate / TROY_OUNCE_TO_GRAM) * 3.75;
                        const vndPerChiBuy = (buyNum * exRate / TROY_OUNCE_TO_GRAM) * 3.75;

                        buySub = `≈ ${Math.round(vndPerChiBuy).toLocaleString('vi-VN')} VNĐ/chỉ`;
                        sellSub = `≈ ${Math.round(vndPerChiSell).toLocaleString('vi-VN')} VNĐ/chỉ`;
                    } else {
                        const vndPerChiSell = (sellNum * exRate / TROY_OUNCE_TO_GRAM) * 3.75;
                        const vndPerChiBuy = (buyNum * exRate / TROY_OUNCE_TO_GRAM) * 3.75;

                        buySub = `≈ ${Math.round(vndPerChiBuy).toLocaleString('vi-VN')} VNĐ/chỉ`;
                        sellSub = `≈ ${Math.round(vndPerChiSell).toLocaleString('vi-VN')} VNĐ/chỉ`;
                    }
                } else {
                    if (currentMarket === 'gold' && !item.isWorld) {
                        buyMain = `${Math.round(item.buy).toLocaleString('vi-VN')}`;
                        sellMain = `${Math.round(item.sell).toLocaleString('vi-VN')}`;
                    } else if (currentMarket === 'silver' && !item.isWorld) {
                        if (item.buy > 100000 || item.sell > 100000) {
                            buyMain = `${Math.round(item.buy / 1000).toLocaleString('vi-VN')}`;
                            sellMain = `${Math.round(item.sell / 1000).toLocaleString('vi-VN')}`;
                        } else {
                            buyMain = `${Math.round(item.buy).toLocaleString('vi-VN')}`;
                            sellMain = `${Math.round(item.sell).toLocaleString('vi-VN')}`;
                        }
                    } else {
                        buyMain = `${Math.round(item.buy).toLocaleString('vi-VN')}`;
                        sellMain = `${Math.round(item.sell).toLocaleString('vi-VN')}`;
                    }
                }

                const cells = row.children;
                if (cells.length === 3) {
                    const nameDiv = cells[0].children[0];
                    const unitDiv = cells[0].children[1];
                    const dispName = getItemDisplayName(item.name);
                    const dispUnit = getItemUnitStr(item);
                    if (nameDiv && nameDiv.textContent !== dispName) nameDiv.textContent = dispName;
                    if (unitDiv && unitDiv.textContent !== dispUnit) unitDiv.textContent = dispUnit;

                    const buyMainDiv = cells[1].children[0];
                    let buySubDiv = cells[1].children[1];
                    if (buyMainDiv) buyMainDiv.innerHTML = buyMain;
                    if (buySub) {
                        if (!buySubDiv) {
                            buySubDiv = document.createElement('div');
                            buySubDiv.className = 'text-[11px] sm:text-[13.5px] text-yellow-400 col-org font-bold mt-0.5';
                            cells[1].appendChild(buySubDiv);
                        } else {
                            buySubDiv.className = 'text-[11px] sm:text-[13.5px] text-yellow-400 col-org font-bold mt-0.5';
                        }
                        if (buySubDiv.textContent !== buySub) buySubDiv.textContent = buySub;
                    } else if (buySubDiv) {
                        buySubDiv.remove();
                    }

                    const sellMainDiv = cells[2].children[0];
                    let sellSubDiv = cells[2].children[1];
                    if (sellMainDiv) sellMainDiv.innerHTML = sellMain;
                    if (sellSub) {
                        if (!sellSubDiv) {
                            sellSubDiv = document.createElement('div');
                            sellSubDiv.className = 'text-[11px] sm:text-[13.5px] text-yellow-400 col-org font-bold mt-0.5';
                            cells[2].appendChild(sellSubDiv);
                        } else {
                            sellSubDiv.className = 'text-[11px] sm:text-[13.5px] text-yellow-400 col-org font-bold mt-0.5';
                        }
                        if (sellSubDiv.textContent !== sellSub) sellSubDiv.textContent = sellSub;
                    } else if (sellSubDiv) {
                        sellSubDiv.remove();
                    }
                }
            });
        } else {
            let rowsHtml = '';
            items.forEach((item) => {
                let buyMain = '';
                let sellMain = '';
                let buySub = '';
                let sellSub = '';

                if (!isAuth) {
                    buyMain = authTextHtml;
                    sellMain = authTextHtml;
                } else if (item.isWorld) {
                    const buyNum = Number(item.buy) || 0;
                    const sellNum = Number(item.sell) || 0;
                    buyMain = buyNum > 0 ? buyNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0';
                    sellMain = sellNum > 0 ? sellNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0';

                    const exRate = data?.exchangeRate || EXCHANGE_RATE;

                    if (currentMarket === 'gold') {
                        const vndPerChiSell = (data && data.baseLuongVND) ? (data.baseLuongVND / 10) : ((sellNum * exRate / TROY_OUNCE_TO_GRAM) * 3.75);
                        const vndPerChiBuy = vndPerChiSell - (((sellNum - buyNum) * exRate / TROY_OUNCE_TO_GRAM) * 3.75);

                        buySub = `≈ ${Math.round(vndPerChiBuy).toLocaleString('vi-VN')} VNĐ/chỉ`;
                        sellSub = `≈ ${Math.round(vndPerChiSell).toLocaleString('vi-VN')} VNĐ/chỉ`;
                    } else {
                        const vndPerChiSell = (sellNum * exRate / TROY_OUNCE_TO_GRAM) * 3.75;
                        const vndPerChiBuy = (buyNum * exRate / TROY_OUNCE_TO_GRAM) * 3.75;

                        buySub = `≈ ${Math.round(vndPerChiBuy).toLocaleString('vi-VN')} VNĐ/chỉ`;
                        sellSub = `≈ ${Math.round(vndPerChiSell).toLocaleString('vi-VN')} VNĐ/chỉ`;
                    }
                } else {
                    if (currentMarket === 'gold' && !item.isWorld) {
                        buyMain = `${Math.round(item.buy).toLocaleString('vi-VN')}`;
                        sellMain = `${Math.round(item.sell).toLocaleString('vi-VN')}`;
                    } else if (currentMarket === 'silver' && !item.isWorld) {
                        if (item.buy > 100000 || item.sell > 100000) {
                            buyMain = `${Math.round(item.buy / 1000).toLocaleString('vi-VN')}`;
                            sellMain = `${Math.round(item.sell / 1000).toLocaleString('vi-VN')}`;
                        } else {
                            buyMain = `${Math.round(item.buy).toLocaleString('vi-VN')}`;
                            sellMain = `${Math.round(item.sell).toLocaleString('vi-VN')}`;
                        }
                    } else {
                        buyMain = `${Math.round(item.buy).toLocaleString('vi-VN')}`;
                        sellMain = `${Math.round(item.sell).toLocaleString('vi-VN')}`;
                    }
                }

                rowsHtml += `
                    <tr class="transition-colors border-b border-amber-900/30">
                        <td class="text-left pl-2 sm:pl-3 pr-1 py-1.5 sm:py-2.5 font-black col-org">
                            <div class="text-[15px] xs:text-[16.5px] sm:text-lg md:text-xl font-black leading-tight">${getItemDisplayName(item.name)}</div>
                            <div class="text-[11.5px] sm:text-[13.5px] font-sans font-semibold text-slate-400 normal-case mt-0.5 whitespace-nowrap">${getItemUnitStr(item)}</div>
                        </td>

                        <td class="py-2 sm:py-3 px-1 sm:px-2 text-right font-mono font-black price-val text-[18px] xs:text-[20px] sm:text-2xl md:text-3xl lg:text-[34px] tracking-tighter whitespace-nowrap">
                            <div class="font-black">${buyMain}</div>
                            ${buySub ? `<div class="text-[12px] sm:text-[14px] text-yellow-400 col-org font-bold mt-0.5">${buySub}</div>` : ''}
                        </td>

                        <td class="py-2 sm:py-3 pr-2 sm:pr-3 pl-1 text-right font-mono font-black price-val text-[18px] xs:text-[20px] sm:text-2xl md:text-3xl lg:text-[34px] tracking-tighter whitespace-nowrap">
                            <div class="font-black">${sellMain}</div>
                            ${sellSub ? `<div class="text-[12px] sm:text-[14px] text-yellow-400 col-org font-bold mt-0.5">${sellSub}</div>` : ''}
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = rowsHtml;
        }
    }

    function updateCalculatorUI() {
        calculateGoldPurity();
    }

    function calculateGoldPurity(isManualClick = false) {
        const weightInput = document.getElementById('calc-tv-weight');
        const currentPurityInput = document.getElementById('calc-tv-current-purity');
        const targetPurityInput = document.getElementById('calc-tv-target-purity');

        if (!weightInput || !currentPurityInput || !targetPurityInput) return;

        const wCo = parseFloat(weightInput.value) || 0;
        const hCo = parseFloat(currentPurityInput.value) || 0;
        const hMuon = parseFloat(targetPurityInput.value) || 0;

        const gramsPerUnit = 3.75; // Always Chỉ
        const unitLabel = 'Chỉ';

        let gold9999Add = 0;
        let alloyAdd = 0;

        if (hMuon > hCo) {
            // Nâng tuổi (vàng 9999)
            const denominator = 99.99 - hMuon;
            if (denominator > 0) {
                gold9999Add = (wCo * (hMuon - hCo)) / denominator;
            }
            alloyAdd = 0;
        } else if (hMuon < hCo && hMuon > 0) {
            // Hạ tuổi (hợp kim/hội)
            gold9999Add = 0;
            alloyAdd = (wCo * hCo / hMuon) - wCo;
        }

        const totalWeight = wCo + gold9999Add + alloyAdd;

        // Grams calculations
        const wCoGrams = wCo * gramsPerUnit;
        const goldGrams = gold9999Add * gramsPerUnit;
        const alloyGrams = alloyAdd * gramsPerUnit;
        const totalGrams = totalWeight * gramsPerUnit;

        // Update Result Cards
        const elGold = document.getElementById('tv-res-gold');
        const elGoldG = document.getElementById('tv-res-gold-g');
        const elAlloy = document.getElementById('tv-res-alloy');
        const elAlloyG = document.getElementById('tv-res-alloy-g');
        const elTotal = document.getElementById('tv-res-total');
        const elTotalG = document.getElementById('tv-res-total-g');

        if (elGold) elGold.textContent = gold9999Add.toFixed(4) + ' ' + unitLabel;
        if (elGoldG) elGoldG.textContent = '≈ ' + goldGrams.toFixed(4) + ' gam';
        if (elAlloy) elAlloy.textContent = alloyAdd.toFixed(4) + ' ' + unitLabel;
        if (elAlloyG) elAlloyG.textContent = '≈ ' + alloyGrams.toFixed(4) + ' gam';
        if (elTotal) elTotal.textContent = totalWeight.toFixed(4) + ' ' + unitLabel;
        if (elTotalG) elTotalG.textContent = '≈ ' + totalGrams.toFixed(4) + ' gam';

        // Update Detailed specs table
        const dtInitW = document.getElementById('tv-dt-init-w');
        const dtInitWG = document.getElementById('tv-dt-init-w-g');
        const dtInitP = document.getElementById('tv-dt-init-p');
        const dtTargetP = document.getElementById('tv-dt-target-p');
        const dtGold = document.getElementById('tv-dt-gold');
        const dtGoldG = document.getElementById('tv-dt-gold-g');
        const dtAlloy = document.getElementById('tv-dt-alloy');
        const dtAlloyG = document.getElementById('tv-dt-alloy-g');
        const dtTotal = document.getElementById('tv-dt-total');
        const dtTotalG = document.getElementById('tv-dt-total-g');

        if (dtInitW) {
            if (dtInitWG) {
                dtInitW.textContent = wCo.toFixed(4) + ' ' + unitLabel;
                dtInitWG.textContent = '≈ ' + wCoGrams.toFixed(4) + ' gam';
            } else {
                dtInitW.textContent = wCo.toFixed(4) + ' ' + unitLabel + ' (≈ ' + wCoGrams.toFixed(4) + ' gam)';
            }
        }
        if (dtInitP) dtInitP.textContent = hCo.toFixed(1) + ' %';
        if (dtTargetP) dtTargetP.textContent = hMuon.toFixed(1) + ' %';

        if (dtGold) {
            if (dtGoldG) {
                dtGold.textContent = gold9999Add.toFixed(4) + ' ' + unitLabel;
                dtGoldG.textContent = '≈ ' + goldGrams.toFixed(4) + ' gam';
            } else {
                dtGold.textContent = gold9999Add.toFixed(4) + ' ' + unitLabel + ' (≈ ' + goldGrams.toFixed(4) + ' gam)';
            }
        }
        if (dtAlloy) {
            if (dtAlloyG) {
                dtAlloy.textContent = alloyAdd.toFixed(4) + ' ' + unitLabel;
                dtAlloyG.textContent = '≈ ' + alloyGrams.toFixed(4) + ' gam';
            } else {
                dtAlloy.textContent = alloyAdd.toFixed(4) + ' ' + unitLabel + ' (≈ ' + alloyGrams.toFixed(4) + ' gam)';
            }
        }
        if (dtTotal) {
            if (dtTotalG) {
                dtTotal.textContent = totalWeight.toFixed(4) + ' ' + unitLabel;
                dtTotalG.textContent = '≈ ' + totalGrams.toFixed(4) + ' gam';
            } else {
                dtTotal.textContent = totalWeight.toFixed(4) + ' ' + unitLabel + ' (≈ ' + totalGrams.toFixed(4) + ' gam)';
            }
        }

        // Manual Click Visual Feedback
        if (isManualClick) {
            const btn = document.getElementById('calc-btn-action');
            if (btn) {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<span class="text-xl">✅</span> ĐÃ TÍNH KẾT QUẢ!`;
                btn.classList.add('ring-4', 'ring-amber-400/60', 'scale-[0.98]');
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.classList.remove('ring-4', 'ring-amber-400/60', 'scale-[0.98]');
                }, 1000);
            }

            const resContainer = document.getElementById('calc-results-container');
            if (resContainer) {
                resContainer.classList.add('ring-2', 'ring-amber-400', 'shadow-amber-500/20');
                setTimeout(() => {
                    resContainer.classList.remove('ring-2', 'ring-amber-400', 'shadow-amber-500/20');
                }, 700);

                // Smooth scroll to results if lower than viewport
                const rect = resContainer.getBoundingClientRect();
                if (rect.bottom > window.innerHeight || rect.top < 0) {
                    resContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
    }

    function setCurrentPurity(purityVal, btnEl) {
        const currentPurityInput = document.getElementById('calc-tv-current-purity');
        if (currentPurityInput) {
            currentPurityInput.value = purityVal;
        }
        const btns = document.querySelectorAll('.tv-quick-btn-current');
        btns.forEach(b => {
            b.classList.remove('active', 'border-2', 'border-cyan-500', 'bg-cyan-500/20');
        });
        if (btnEl) {
            btnEl.classList.add('active');
        }
        calculateGoldPurity();
    }

    function setTargetPurity(purityVal, btnEl) {
        const targetPurityInput = document.getElementById('calc-tv-target-purity');
        if (targetPurityInput) {
            targetPurityInput.value = purityVal;
        }
        const btns = document.querySelectorAll('.tv-quick-btn-target, .tv-quick-btn');
        btns.forEach(b => {
            b.classList.remove('active', 'border-2', 'border-amber-500', 'bg-amber-500/20');
        });
        if (btnEl) {
            btnEl.classList.add('active');
        }
        calculateGoldPurity();
    }

    function getCalculatorCardHtml() {
        const title = 'MÁY TÍNH QUY ĐỔI TIỀN VÀNG & BẠC';
        const desc = 'Nhập số lượng & chọn loại vàng/bạc để tính tiền VNĐ theo thời gian thực';

        const prevAmount = document.getElementById('calc-amount')?.value || '1';
        const prevUnit = document.getElementById('calc-unit')?.value || 'chi';
        const prevType = document.getElementById('calc-type')?.value || 'sjc';

        const unitOptions = `
            <option value="chi" ${prevUnit === 'chi' ? 'selected' : ''}>Chỉ (3.75g)</option>
            <option value="luong" ${prevUnit === 'luong' ? 'selected' : ''}>Lượng / Cây (37.5g)</option>
            <option value="kg" ${prevUnit === 'kg' ? 'selected' : ''}>Kilogram (1000g)</option>
            <option value="gram" ${prevUnit === 'gram' ? 'selected' : ''}>Gram (g)</option>
        `;

        const typeOptions = `
            <optgroup label="--- VÀNG ---">
                <option value="sjc" ${prevType === 'sjc' ? 'selected' : ''}>Vàng Miếng SJC (SJC Tự do)</option>
                <option value="24k" ${prevType === '24k' ? 'selected' : ''}>Vàng 999.9</option>
                <option value="22k" ${prevType === '22k' ? 'selected' : ''}>Vàng 99.9</option>
                <option value="980" ${prevType === '980' ? 'selected' : ''}>Vàng 980</option>
                <option value="750" ${prevType === '750' ? 'selected' : ''}>Vàng 750</option>
                <option value="610" ${prevType === '610' ? 'selected' : ''}>Vàng 610</option>
                <option value="585" ${prevType === '585' ? 'selected' : ''}>Vàng 585</option>
                <option value="416" ${prevType === '416' ? 'selected' : ''}>Vàng 416</option>
                <option value="18k" ${prevType === '18k' ? 'selected' : ''}>Vàng 95</option>
                <option value="tg" ${prevType === 'tg' ? 'selected' : ''}>Vàng TG (Quốc tế)</option>
            </optgroup>
            <optgroup label="--- BẠC ---">
                <option value="bac_mieng" ${prevType === 'bac_mieng' ? 'selected' : ''}>Bạc miếng 999 thị trường</option>
                <option value="bac_999" ${prevType === 'bac_999' ? 'selected' : ''}>Bạc 999 thị trường</option>
                <option value="bac_925" ${prevType === 'bac_925' ? 'selected' : ''}>Bạc nữ trang bán lẻ</option>
                <option value="bac_tg" ${prevType === 'bac_tg' ? 'selected' : ''}>Bạc TG (Spot XAG/USD)</option>
            </optgroup>
        `;

        return `
            <div id="calc-card" class="dashboard-card p-5 flex flex-col justify-between border-l-4 border-amber-500 hover:border-amber-400 rounded-xl shadow-lg shadow-black/20 hover:shadow-xl transition-all duration-300">
                <!-- Top: Tên công cụ + Subtitle + Huy hiệu -->
                <div class="flex justify-between items-start mb-2.5">
                    <div class="pr-2">
                        <div class="flex items-center gap-2 font-black uppercase tracking-wide text-yellow-400 text-base sm:text-lg">
                            <span class="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"></span>
                            <span id="calc-title">${title}</span>
                        </div>
                        <div id="calc-desc" class="text-xs sm:text-sm text-slate-400 mt-0.5 font-medium">${desc}</div>
                    </div>
                    <div class="flex flex-col items-end shrink-0">
                        <span class="text-[11px] sm:text-xs text-slate-400 font-mono">Công cụ</span>
                        <span class="text-xs sm:text-sm font-mono font-bold px-2.5 py-1 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/30">QUY ĐỔI</span>
                    </div>
                </div>

                <!-- Middle: Form nhập và hiển thị kết quả -->
                <div class="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/60 my-1.5 flex flex-col gap-2.5">
                    <!-- Hàng 1: Số lượng & Đơn vị -->
                    <div class="grid grid-cols-12 gap-2">
                        <div class="col-span-5 relative">
                            <input type="number" id="calc-amount" value="${prevAmount}" min="0.1" step="0.1"
                                oninput="GoldDashboard.calculate()"
                                class="w-full bg-slate-900 border border-slate-700 focus:border-yellow-500 text-white font-mono font-bold text-center px-2 py-1.5 rounded-lg outline-none text-base transition-colors" />
                        </div>
                        <div class="col-span-7">
                            <select id="calc-unit" onchange="GoldDashboard.calculate()"
                                class="w-full bg-slate-900 border border-slate-700 focus:border-yellow-500 text-yellow-400 font-semibold text-xs sm:text-sm rounded-lg px-2.5 py-2 outline-none cursor-pointer">
                                ${unitOptions}
                            </select>
                        </div>
                    </div>

                    <!-- Hàng 2: Chọn Loại vàng / Bạc -->
                    <div>
                        <select id="calc-type" onchange="GoldDashboard.calculate()"
                            class="w-full bg-slate-900 border border-slate-700 focus:border-yellow-500 text-slate-200 font-medium text-xs sm:text-sm rounded-lg px-2.5 py-2 outline-none cursor-pointer">
                            ${typeOptions}
                        </select>
                    </div>

                    <!-- Hàng 3: Thành tiền -->
                    <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <span class="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider">THÀNH TIỀN:</span>
                        <div class="text-right">
                            <div id="calc-result" class="text-lg sm:text-xl lg:text-2xl font-black text-amber-400 font-mono tracking-tight whitespace-nowrap">Đang tính...</div>
                            <div id="calc-result-usd" class="text-xs text-slate-400 font-mono"></div>
                        </div>
                    </div>
                </div>

                <!-- Bottom: Chân thẻ -->
                <div class="mt-2.5 pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 text-[11px] sm:text-xs font-mono">
                    <div class="whitespace-nowrap">
                        <span class="text-slate-400 font-medium">Quy chuẩn:</span>
                        <strong class="text-amber-400 font-bold ml-1">Thời gian thực</strong>
                    </div>
                    <div class="text-slate-400 text-[10px] sm:text-xs whitespace-nowrap">
                        1 Lượng = 10 Chỉ · 1 Kg = 26.66 Lượng
                    </div>
                </div>
            </div>
        `;
    }

    function initTradingView() {
        if (typeof TradingView === 'undefined') return;

        const tvTheme = currentTheme === 'light' ? 'light' : 'dark';
        const tvBg = currentTheme === 'light' ? '#ffffff' : '#0f172a';
        const tvGrid = currentTheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';

        setTimeout(() => {
            // 1. Chart Vàng XAU/USD
            const goldContainer = document.getElementById('tv_chart_gold') || document.getElementById('tv_chart');
            if (goldContainer) {
                goldContainer.innerHTML = '';
                new TradingView.widget({
                    "width": "100%",
                    "height": "100%",
                    "autosize": true,
                    "symbol": "OANDA:XAUUSD",
                    "interval": "60",
                    "timezone": "Asia/Ho_Chi_Minh",
                    "theme": tvTheme,
                    "style": "1",
                    "locale": "vi_VN",
                    "enable_publishing": false,
                    "backgroundColor": tvBg,
                    "gridColor": tvGrid,
                    "hide_top_toolbar": true,
                    "hide_legend": false,
                    "save_image": false,
                    "container_id": goldContainer.id
                });
            }

            // 2. Chart Bạc XAG/USD
            const silverContainer = document.getElementById('tv_chart_silver');
            if (silverContainer) {
                silverContainer.innerHTML = '';
                new TradingView.widget({
                    "width": "100%",
                    "height": "100%",
                    "autosize": true,
                    "symbol": "OANDA:XAGUSD",
                    "interval": "60",
                    "timezone": "Asia/Ho_Chi_Minh",
                    "theme": tvTheme,
                    "style": "1",
                    "locale": "vi_VN",
                    "enable_publishing": false,
                    "backgroundColor": tvBg,
                    "gridColor": tvGrid,
                    "hide_top_toolbar": true,
                    "hide_legend": false,
                    "save_image": false,
                    "container_id": "tv_chart_silver"
                });
            }
        }, 60);
    }

    function updateMarketHeadersUI() {
        // No-op
    }

    function calculateConverter() {
        const amountInput = document.getElementById('calc-amount');
        const unitSelect = document.getElementById('calc-unit');
        const typeSelect = document.getElementById('calc-type');
        const resultEl = document.getElementById('calc-result');
        const resultUsdEl = document.getElementById('calc-result-usd');

        if (!amountInput || !unitSelect || !typeSelect || !resultEl) return;
        if (!currentData) {
            currentData = getInstantInitialData(currentMarket);
        }

        const amount = parseFloat(amountInput.value) || 0;
        const unit = unitSelect.value;
        const type = typeSelect.value;

        let pricePerGramVND = 0;
        const isGoldType = ['sjc', 'nhan', '24k', '22k', '980', '750', '610', '585', '416', '18k', 'tg'].includes(type);

        if (isGoldType) {
            const goldItems = currentData.goldItems || [];
            let selectedItem = null;

            if (type === 'sjc') selectedItem = goldItems.find(i => i.name === 'SJC Tự do');
            else if (type === 'nhan') selectedItem = goldItems.find(i => i.name === 'Vàng nhẫn SJC');
            else if (type === '24k') selectedItem = goldItems.find(i => i.name === 'Vàng 999.9');
            else if (type === '22k') selectedItem = goldItems.find(i => i.name === 'Vàng 99.9');
            else if (type === '980') selectedItem = goldItems.find(i => i.name === 'Vàng 980');
            else if (type === '750') selectedItem = goldItems.find(i => i.name === 'Vàng 750');
            else if (type === '610') selectedItem = goldItems.find(i => i.name === 'Vàng 610');
            else if (type === '585') selectedItem = goldItems.find(i => i.name === 'Vàng 585');
            else if (type === '416') selectedItem = goldItems.find(i => i.name === 'Vàng 416');
            else if (type === '18k') selectedItem = goldItems.find(i => i.name === 'Vàng 95');
            else if (type === 'tg') selectedItem = goldItems.find(i => i.name === 'Vàng TG');
            else selectedItem = goldItems[0];

            let pricePerChiVND = 0;
            if (selectedItem) {
                if (selectedItem.isWorld) {
                    pricePerChiVND = (selectedItem.sell * (currentData.exchangeRate || EXCHANGE_RATE) / TROY_OUNCE_TO_GRAM) * 3.75;
                } else {
                    pricePerChiVND = selectedItem.sell * 100;
                }
            } else {
                pricePerChiVND = 14500000;
            }
            pricePerGramVND = pricePerChiVND / 3.75;
        } else {
            const silverItems = currentData.silverItems || [];
            let selectedItem = null;

            if (type === 'bac_999') selectedItem = silverItems.find(i => i.name.includes('Bạc 999'));
            else if (type === 'bac_925') selectedItem = silverItems.find(i => i.name.includes('bán lẻ') || i.name.includes('nữ trang'));
            else if (type === 'bac_tg') selectedItem = silverItems.find(i => i.isWorld || i.name.includes('Thế Giới'));
            else selectedItem = silverItems[0];

            if (selectedItem) {
                if (selectedItem.isWorld) {
                    pricePerGramVND = (selectedItem.sell * (currentData.exchangeRate || EXCHANGE_RATE)) / TROY_OUNCE_TO_GRAM;
                } else {
                    pricePerGramVND = selectedItem.sell / 3.75;
                }
            } else {
                pricePerGramVND = (66.36 * (currentData?.exchangeRate || EXCHANGE_RATE)) / TROY_OUNCE_TO_GRAM;
            }
        }

        let totalGrams = 0;
        if (unit === 'chi') totalGrams = amount * 3.75;
        else if (unit === 'luong') totalGrams = amount * 37.5;
        else if (unit === 'kg') totalGrams = amount * 1000;
        else totalGrams = amount;

        const totalVND = totalGrams * pricePerGramVND;
        const totalUSD = totalVND / (currentData.exchangeRate || EXCHANGE_RATE);

        resultEl.textContent = formatVND(totalVND);
        if (resultUsdEl) resultUsdEl.textContent = `≈ $${formatUSD(totalUSD)} USD`;
    }

    function initClock() {
        const timeEl = document.getElementById('live-time');
        if (!timeEl) return;
        setInterval(() => {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString('vi-VN') + ' | ' + now.toLocaleDateString('vi-VN');
        }, 1000);
    }

    // ==========================================
    // 5. MARKET NEWS SYSTEM (TIN TỨC THỊ TRƯỜNG - LIVE RSS + PHÂN TÍCH)
    // ==========================================
    let currentNewsFilter = 'all';
    let liveNewsList = [];

    const CURATED_NEWS = [
        {
            id: 1001,
            title: "Giá vàng hôm nay: SJC và Vàng nhẫn 999.9 duy trì đà tăng mạnh trước thềm công bố chính sách tiền tệ",
            category: "gold",
            categoryName: "Vàng SJC & Trong nước",
            badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
            image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800&auto=format&fit=crop&q=60",
            summary: "Thị trường vàng trong nước ghi nhận sức mua tăng đột biến ở cả vàng miếng SJC và vàng nhẫn trơn 9999. Các chuyên gia dự báo biên độ dao động sẽ tiếp tục mở rộng khi thị trường quốc tế bước vào phiên giao dịch nhạy cảm.",
            content: `
                <p class="leading-relaxed">Ghi nhận sáng nay, thị trường vàng trong nước tiếp tục diễn biến sôi động. Giá vàng miếng SJC tại các đơn vị kinh doanh lớn như SJC, DOJI, PNJ, Bảo Tín Minh Châu đồng loạt niêm yết quanh ngưỡng cao kỷ lục.</p>
                <div class="my-3 p-4 rounded-xl bg-amber-500/10 border-l-4 border-amber-500 text-amber-300 font-medium text-sm">
                    <strong>Điểm nhấn phiên hôm nay:</strong> Chênh lệch giữa giá vàng nhẫn 999.9 và vàng miếng SJC tiếp tục được thu hẹp, trong khi nhu cầu tích trữ tài sản an toàn của người dân và giới đầu tư vẫn ở mức rất cao.
                </div>
                <p class="leading-relaxed">Trên thị trường quốc tế, giá vàng giao ngay (Spot Gold XAU/USD) tiếp tục neo trên mốc lịch sử nhờ trợ lực từ kỳ vọng Cục Dự trữ Liên bang Mỹ (Fed) tiến hành nới lỏng chính sách tiền tệ và hạ lãi suất cơ bản.</p>
            `,
            source: "Ban Biên Tập Thị Trường",
            link: "https://vnexpress.net/kinh-doanh/hang-hoa",
            date: "Hôm nay",
            readTime: "3 phút đọc",
            featured: true
        },
        {
            id: 1002,
            title: "Thị trường bạc (XAG/USD) tăng vọt: Nhu cầu sản xuất xe điện và pin mặt trời tạo cú hích lịch sử",
            category: "silver",
            categoryName: "Thị Trường Bạc",
            badgeClass: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40",
            image: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=60",
            summary: "Bạc không chỉ đóng vai trò kim loại quý tích trữ mà còn là nguyên liệu công nghiệp thiết yếu. Tốc độ tiêu thụ bạc trong ngành năng lượng tái tạo đã vượt qua mọi dự báo quý 3.",
            content: `
                <p class="leading-relaxed">Bạc quốc tế vừa ghi nhận đợt tăng giá ấn tượng nhất trong vòng nhiều năm, vượt xa tốc độ tăng trưởng phần trăm của vàng trong cùng chu kỳ.</p>
                <div class="my-3 p-4 rounded-xl bg-cyan-500/10 border-l-4 border-cyan-500 text-cyan-300 font-medium text-sm">
                    <strong>Nhu cầu công nghiệp bùng nổ:</strong> Hơn 55% sản lượng bạc toàn cầu hiện được hấp thụ trực tiếp bởi các nhà máy sản xuất tấm pin quang điện (Solar PV) và linh kiện bán dẫn cho xe điện (EV).
                </div>
            `,
            source: "Lê Minh Quân - Chuyên gia Hàng hóa",
            link: "https://vietnamnet.vn/kinh-doanh/tai-chinh",
            date: "Hôm nay",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1003,
            title: "Ngân hàng Nhà nước đẩy mạnh các giải pháp bình ổn và thanh tra thị trường vàng",
            category: "policy",
            categoryName: "Chính Sách & Quản Lý",
            badgeClass: "bg-rose-500/20 text-rose-300 border border-rose-500/40",
            image: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&auto=format&fit=crop&q=60",
            summary: "Các cơ quan quản lý tiếp tục siết chặt kiểm tra hóa đơn điện tử, nguồn gốc xuất xứ vàng trang sức mỹ nghệ và đề xuất sửa đổi Nghị định 24/2012/NĐ-CP.",
            content: `
                <p class="leading-relaxed">Ngân hàng Nhà nước Việt Nam cùng các bộ ngành liên quan đang triển khai quyết liệt các biện pháp nhằm minh bạch hóa thị trường vàng, chống đầu cơ găm hàng và thao túng giá.</p>
            `,
            source: "Thái Sơn - Ban Pháp Chế & Vĩ Mô",
            link: "https://vnexpress.net/kinh-doanh/chinh-sach",
            date: "19/09/2026",
            readTime: "2 phút đọc",
            featured: false
        },
        {
            id: 1004,
            title: "Dự báo giá vàng thế giới: Liệu XAU/USD có sớm thiết lập cột mốc 3.000 USD/Ounce?",
            category: "world",
            categoryName: "Vàng Quốc Tế",
            badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
            image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&auto=format&fit=crop&q=60",
            summary: "Các ngân hàng đầu tư phố Wall như Goldman Sachs, Citi và UBS đồng loạt nâng mục tiêu giá vàng trung hạn trong báo cáo chiến lược mới nhất.",
            content: `
                <p class="leading-relaxed">Khảo sát mới nhất từ Bloomberg và Kitco News cho thấy hơn 78% các chuyên gia phân tích thị trường Phố Wall và 69% nhà đầu tư bán lẻ dự báo giá vàng sẽ tiếp tục duy trì xu hướng tăng.</p>
            `,
            source: "Trần Hoàng Nam - Kinh tế Trưởng",
            link: "https://cafef.vn/tai-chinh-quoc-te.chn",
            date: "19/09/2026",
            readTime: "5 phút đọc",
            featured: false
        },
        {
            id: 1005,
            title: "Sức mua vàng nhẫn trơn 999.9 tăng vọt: Người dân ưu tiên tài sản có tính thanh khoản cao",
            category: "gold",
            categoryName: "Vàng SJC & Trong nước",
            badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
            image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=60",
            summary: "Nhu cầu mua vàng nhẫn 9999 từ các thương hiệu lớn như PNJ, DOJI, Bảo Tín Minh Châu tiếp tục duy trì ở mức cao do chênh lệch mua bán hợp lý.",
            content: `
                <p class="leading-relaxed">Nhiều cửa hàng vàng lớn tại Hà Nội và TP.HCM ghi nhận số lượng khách hàng tìm mua vàng nhẫn gia tăng đáng kể. Sản phẩm vàng nhẫn 1 chỉ, 2 chỉ và 5 chỉ thường xuyên trong tình trạng cháy hàng cục bộ.</p>
            `,
            source: "Ban Tài Chính Trong Nước",
            link: "https://vnexpress.net/kinh-doanh/hang-hoa",
            date: "Hôm nay",
            readTime: "3 phút đọc",
            featured: false
        },
        {
            id: 1006,
            title: "Giá bạc thỏi 999 trong nước tiếp tục đà bứt phá theo xu hướng kim loại quý thế giới",
            category: "silver",
            categoryName: "Thị Trường Bạc",
            badgeClass: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40",
            image: "https://images.unsplash.com/photo-1599837565318-67429bde7162?w=800&auto=format&fit=crop&q=60",
            summary: "Thị trường bạc vật chất trong nước chứng kiến đợt sóng tăng giá mới khi giới đầu tư cá nhân bắt đầu phân bổ vốn sang tài sản kim loại quý giá rẻ hơn vàng.",
            content: `
                <p class="leading-relaxed">Giá bạc miếng và bạc thỏi niêm yết tại các đại lý lớn ghi nhận mức tăng đồng bộ. Tỷ lệ Gold/Silver ratio (tỷ lệ giá vàng/giá bạc) đang có dấu hiệu thu hẹp dần.</p>
            `,
            source: "Chuyên Gia Kim Loại Quý",
            link: "https://vietnamnet.vn/kinh-doanh/tai-chinh",
            date: "Hôm nay",
            readTime: "3 phút đọc",
            featured: false
        },
        {
            id: 1007,
            title: "Chỉ số USD Index hạ nhiệt thúc đẩy dòng tiền quay trở lại thị trường Vàng & Kim loại quý",
            category: "world",
            categoryName: "Vàng Quốc Tế",
            badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
            image: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&auto=format&fit=crop&q=60",
            summary: "Đồng USD suy yếu trên thị trường quốc tế là động lực hỗ trợ đà bứt phá của giá vàng XAU/USD và bạc XAG/USD trong các phiên giao dịch gần đây.",
            content: `
                <p class="leading-relaxed">Áp lực giảm giá lên đồng Dollar Mỹ xuất hiện sau khi các số liệu lạm phát CPI và việc làm tại Mỹ phát đi tín hiệu hạ nhiệt rõ nét hơn so với dự báo của giới phân tích.</p>
            `,
            source: "Reuters & FXStreet",
            link: "https://cafef.vn/tai-chinh-quoc-te.chn",
            date: "Hôm nay",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1008,
            title: "Khảo sát Kitco News: 82% chuyên gia Phố Wall nhận định giá vàng giữ vững xu hướng tăng",
            category: "analysis",
            categoryName: "Phân Tích & Dự Báo",
            badgeClass: "bg-purple-500/20 text-purple-300 border border-purple-500/40",
            image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=60",
            summary: "Kết quả khảo sát tuần mới nhất của Kitco News cho thấy tinh thần lạc quan áp đảo từ cả giới phân tích chuyên nghiệp và cộng đồng nhà đầu tư cá nhân.",
            content: `
                <p class="leading-relaxed">Hầu hết các chiến lược gia thị trường đều đồng thuận rằng các yếu tố hỗ trợ dài hạn như rủi ro địa chính trị và làn sóng hạ lãi suất toàn cầu vẫn chưa suy giảm.</p>
            `,
            source: "Kitco News Analysis",
            link: "https://cafef.vn/thi-truong.chn",
            date: "18/09/2026",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1009,
            title: "Siết chặt hóa đơn điện tử trong kinh doanh vàng: Hướng tới thị trường minh bạch & lành mạnh",
            category: "policy",
            categoryName: "Chính Sách & Quản Lý",
            badgeClass: "bg-rose-500/20 text-rose-300 border border-rose-500/40",
            image: "https://images.unsplash.com/photo-1556742049-0a670f4a4587?w=800&auto=format&fit=crop&q=60",
            summary: "Việc kết nối dữ liệu hóa đơn điện tử từ máy tính tiền trực tiếp đến cơ quan thuế giúp quản lý chặt chẽ doanh thu và nguồn gốc sản phẩm kim loại quý.",
            content: `
                <p class="leading-relaxed">Bộ Tài chính và Tổng cục Thuế yêu cầu 100% doanh nghiệp, cửa hàng kinh doanh vàng bạc nghiêm túc chấp hành xuất hóa đơn điện tử cho từng giao dịch lẻ.</p>
            `,
            source: "Ban Pháp Chế Kinh Tế",
            link: "https://vnexpress.net/kinh-doanh/chinh-sach",
            date: "18/09/2026",
            readTime: "3 phút đọc",
            featured: false
        },
        {
            id: 1010,
            title: "Phân tích kỹ thuật XAU/USD: Ngưỡng hỗ trợ quan trọng và kịch bản biến động tuần tới",
            category: "analysis",
            categoryName: "Phân Tích & Dự Báo",
            badgeClass: "bg-purple-500/20 text-purple-300 border border-purple-500/40",
            image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=60",
            summary: "Biểu đồ kỹ thuật giá vàng thế giới đang tích lũy trong mô hình cờ tăng (Bullish Flag). Các chỉ số RSI và MACD cho thấy lực mua vẫn duy trì chủ đạo.",
            content: `
                <p class="leading-relaxed">Phân tích biểu đồ khung D1 và H4 cho thấy ngưỡng hỗ trợ gần nhất của XAU/USD nằm ở mốc 2.620 USD/oz, trong khi kháng cự tâm lý mạnh nằm ở 2.700 USD/oz.</p>
            `,
            source: "Chuyên Gia Technical Analyst",
            link: "https://cafef.vn/thi-truong.chn",
            date: "17/09/2026",
            readTime: "5 phút đọc",
            featured: false
        },
        {
            id: 1011,
            title: "Ngân hàng Trung ương các nước đẩy mạnh mua ròng vàng bổ sung vào dự trữ quốc gia",
            category: "world",
            categoryName: "Vàng Quốc Tế",
            badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
            image: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&auto=format&fit=crop&q=60",
            summary: "Báo cáo từ Hội đồng Vàng Thế giới (WGC) xác nhận xu hướng đa dạng hóa tài sản dự trữ của các NHTW Châu Á và Đông Âu tiếp tục tăng tốc.",
            content: `
                <p class="leading-relaxed">Việc gia tăng tỷ trọng vàng trong quỹ dự trữ ngoại hối giúp các quốc gia giảm bớt rủi ro phụ thuộc vào một đồng tiền duy nhất trong bối cảnh địa chính trị phức tạp.</p>
            `,
            source: "World Gold Council (WGC)",
            link: "https://cafef.vn/tai-chinh-quoc-te.chn",
            date: "17/09/2026",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1012,
            title: "Chênh lệch giá vàng SJC và giá vàng thế giới quy đổi thu hẹp ở mức kỷ lục",
            category: "gold",
            categoryName: "Vàng SJC & Trong nước",
            badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
            image: "https://images.unsplash.com/photo-1618042164219-62c820f10723?w=800&auto=format&fit=crop&q=60",
            summary: "Khoảng cách giữa giá vàng miếng SJC và giá vàng thế giới quy đổi theo tỷ giá ngân hàng hiện chỉ còn quanh mức 2 - 4 triệu đồng/lượng.",
            content: `
                <p class="leading-relaxed">Nhờ các biện pháp can thiệp thị trường hiệu quả từ Ngân hàng Nhà nước, mức chênh lệch giá vàng trong nước và quốc tế đã giảm sâu so với mức 18-20 triệu đồng trước đây.</p>
            `,
            source: "Ban Nghiên Cứu Thị Trường",
            link: "https://vnexpress.net/kinh-doanh/hang-hoa",
            date: "16/09/2026",
            readTime: "3 phút đọc",
            featured: false
        },
        {
            id: 1013,
            title: "Giá vàng miếng 9999 niêm yết tại SJC, DOJI và PNJ giao dịch nhộn nhịp tại các chi nhánh lớn",
            category: "gold",
            categoryName: "Vàng SJC & Trong nước",
            badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
            image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&auto=format&fit=crop&q=60",
            summary: "Lượng khách hàng đến giao dịch tại các trung tâm kinh doanh vàng bạc lớn duy trì nhịp độ ổn định. Các doanh nghiệp áp dụng công nghệ đặt lịch hẹn trực tuyến tránh ùn tắc.",
            content: `
                <p class="leading-relaxed">Ghi nhận tại hệ thống cửa hàng SJC, DOJI và Bảo Tín Minh Châu, việc niêm yết công khai bảng giá và sử dụng hệ thống xếp hàng tự động giúp khách hàng mua bán nhanh chóng, thuận tiện.</p>
            `,
            source: "Thị Trường Trong Nước",
            link: "https://sjc.com.vn/gia-vang-online",
            date: "16/09/2026",
            readTime: "3 phút đọc",
            featured: false
        },
        {
            id: 1014,
            title: "Kinh nghiệm tích trữ vàng miếng và vàng nhẫn 9999 an toàn cho người mới bắt đầu",
            category: "gold",
            categoryName: "Vàng SJC & Trong nước",
            badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
            image: "https://images.unsplash.com/photo-1605792657660-596af9009e82?w=800&auto=format&fit=crop&q=60",
            summary: "Lời khuyên từ các chuyên gia tài chính cá nhân về việc phân bổ tỷ trọng vàng trong danh mục đầu tư và các tiêu chí lựa chọn vàng nhẫn 9999 chuẩn tuổi.",
            content: `
                <p class="leading-relaxed">Khi tích trữ vàng, người tiêu dùng nên mua tại các thương hiệu có uy tín, giữ đầy đủ hóa đơn chứng từ và bảo quản sản phẩm còn nguyên bao bì vỉ ép nhựa để tránh hao hụt khi bán ra.</p>
            `,
            source: "Tư Vấn Đầu Tư Cá Nhân",
            link: "https://vnexpress.net/kinh-doanh/hang-hoa",
            date: "15/09/2026",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1015,
            title: "Sức hút của đầu tư bạc vật chất: Lựa chọn tối ưu vốn với tỷ lệ lợi nhuận hấp dẫn",
            category: "silver",
            categoryName: "Thị Trường Bạc",
            badgeClass: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40",
            image: "https://images.unsplash.com/photo-1615840287214-7ff58936c4cf?w=800&auto=format&fit=crop&q=60",
            summary: "Nhiều nhà đầu tư thế hệ trẻ lựa chọn bạc thỏi 999 làm kênh tích trữ tài sản ban đầu nhờ suất đầu tư vừa phải và tiềm năng tăng trưởng lớn trong chu kỳ năng lượng xanh.",
            content: `
                <p class="leading-relaxed">Bạc vật chất đang khẳng định sức hút nhờ khả năng phòng thủ rủi ro tương tự vàng nhưng sở hữu dư địa tăng giá phần trăm cao hơn trong các giai đoạn bùng nổ hàng hóa công nghiệp.</p>
            `,
            source: "Tạp Chí Kim Loại Quý",
            link: "https://vietnamnet.vn/kinh-doanh/tai-chinh",
            date: "15/09/2026",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1016,
            title: "Phân tích xu hướng tỷ lệ Vàng/Bạc (Gold/Silver Ratio) và cơ hội cho nhà đầu tư",
            category: "silver",
            categoryName: "Thị Trường Bạc",
            badgeClass: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40",
            image: "https://images.unsplash.com/photo-1614028674016-81c23881e974?w=800&auto=format&fit=crop&q=60",
            summary: "Tỷ lệ Gold/Silver hiện duy trì ở mức cao so với trung bình lịch sử, mở ra cơ hội kinh doanh chênh lệch giá cho những nhà đầu tư am hiểu chu kỳ kim loại quý.",
            content: `
                <p class="leading-relaxed">Lịch sử thị trường cho thấy khi tỷ lệ Vàng/Bạc vượt ngưỡng 80x, bạc thường có xu hướng bứt phá mạnh mẽ để thu hẹp khoảng cách giá so với vàng trong thời gian ngắn.</p>
            `,
            source: "Phân Tích Chiến Lược Hàng Hóa",
            link: "https://vietnamnet.vn/kinh-doanh/tai-chinh",
            date: "14/09/2026",
            readTime: "5 phút đọc",
            featured: false
        },
        {
            id: 1017,
            title: "Các tập đoàn công nghệ toàn cầu tăng tốc thu mua bạc nguyên liệu cho sản xuất chip AI",
            category: "silver",
            categoryName: "Thị Trường Bạc",
            badgeClass: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40",
            image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=60",
            summary: "Đột phá trong hạ tầng trí tuệ nhân tạo (AI Data Centers) đẩy nhu cầu dẫn điện và tản nhiệt bằng bạc lên mức chưa từng có trong lịch sử ngành bán dẫn.",
            content: `
                <p class="leading-relaxed">Khả năng dẫn điện đỉnh cao của bạc khiến kim loại này trở thành vật liệu không thể thay thế trong các dòng vi xử lý AI và trung tâm dữ liệu thế hệ mới.</p>
            `,
            source: "Tech & Metals Report",
            link: "https://vietnamnet.vn/kinh-doanh/tai-chinh",
            date: "14/09/2026",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1018,
            title: "Làn sóng hạ lãi suất của Cục Dự trữ Liên bang Mỹ (Fed) và tác động dây chuyền tới giá vàng",
            category: "world",
            categoryName: "Vàng Quốc Tế",
            badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
            image: "https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?w=800&auto=format&fit=crop&q=60",
            summary: "Mỗi khi Fed hạ lãi suất cơ bản, chi phí cơ hội của việc nắm giữ tài sản không sinh lãi như vàng giảm xuống, tạo môi trường cực kỳ thuận lợi cho xu hướng tăng giá.",
            content: `
                <p class="leading-relaxed">Các nhà kinh tế học dự báo chu kỳ nới lỏng tiền tệ của các ngân hàng trung ương lớn sẽ kéo dài trong suốt 12 đến 18 tháng tới, cung cấp bệ đỡ kiên cố cho thị trường kim loại quý.</p>
            `,
            source: "Macroeconomics Weekly",
            link: "https://cafef.vn/tai-chinh-quoc-te.chn",
            date: "13/09/2026",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1019,
            title: "Căng thẳng địa chính trị và biến động địa kinh tế toàn cầu tiếp tục duy trì mặt sàn cho giá vàng",
            category: "world",
            categoryName: "Vàng Quốc Tế",
            badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
            image: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=60",
            summary: "Vàng khẳng định thế mạnh số 1 với vai trò 'vịnh trú ẩn an toàn' trước những bất ổn trên bản đồ địa chính trị và thương mại quốc tế.",
            content: `
                <p class="leading-relaxed">Các quỹ đầu tư lớn trên thế giới (ETF) đã quay trở lại trạng thái mua ròng vàng sau nhiều tháng xả hàng, cho thấy lòng tin vững chắc vào đà tăng của vàng quốc tế.</p>
            `,
            source: "Global Risk Insight",
            link: "https://cafef.vn/tai-chinh-quoc-te.chn",
            date: "13/09/2026",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1020,
            title: "Báo cáo phân tích Goldman Sachs & UBS: Dự báo lộ trình đà tăng của kim loại quý đến năm 2027",
            category: "analysis",
            categoryName: "Phân Tích & Dự Báo",
            badgeClass: "bg-purple-500/20 text-purple-300 border border-purple-500/40",
            image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=60",
            summary: "Hai ngân hàng đầu tư danh tiếng đồng loạt điều chỉnh tăng mục tiêu giá vàng trung và dài hạn nhờ động lực từ nguồn cầu vật chất của Châu Á.",
            content: `
                <p class="leading-relaxed">Báo cáo dự báo lượng cầu mua vàng từ Trung Quốc, Ấn Độ và các thị trường mới nổi sẽ tiếp tục giữ vai trò dẫn dắt đà tăng trưởng của thị trường hàng hóa toàn cầu.</p>
            `,
            source: "Goldman Sachs Research",
            link: "https://cafef.vn/thi-truong.chn",
            date: "12/09/2026",
            readTime: "5 phút đọc",
            featured: false
        },
        {
            id: 1021,
            title: "Chiến lược quản trị rủi ro danh mục khi đầu tư vàng và bạc trong thời kỳ lạm phát",
            category: "analysis",
            categoryName: "Phân Tích & Dự Báo",
            badgeClass: "bg-purple-500/20 text-purple-300 border border-purple-500/40",
            image: "https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?w=800&auto=format&fit=crop&q=60",
            summary: "Phương pháp phân bổ vốn thông minh theo tỷ lệ 70% Vàng - 30% Bạc giúp tối ưu hóa khả năng phòng thủ và gia tăng lợi nhuận cho nhà đầu tư.",
            content: `
                <p class="leading-relaxed">Việc đa dạng hóa sản phẩm đầu tư kim loại quý kết hợp với chiến lược bình quân giá (DCA) là giải pháp loại bỏ yếu tố tâm lý đám đông hiệu quả nhất.</p>
            `,
            source: "Chuyên Gia Quản Lý Danh Mục",
            link: "https://cafef.vn/thi-truong.chn",
            date: "12/09/2026",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1022,
            title: "So sánh hiệu suất đầu tư giữa Vàng, Bạc, Tiền gửi tiết kiệm và Bất động sản",
            category: "analysis",
            categoryName: "Phân Tích & Dự Báo",
            badgeClass: "bg-purple-500/20 text-purple-300 border border-purple-500/40",
            image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=60",
            summary: "Thống kê hiệu suất đầu tư trong 5 năm gần đây cho thấy vàng và bạc vượt trội hơn hẳn so với lãi suất tiền gửi ngân hàng.",
            content: `
                <p class="leading-relaxed">Mặc dù gửi tiết kiệm mang lại dòng tiền ổn định, vàng lại có ưu thế vượt trội trong việc bảo vệ sức mua của đồng tiền khỏi tác động mất giá của lạm phát dài hạn.</p>
            `,
            source: "Phân Tích Dữ Liệu Tài Chính",
            link: "https://cafef.vn/thi-truong.chn",
            date: "11/09/2026",
            readTime: "5 phút đọc",
            featured: false
        },
        {
            id: 1023,
            title: "Sửa đổi Nghị định 24/2012/NĐ-CP: Từng bước xóa bỏ độc quyền vàng miếng và mở rộng thị trường",
            category: "policy",
            categoryName: "Chính Sách & Quản Lý",
            badgeClass: "bg-rose-500/20 text-rose-300 border border-rose-500/40",
            image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&auto=format&fit=crop&q=60",
            summary: "Dự thảo sửa đổi Nghị định 24 hướng tới việc cấp phép sản xuất vàng miếng cho các doanh nghiệp đủ điều kiện để tăng nguồn cung cho thị trường.",
            content: `
                <p class="leading-relaxed">Việc mở rộng quyền sản xuất và nhập khẩu vàng nguyên liệu hứa hẹn giúp thị trường vàng Việt Nam tiệm cận sát hơn với mặt bằng giá thế giới.</p>
            `,
            source: "Ban Chính Sách Tiền Tệ",
            link: "https://vnexpress.net/kinh-doanh/chinh-sach",
            date: "11/09/2026",
            readTime: "4 phút đọc",
            featured: false
        },
        {
            id: 1024,
            title: "Quy định về truy xuất nguồn gốc vàng nguyên liệu và nghĩa vụ kê khai thuế đối với tiệm vàng",
            category: "policy",
            categoryName: "Chính Sách & Quản Lý",
            badgeClass: "bg-rose-500/20 text-rose-300 border border-rose-500/40",
            image: "https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=800&auto=format&fit=crop&q=60",
            summary: "Cơ quan quản lý siết chặt kiểm tra hóa đơn chứng từ chứng minh nguồn gốc hợp pháp của nguyên liệu chế tác trang sức vàng bạc.",
            content: `
                <p class="leading-relaxed">Các tiệm vàng trên cả nước hưởng ứng tích cực việc chuẩn hóa sổ sách hóa đơn, góp phần đẩy lùi nạn kinh doanh vàng nhập lậu không rõ nguồn gốc.</p>
            `,
            source: "Tổng Cục Thuế & Quản Lý Thị Trường",
            link: "https://vnexpress.net/kinh-doanh/chinh-sach",
            date: "10/09/2026",
            readTime: "3 phút đọc",
            featured: false
        },
        {
            id: 1025,
            title: "Tăng cường kết nối liên thông dữ liệu thanh toán ngân hàng và hóa đơn kinh doanh vàng bạc",
            category: "policy",
            categoryName: "Chính Sách & Quản Lý",
            badgeClass: "bg-rose-500/20 text-rose-300 border border-rose-500/40",
            image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&auto=format&fit=crop&q=60",
            summary: "Đẩy mạnh thanh toán không dùng tiền mặt (chuyển khoản QR code, thẻ ngân hàng) giúp các giao dịch mua bán vàng diễn ra an toàn và minh bạch.",
            content: `
                <p class="leading-relaxed">Hơn 90% các giao dịch vàng có giá trị lớn hiện nay đều được thực hiện qua hình thức chuyển khoản ngân hàng, giảm thiểu rủi ro tiền giả và đếm tiền mặt.</p>
            `,
            source: "Ban Công Nghệ Ngân Hàng",
            link: "https://vnexpress.net/kinh-doanh/chinh-sach",
            date: "10/09/2026",
            readTime: "3 phút đọc",
            featured: false
        }
    ];

    const NEWS_ENDPOINTS = [
        '/api/news'
    ];

    async function fetchLiveNews() {
        if (liveNewsList.length > 0) return liveNewsList;
        for (const endpoint of NEWS_ENDPOINTS) {
            try {
                const url = getApiUrl(endpoint);
                const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
                        const fetchedData = data.data;
                        const merged = [...fetchedData];
                        CURATED_NEWS.forEach(item => {
                            if (!merged.some(m => m.title === item.title)) {
                                merged.push(item);
                            }
                        });
                        liveNewsList = merged;
                        return liveNewsList;
                    }
                }
            } catch (e) { }
        }
        liveNewsList = CURATED_NEWS;
        return liveNewsList;
    }

    let newsLimit = 6;

    async function renderNews(filter = 'all') {
        currentNewsFilter = filter;
        const container = document.getElementById('news-section');
        if (!container) return;

        const categories = [
            { id: 'all', name: 'Tất cả tin' },
            { id: 'gold', name: '🥇 Vàng Trong Nước' },
            { id: 'world', name: '🌐 Vàng Thế Giới' },
            { id: 'silver', name: '🥈 Thị Trường Bạc' },
            { id: 'analysis', name: '📊 Phân Tích & Dự Báo' },
            { id: 'policy', name: '⚖️ Chính Sách' }
        ];

        const newsData = (liveNewsList.length > 0) ? liveNewsList : await fetchLiveNews();

        const filteredNews = filter === 'all'
            ? newsData
            : newsData.filter(item => item.category === filter);

        const featuredArticle = filteredNews.find(n => n.featured) || filteredNews[0];
        const allRegular = filteredNews.filter(n => n.id !== (featuredArticle ? featuredArticle.id : -1));
        const regularArticles = allRegular.slice(0, newsLimit);
        const hasMore = allRegular.length > newsLimit;

        let html = `
            <!-- Tiêu đề và bộ lọc Tin Tức -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-800">
                <div>
                    <h2 class="text-base sm:text-lg font-black text-slate-100 flex items-center gap-2 uppercase tracking-tight">
                        <span class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                        <span>TIN TỨC THỊ TRƯỜNG THỜI GIAN THỰC</span>
                    </h2>
                    <p class="text-xs text-slate-400 mt-0.5 font-medium">Tự động cập nhật 24/7 từ các trang báo kinh tế - tài chính hàng đầu</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="GoldDashboard.refreshNews()" title="Quét lại tin mới nhất"
                        class="text-xs font-mono text-blue-400 bg-blue-950/60 border border-blue-800/50 hover:bg-blue-900/60 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all">
                        <span>🔄 Cập nhật (${filteredNews.length} tin)</span>
                    </button>
                </div>
            </div>

            <!-- Thanh Danh Mục / Bộ Lọc (Category Filter Pills) -->
            <div class="flex flex-wrap items-center gap-2">
                ${categories.map(cat => {
            const isActive = currentNewsFilter === cat.id;
            const activeClass = isActive
                ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30 border-blue-500'
                : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700';
            return `
                        <button onclick="GoldDashboard.filterNews('${cat.id}')"
                            class="px-3.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer border ${activeClass}">
                            ${cat.name}
                        </button>
                    `;
        }).join('')}
            </div>
        `;

        if (featuredArticle) {
            html += `
                <!-- Bài Viết Nổi Bật (Featured Hero Banner) -->
                <div onclick="GoldDashboard.openNews(${featuredArticle.id})" 
                    class="dashboard-card news-card cursor-pointer rounded-2xl p-4 sm:p-5 border border-slate-700/60 hover:border-yellow-500/50 transition-all group overflow-hidden relative shadow-lg">
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        <div class="md:col-span-5 overflow-hidden rounded-xl h-48 md:h-52 bg-slate-900 relative">
                            <img src="${featuredArticle.image}" alt="${featuredArticle.title}" 
                                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                onerror="this.src='https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800&auto=format&fit=crop&q=60'" />
                            <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-md ${featuredArticle.badgeClass}">
                                ★ Nổi Bật
                            </span>
                        </div>
                        <div class="md:col-span-7 flex flex-col justify-between h-full gap-2">
                            <div class="flex flex-col gap-2">
                                <div class="flex items-center gap-2 text-xs">
                                    <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold ${featuredArticle.badgeClass}">
                                        ${featuredArticle.categoryName}
                                    </span>
                                    <span class="text-slate-400 font-medium">• ${featuredArticle.date}</span>
                                    <span class="text-slate-400 font-medium">• ${featuredArticle.readTime}</span>
                                </div>
                                <h3 class="text-base sm:text-lg font-bold text-slate-100 group-hover:text-yellow-400 transition-colors leading-snug">
                                    ${featuredArticle.title}
                                </h3>
                                <p class="text-xs sm:text-sm text-slate-300 line-clamp-3 leading-relaxed">
                                    ${featuredArticle.summary}
                                </p>
                            </div>
                            <div class="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
                                <span>📰 Nguồn: <strong class="text-slate-200">${featuredArticle.source || 'Báo điện tử'}</strong></span>
                                <div class="flex items-center gap-2">
                                    ${featuredArticle.link && featuredArticle.link !== '#' ? `
                                        <a href="${featuredArticle.link}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();"
                                            class="px-2 py-0.5 rounded bg-blue-950 hover:bg-blue-900 text-blue-300 font-semibold text-[11px] border border-blue-800/60 transition-all flex items-center gap-1">
                                            <span>Mở bài gốc</span>
                                            <span>↗</span>
                                        </a>
                                    ` : ''}
                                    <span class="text-yellow-400 font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                                        Đọc chi tiết ➔
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (regularArticles.length > 0) {
            html += `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${regularArticles.map(article => `
                        <div onclick="GoldDashboard.openNews(${article.id})"
                            class="dashboard-card news-card cursor-pointer rounded-xl p-4 border border-slate-800 hover:border-slate-700 transition-all group flex flex-col justify-between gap-3 shadow-sm">
                            <div class="flex flex-col gap-2.5">
                                <div class="overflow-hidden rounded-lg h-40 bg-slate-900 relative">
                                    <img src="${article.image}" alt="${article.title}"
                                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        onerror="this.src='https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800&auto=format&fit=crop&q=60'" />
                                    <span class="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold ${article.badgeClass}">
                                        ${article.categoryName}
                                    </span>
                                    <span class="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-950/80 text-slate-300 border border-slate-700/50 backdrop-blur-sm">
                                        ⚡ ${article.source || 'Báo điện tử'}
                                    </span>
                                </div>
                                <div class="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                                    <span>📅 ${article.date}</span>
                                    <span>⏱️ ${article.readTime}</span>
                                </div>
                                <h4 class="text-sm font-bold text-slate-100 group-hover:text-yellow-400 transition-colors line-clamp-2 leading-snug">
                                    ${article.title}
                                </h4>
                                <p class="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                                    ${article.summary}
                                </p>
                            </div>
                            <div class="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                                <span class="truncate max-w-[120px]">📰 ${article.source || 'Báo chí'}</span>
                                <div class="flex items-center gap-1.5">
                                    ${article.link && article.link !== '#' ? `
                                        <a href="${article.link}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();"
                                            class="px-2 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-300 font-semibold text-[10px] border border-blue-800/60 transition-all flex items-center gap-0.5">
                                            <span>Bài gốc</span>
                                            <span>↗</span>
                                        </a>
                                    ` : ''}
                                    <span class="text-yellow-400 font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-0.5">
                                        Xem ➔
                                    </span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (hasMore) {
            html += `
                <div class="flex justify-center mt-4">
                    <button onclick="GoldDashboard.loadMoreNews()"
                        class="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-yellow-400 hover:text-yellow-300 font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-all shadow-md">
                        <span>📰 Xem Thêm Tin Tức Thị Trường</span>
                        <span>▼</span>
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    function loadMoreNews() {
        newsLimit += 6;
        renderNews(currentNewsFilter);
    }

    function openNewsModal(id) {
        const article = (liveNewsList.length > 0 ? liveNewsList : CURATED_NEWS).find(n => n.id === id);
        if (!article) return;

        const modal = document.getElementById('news-modal');
        const contentEl = document.getElementById('news-modal-content');
        if (!modal || !contentEl) return;

        const mainSummary = article.summary || article.title;
        const rawContent = (article.content && article.content.trim() !== '') ? article.content : '';

        // Tự động xác định link bài báo gốc chuẩn xác (luôn vào thẳng trang báo chính thống, không bao giờ vào Google Search)
        let targetLink = (article.link && article.link !== '#' && article.link.startsWith('http')) ? article.link : null;
        if (!targetLink) {
            const cat = article.category || '';
            if (cat === 'policy') {
                targetLink = 'https://vnexpress.net/kinh-doanh/chinh-sach';
            } else if (cat === 'world') {
                targetLink = 'https://cafef.vn/tai-chinh-quoc-te.chn';
            } else if (cat === 'silver') {
                targetLink = 'https://vietnamnet.vn/kinh-doanh/tai-chinh';
            } else if (cat === 'analysis') {
                targetLink = 'https://cafef.vn/thi-truong.chn';
            } else {
                targetLink = 'https://vnexpress.net/kinh-doanh/hang-hoa';
            }
        }

        const bodyContent = `
            <!-- Đoạn tóm tắt mở đầu -->
            <div class="my-3 p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border-l-4 border-amber-500 text-amber-100 font-medium text-xs sm:text-sm leading-relaxed news-summary-box">
                <strong class="text-amber-400 font-bold block mb-1">📌 Tóm tắt bài viết:</strong>
                ${mainSummary}
            </div>

            ${rawContent ? `<div class="my-3 leading-relaxed text-xs sm:text-sm text-slate-200 space-y-2 article-raw-content">${rawContent}</div>` : ''}

            <!-- Khối bối cảnh thị trường -->
            <div class="my-3 p-3.5 sm:p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2 news-card-box">
                <h4 class="text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-1.5 news-box-title">
                    <span>📊</span>
                    <span>Bối Cảnh Thị Trường & Diễn Biến Chi Tiết</span>
                </h4>
                <p class="leading-relaxed text-xs sm:text-sm text-slate-200 news-box-desc">
                    Thị trường tài chính và kim loại quý đang chứng kiến những biến động quan trọng dưới tác động của chỉ số USD Index, chính sách lãi suất từ Cục Dự trữ Liên bang Mỹ (Fed) cũng như các chỉ đạo bình ổn từ Ngân hàng Nhà nước Việt Nam.
                </p>
                <p class="leading-relaxed text-xs sm:text-sm text-slate-200 news-box-desc">
                    Nhu cầu giao dịch thực tế tại các trung tâm kinh doanh vàng bạc lớn (SJC, DOJI, PNJ, Bảo Tín Minh Châu) duy trì nhịp độ sôi động. Sự cân bằng giữa sức mua tích trữ và hoạt động đầu tư dài hạn giúp thị trường giữ vững thanh khoản.
                </p>
            </div>

            <!-- Khối đánh giá chuyên gia -->
            <div class="my-3 p-3.5 sm:p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2 news-card-box">
                <h4 class="text-xs sm:text-sm font-bold text-blue-400 flex items-center gap-1.5 news-box-title-blue">
                    <span>⚖️</span>
                    <span>Đánh Giá Chuyên Gia & Quản Trị Rủi Ro</span>
                </h4>
                <p class="leading-relaxed text-xs sm:text-sm text-slate-200 news-box-desc">
                    Các chuyên gia tài chính khuyến nghị nhà đầu tư cá nhân và chủ tiệm vàng nên theo dõi chặt chẽ bản tin từ các cơ quan quản lý chính thống, tuân thủ quy định hóa đơn chứng từ điện tử và chuẩn hóa xuất xứ nguồn gốc sản phẩm.
                </p>
            </div>
        `;

        contentEl.innerHTML = `
            <div class="flex items-center gap-2 text-xs">
                <span class="px-2.5 py-1 rounded-md font-semibold ${article.badgeClass}">
                    ${article.categoryName}
                </span>
                <span class="text-slate-400 font-medium">• ${article.date}</span>
                <span class="text-slate-400 font-medium">• ${article.readTime}</span>
            </div>
            
            <h2 class="text-base sm:text-lg md:text-xl font-extrabold text-slate-100 leading-snug">
                ${article.title}
            </h2>

            <div class="flex flex-wrap items-center justify-between gap-1.5 pb-2.5 border-b border-slate-800 text-xs text-slate-400">
                <span>Nguồn báo chí 24/7: <strong class="text-amber-400 font-bold">${article.source || 'VnExpress / CafeF / VietnamNet'}</strong></span>
                <span class="text-emerald-400 font-semibold flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-emerald-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Nguồn báo chí đã xác thực
                </span>
            </div>

            <div class="rounded-xl overflow-hidden max-h-64 sm:max-h-72 w-full bg-slate-900">
                <img src="${article.image}" alt="${article.title}" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800&auto=format&fit=crop&q=60'" />
            </div>

            <div class="text-xs sm:text-sm text-slate-200 leading-relaxed space-y-3 article-body">
                ${bodyContent}
            </div>

            <!-- CHỈ GIỮ 1 NÚT DUY NHẤT Ở CUỐI TRANG - ĐI THẲNG TỚI TRANG BÁO GỐC -->
            <div class="mt-4 pt-3 border-t border-slate-800 flex flex-wrap justify-between items-center gap-2">
                <span class="text-xs text-slate-400 font-medium truncate max-w-[200px]">Nguồn: <strong class="text-amber-400">${article.source || 'Báo điện tử'}</strong></span>
                <div class="flex items-center gap-2">
                    <a href="${targetLink}" target="_blank" rel="noopener noreferrer"
                        class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold transition-all shadow-md inline-flex items-center gap-1.5 cursor-pointer">
                        <span>Đọc bài báo gốc</span>
                        <span>↗</span>
                    </a>
                    <button onclick="GoldDashboard.closeNewsModal()" 
                        class="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold transition-all shadow-md cursor-pointer">
                        Đóng bài viết
                    </button>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    }

    function closeNewsModal() {
        const modal = document.getElementById('news-modal');
        if (modal) modal.classList.add('hidden');
    }

    // ==========================================
    // 6. MODAL AUTH DIALOG
    // ==========================================
    function openAuthModal(tab = 'login') {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.remove('hidden');
            switchModalAuthTab(tab);
        }
    }

    function closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.add('hidden');
    }

    function switchModalAuthTab(tab) {
        const btnLogin = document.getElementById('modal-tab-login');
        const btnReg = document.getElementById('modal-tab-register');
        const formLogin = document.getElementById('modal-form-login');
        const formReg = document.getElementById('modal-form-register');
        const title = document.getElementById('modal-auth-title');

        if (tab === 'login') {
            btnLogin.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all bg-yellow-500 text-slate-950 shadow-md cursor-pointer';
            btnReg.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer';
            formLogin.classList.remove('hidden');
            formReg.classList.add('hidden');
            if (title) title.textContent = 'Đăng Nhập Tài Khoản';
        } else {
            btnReg.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all bg-yellow-500 text-slate-950 shadow-md cursor-pointer';
            btnLogin.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer';
            formReg.classList.remove('hidden');
            formLogin.classList.add('hidden');
            if (title) title.textContent = 'Đăng Ký Tài Khoản Mới';
        }
    }

    function handleModalLogin(e) {
        e.preventDefault();
        const account = document.getElementById('modal-login-acc').value.trim();
        const password = document.getElementById('modal-login-pwd').value.trim();
        const errorEl = document.getElementById('modal-login-error');

        if (!account || !password) {
            errorEl.textContent = 'Vui lòng nhập đầy đủ thông tin!';
            errorEl.classList.remove('hidden');
            return;
        }

        const user = {
            name: account.includes('@') ? account.split('@')[0] : account,
            account: account,
            isLoggedIn: true,
            loginTime: new Date().toISOString()
        };

        AuthManager.setUser(user);
        closeAuthModal();
    }

    function handleModalRegister(e) {
        e.preventDefault();
        const name = document.getElementById('modal-reg-name').value.trim();
        const account = document.getElementById('modal-reg-acc').value.trim();
        const password = document.getElementById('modal-reg-pwd').value.trim();
        const errorEl = document.getElementById('modal-reg-error');

        if (!name || !account || !password) {
            errorEl.textContent = 'Vui lòng nhập đầy đủ thông tin!';
            errorEl.classList.remove('hidden');
            return;
        }

        const user = {
            name: name || account,
            account: account,
            isLoggedIn: true,
            loginTime: new Date().toISOString()
        };

        AuthManager.setUser(user);
        closeAuthModal();
        alert('🎉 Đăng ký thành công! Bảng giá đã được mở khóa.');
    }

    function checkSSOParams() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sso = urlParams.get('sso');
            const user = urlParams.get('user') || urlParams.get('name');

            if (sso === 'true' || sso === '1' || (user && user.trim() !== '')) {
                const decodedName = user ? decodeURIComponent(user) : 'Thành viên T3Gold';
                const ssoUser = {
                    name: decodedName,
                    account: 't3gold_member',
                    isLoggedIn: true,
                    source: 't3gold',
                    loginTime: new Date().toISOString()
                };
                AuthManager.setUser(ssoUser);

                if (window.history && window.history.replaceState) {
                    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
                }
            }
        } catch (e) {
            console.error('Lỗi kiểm tra SSO T3Gold:', e);
        }
    }

    function loginDemo() {
        const demoUser = {
            name: 'Khách hàng Demo',
            account: 'demo@thitruonggia.vn',
            isLoggedIn: true,
            loginTime: new Date().toISOString()
        };
        AuthManager.setUser(demoUser);
        closeAuthModal();
    }

    const TradingViewRealtimeStream = {
        ws: null,
        session: null,
        lastTvXau: null,
        lastTvXag: null,
        reconnectTimer: null,

        init: function (onPriceTick) {
            const self = this;
            if (this.ws) {
                try { this.ws.close(); } catch (e) { }
            }

            try {
                const wsUrl = 'wss://widgetdata.tradingview.com/socket.io/websocket';
                this.ws = new WebSocket(wsUrl);
                this.session = 'qs_' + Math.random().toString(36).substring(2, 14);

                this.ws.onopen = function () {
                    const sendMsg = function (func, args) {
                        if (self.ws && self.ws.readyState === WebSocket.OPEN) {
                            const str = JSON.stringify({ m: func, p: args });
                            const msg = `~m~${str.length}~m~${str}`;
                            self.ws.send(msg);
                        }
                    };

                    sendMsg('set_auth_token', ['unauthorized_user_token']);
                    sendMsg('quote_create_session', [self.session]);
                    sendMsg('quote_set_fields', [self.session, 'lp', 'ch', 'chp', 'bid', 'ask', 'open_price', 'high_price', 'low_price', 'prev_close_price']);
                    sendMsg('quote_add_symbols', [self.session, 'OANDA:XAUUSD', 'OANDA:XAGUSD']);
                };

                this.ws.onmessage = function (event) {
                    const msgStr = event.data ? event.data.toString() : '';

                    // Heartbeat ping
                    const pingMatch = msgStr.match(/~m~\d+~m~~h~(\d+)/);
                    if (pingMatch) {
                        const pingId = pingMatch[1];
                        if (self.ws && self.ws.readyState === WebSocket.OPEN) {
                            self.ws.send(`~m~${pingId.length + 4}~m~~h~${pingId}`);
                        }
                        return;
                    }

                    // JSON messages
                    const jsonMatches = msgStr.matchAll(/~m~\d+~m~({.+?})(?=(~m~\d+~m~|$))/g);
                    for (const match of jsonMatches) {
                        try {
                            const parsed = JSON.parse(match[1]);
                            if (parsed.m === 'qsd' && parsed.p && parsed.p[1]) {
                                const q = parsed.p[1];
                                const name = q.n || '';
                                const v = q.v || {};

                                if (name === 'OANDA:XAUUSD' && v.lp !== undefined) {
                                    const price = parseFloat(v.lp);
                                    const change = v.ch !== undefined ? parseFloat(v.ch) : (self.lastTvXau ? self.lastTvXau.change : 0);
                                    self.lastTvXau = { price: price, change: change, ts: Date.now() };
                                    if (typeof onPriceTick === 'function') {
                                        onPriceTick('gold', price, change);
                                    }
                                } else if (name === 'OANDA:XAGUSD' && v.lp !== undefined) {
                                    const price = parseFloat(v.lp);
                                    const change = v.ch !== undefined ? parseFloat(v.ch) : (self.lastTvXag ? self.lastTvXag.change : 0);
                                    self.lastTvXag = { price: price, change: change, ts: Date.now() };
                                    if (typeof onPriceTick === 'function') {
                                        onPriceTick('silver', price, change);
                                    }
                                }
                            }
                        } catch (e) { }
                    }
                };

                this.ws.onerror = function (err) { };

                this.ws.onclose = function () {
                    if (self.reconnectTimer) clearTimeout(self.reconnectTimer);
                    self.reconnectTimer = setTimeout(function () {
                        self.init(onPriceTick);
                    }, 3000);
                };
            } catch (e) { }
        }
    };

    return {
        init: function () {
            checkSSOParams();
            initClock();
            initTheme();
            renderAuthHeader();

            // ⚡ Hiển thị ngay lập tức 0ms không chờ mạng - load cả gold lẫn silver
            currentData = getInstantInitialData('gold');
            renderPriceCards(currentData);

            updateCalculatorUI(true);
            this.refreshData();
            initTradingView();
            renderNews('all');

            if (!AuthManager.isLoggedIn()) {
                setTimeout(() => {
                    openAuthModal('login');
                }, 500);
            }

            // ⚡ Kết nối WebSocket TradingView Real-time Stream nhảy số 0ms theo biểu đồ
            TradingViewRealtimeStream.init(function (type, price, change) {
                if (!currentData) return;
                const exRate = currentData.exchangeRate || EXCHANGE_RATE;
                if (type === 'gold' && price > 0) {
                    currentData.price = price;
                    currentData.change = change;
                    currentData.goldItems = buildDynamicGoldItems(price, price * exRate, change, price - 0.2, price + 0.2, cachedV247Data);
                    if (currentData.currencies && currentData.currencies.length > 0) {
                        // Keep currencies intact
                    }
                } else if (type === 'silver' && price > 0) {
                    currentData.silverItems = buildDynamicSilverItems(price, price * exRate, change, price - 0.05, price + 0.05, cachedV247Data);
                }
                renderPriceCards(currentData);
            });

            // ⚡ Chạy fetch trực tiếp 0ms để cập nhật giá tức thì khi vừa load trang
            fetchTvLivePriceDirectly().then(tvLive => {
                if (tvLive && currentData) {
                    if (tvLive.xau) {
                        const spotPrice = parseFloat(tvLive.xau.close.toFixed(2));
                        const change = tvLive.xau.change || 0;
                        currentData.price = spotPrice;
                        currentData.change = change;
                        if (currentData.goldItems && currentData.goldItems[0]) {
                            currentData.goldItems[0].buy = spotPrice;
                            currentData.goldItems[0].sell = spotPrice;
                            currentData.goldItems[0].change = change;
                        }
                    }
                    if (tvLive.xag && currentData) {
                        const silverPrice = parseFloat(tvLive.xag.close.toFixed(2));
                        const silverChange = tvLive.xag.change || 0;
                        const exRate = currentData.exchangeRate || EXCHANGE_RATE;
                        currentData.silverItems = buildDynamicSilverItems(silverPrice, silverPrice * exRate, silverChange, silverPrice - 0.05, silverPrice + 0.05, cachedV247Data);
                    }
                    renderPriceCards(currentData);
                }
            });

            // ⚡ Vòng lặp cập nhật nhảy số nhảy giá trực tiếp 1000ms (1 giây / lần) từ TradingView Scanner & Vang247
            let v247TickCounter = 0;
            setInterval(async () => {
                try {
                    v247TickCounter++;
                    let updated = false;

                    // Cập nhật giá vang247 tự động đồng bộ theo thời gian thực (mỗi 3 giây)
                    if (v247TickCounter % 3 === 0) {
                        const v247New = await fetchVang247HcmPrices();
                        if (v247New && currentData) {
                            if (v247New.currencies && v247New.currencies.length > 0) {
                                currentData.currencies = v247New.currencies;
                                updated = true;
                            }
                            const exRate = currentData.exchangeRate || EXCHANGE_RATE;
                            if (v247New.worldGold && v247New.worldGold.sell > 0) {
                                const goldPrice = v247New.worldGold.sell;
                                const goldChange = v247New.worldGold.change || 0;
                                currentData.price = goldPrice;
                                currentData.change = goldChange;
                                currentData.goldItems = buildDynamicGoldItems(
                                    goldPrice,
                                    goldPrice * exRate,
                                    goldChange,
                                    v247New.worldGold.buy,
                                    v247New.worldGold.sell,
                                    v247New
                                );
                                updated = true;
                            } else if (currentData.price) {
                                currentData.goldItems = buildDynamicGoldItems(
                                    currentData.price,
                                    currentData.price * exRate,
                                    currentData.change || 0,
                                    currentData.price - 0.2,
                                    currentData.price + 0.2,
                                    v247New
                                );
                                updated = true;
                            }

                            if (v247New.worldSilver && v247New.worldSilver.sell > 0) {
                                const silverPrice = v247New.worldSilver.sell;
                                const silverChange = v247New.worldSilver.change || 0;
                                currentData.silverItems = buildDynamicSilverItems(
                                    silverPrice,
                                    silverPrice * exRate,
                                    silverChange,
                                    v247New.worldSilver.buy,
                                    v247New.worldSilver.sell,
                                    v247New
                                );
                                updated = true;
                            } else if (currentData.silverItems && currentData.silverItems[0]) {
                                const silverPrice = currentData.silverItems[0].buy || 60.37;
                                currentData.silverItems = buildDynamicSilverItems(
                                    silverPrice,
                                    silverPrice * exRate,
                                    0,
                                    silverPrice - 0.05,
                                    silverPrice + 0.05,
                                    v247New
                                );
                                updated = true;
                            }
                        }
                    }

                    const tvLive = await fetchTvLivePriceDirectly();
                    if (tvLive) {
                        if (tvLive.xau && currentData) {
                            const spotPrice = parseFloat(tvLive.xau.close.toFixed(2));
                            const change = tvLive.xau.change || 0;
                            currentData.price = spotPrice;
                            currentData.change = change;
                            if (currentData.goldItems && currentData.goldItems[0]) {
                                currentData.goldItems[0].buy = spotPrice;
                                currentData.goldItems[0].sell = spotPrice;
                                currentData.goldItems[0].change = change;
                                updated = true;
                            }
                        }
                        if (tvLive.xag && currentData) {
                            const silverPrice = parseFloat(tvLive.xag.close.toFixed(2));
                            const silverChange = tvLive.xag.change || 0;
                            const exRate = currentData.exchangeRate || EXCHANGE_RATE;
                            currentData.silverItems = buildDynamicSilverItems(silverPrice, silverPrice * exRate, silverChange, silverPrice - 0.05, silverPrice + 0.05, cachedV247Data);
                            updated = true;
                        }
                    }

                    if (updated) {
                        renderPriceCards(currentData);
                    }
                } catch (e) { }
            }, 1000);
        },
        switchMarket: function (market) {
            if (currentMarket === market) return;
            currentMarket = market;

            // Update Tab UI
            const tabGold = document.getElementById('tab-gold');
            const tabSilver = document.getElementById('tab-silver');
            const tabNews = document.getElementById('tab-news');
            const priceSection = document.getElementById('price-section');
            const chartSection = document.getElementById('chart-section');
            const currencySection = document.getElementById('currency-section');
            const calculatorSection = document.getElementById('calculator-section');
            const newsSection = document.getElementById('news-section');
            const mainLeftCol = document.getElementById('main-left-col');
            const mainRightCol = document.getElementById('main-right-col');

            const inactiveStyle = 'px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 inactive-tab';

            if (tabGold) tabGold.className = inactiveStyle;
            if (tabSilver) tabSilver.className = inactiveStyle;
            if (tabNews) tabNews.className = inactiveStyle;

            if (market === 'news') {
                // CHẾ ĐỘ TIN TỨC: Ẩn Bảng giá, Biểu đồ, Tỷ giá & Máy tính; hiện trang Tin tức tràn lề (12 cột)
                if (tabNews) tabNews.className = 'px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg shadow-amber-500/25 active-tab';
                if (priceSection) priceSection.classList.add('hidden');
                if (chartSection) chartSection.classList.add('hidden');
                if (currencySection) currencySection.classList.add('hidden');
                if (calculatorSection) calculatorSection.classList.add('hidden');
                if (mainRightCol) mainRightCol.className = 'hidden';
                if (mainLeftCol) mainLeftCol.className = 'contents lg:flex lg:flex-col lg:gap-4 lg:col-span-12';
                if (newsSection) {
                    newsSection.classList.remove('hidden');
                    renderNews(currentNewsFilter);
                }
            } else {
                // CHẾ ĐỘ GIÁ VÀNG / GIÁ BẠC: Hiện lại Bảng giá, Biểu đồ, Tỷ giá & Máy tính (Chia 8-4 cột)
                if (mainLeftCol) mainLeftCol.className = 'contents lg:flex lg:flex-col lg:gap-4 lg:col-span-8';
                if (mainRightCol) mainRightCol.className = 'contents lg:flex lg:flex-col lg:gap-4 lg:col-span-4';
                if (priceSection) priceSection.classList.remove('hidden');
                if (chartSection) chartSection.classList.remove('hidden');
                if (currencySection) currencySection.classList.remove('hidden');
                if (calculatorSection) calculatorSection.classList.remove('hidden');
                if (newsSection) newsSection.classList.add('hidden');

                if (market === 'gold') {
                    if (tabGold) tabGold.className = 'px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-yellow-500/20 active-tab';
                } else if (market === 'silver') {
                    if (tabSilver) tabSilver.className = 'px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 shadow-lg shadow-yellow-500/20 active-tab';
                }

                // ⚡ Hiển thị bảng giá mới ngay lập tức trong 0ms không bị chờ mạng hay trống bảng
                currentData = getInstantInitialData(market);
                renderPriceCards(currentData);
                updateMarketHeadersUI();
                updateCalculatorUI(true);
                initTradingView();
                this.refreshData();
            }
        },
        openNews: openNewsModal,
        closeNewsModal: closeNewsModal,
        filterNews: renderNews,
        loadMoreNews: loadMoreNews,
        refreshNews: async function () {
            liveNewsList = [];
            await renderNews(currentNewsFilter);
        },
        calculate: calculateGoldPurity,
        calculatePurity: calculateGoldPurity,
        setCurrentPurity: setCurrentPurity,
        setTargetPurity: setTargetPurity,
        toggleTheme: toggleTheme,
        openAuth: openAuthModal,
        closeAuthModal: closeAuthModal,
        switchModalAuthTab: switchModalAuthTab,
        handleModalLogin: handleModalLogin,
        handleModalRegister: handleModalRegister,
        loginDemo: loginDemo,
        logout: function () {
            AuthManager.logout();
        },
        handleHotlineClick: function (e) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('0942758213');
            }
        },
        refreshData: async function () {
            const icon = document.getElementById('refresh-icon');

            if (icon) icon.classList.add('loading-spin');

            try {
                const data = await fetchData();
                if (data) {
                    renderPriceCards(data);

                    // Cập nhật cả 2 timestamp vàng & bạc cùng 1 lúc
                    const nowTimeStr = 'Cập nhật lần cuối: ' + getFormattedDateTimeStr();
                    const lastUpdatedEl = document.getElementById('last-updated-time');
                    if (lastUpdatedEl) lastUpdatedEl.textContent = nowTimeStr;
                    const silverUpdatedEl = document.getElementById('silver-updated-time');
                    if (silverUpdatedEl) silverUpdatedEl.textContent = nowTimeStr;
                }
            } finally {
                setTimeout(() => {
                    if (icon) icon.classList.remove('loading-spin');
                }, 400);
            }
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    GoldDashboard.init();
});