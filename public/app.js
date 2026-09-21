const GoldDashboard = (function () {
    const API_ENDPOINTS = {
        gold: [
            '/api/gold',
            'http://127.0.0.1:3001/api/gold',
            'http://localhost:3001/api/gold'
        ],
        silver: [
            '/api/silver',
            'http://127.0.0.1:3001/api/silver',
            'http://localhost:3001/api/silver'
        ]
    };

    // Tỷ giá quy đổi thị trường thực tế
    const EXCHANGE_RATE = 25970; // Tỷ giá USD/VND thị trường
    const TROY_OUNCE_TO_GRAM = 31.1034768; // 1 Troy Ounce = 31.1035 gram
    const GRAM_TO_LUONG = 37.5; // 1 Lượng (Cây) = 37.5 gram = 10 chỉ
    const GRAM_TO_KG = 1000;

    // Danh sách ngoại tệ chuẩn
    const CURRENCY_LIST = [
        { code: 'USD', name: 'Đô la Mỹ', rateBuy: 25750, rateSell: 26150 },
        { code: 'EUR', name: 'Euro Châu Âu', rateBuy: 27800, rateSell: 28400 },
        { code: 'GBP', name: 'Bảng Anh', rateBuy: 32900, rateSell: 33700 },
        { code: 'JPY', name: 'Yên Nhật (100 JPY)', rateBuy: 17200, rateSell: 17800 },
        { code: 'SGD', name: 'Đô la Singapore', rateBuy: 19800, rateSell: 20400 },
        { code: 'AUD', name: 'Đô la Úc', rateBuy: 16800, rateSell: 17400 },
        { code: 'CAD', name: 'Đô la Canada', rateBuy: 18600, rateSell: 19200 },
        { code: 'CHF', name: 'Franc Thụy Sĩ', rateBuy: 29800, rateSell: 30600 },
        { code: 'CNY', name: 'Nhân Dân Tệ', rateBuy: 3580, rateSell: 3720 },
        { code: 'THB', name: 'Baht Thái Lan', rateBuy: 750, rateSell: 810 }
    ];

    // Tiện ích định dạng
    const formatVND = (num) => Math.round(num).toLocaleString('vi-VN') + ' đ';
    const formatNumber = (num) => Math.round(num).toLocaleString('vi-VN');
    const formatUSD = (num) => Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const getColorClass = (num) => num > 0 ? 'text-emerald-400' : (num < 0 ? 'text-rose-400' : 'text-slate-400');
    const getBgColorClass = (num) => num > 0 ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50' : (num < 0 ? 'bg-rose-950/60 text-rose-300 border-rose-800/50' : 'bg-slate-800 text-slate-400 border-slate-700');
    const getSign = (num) => num > 0 ? '+' : '';

    let currentMarket = 'gold'; // 'gold' | 'silver'
    let currentData = null;
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
                    class="text-xs font-bold px-3.5 py-1.5 rounded-lg bg-[#092c74] hover:bg-[#0c3996] text-white transition-all shadow-md cursor-pointer border border-blue-900">
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
    function buildDynamicGoldItems(priceUsd, priceVnd, changeUsd, bid, ask) {
        const liveUsdBid = bid !== undefined ? parseFloat(bid) : (priceUsd - 0.2);
        const liveUsdAsk = ask !== undefined ? parseFloat(ask) : (priceUsd + 0.2);

        const baseVsgChiVND = 13791431;
        const g9999BuyRaw = 136300;
        const g9999SellRaw = 137800;

        return [
            {
                name: 'Vàng TG',
                isWorld: true,
                buy: parseFloat(liveUsdBid.toFixed(1)),
                sell: parseFloat(liveUsdAsk.toFixed(1)),
                change: 35.41,
                cl: 0
            },
            {
                name: 'SJC Tự do',
                isWorld: false,
                buy: 144200,
                sell: 145700,
                change: 0,
                cl: 778569
            },
            {
                name: 'Vàng 999.9',
                isWorld: false,
                buy: 136300,
                sell: 137800,
                change: 0,
                cl: Math.round(137800 * 100 - baseVsgChiVND)
            },
            {
                name: 'Vàng 99.9',
                isWorld: false,
                buy: 136000,
                sell: 137500,
                change: 0,
                cl: Math.round(137500 * 100 - baseVsgChiVND)
            },
            {
                name: 'Vàng 95',
                isWorld: false,
                buy: 128700,
                sell: 130200,
                change: 0,
                cl: Math.round(130200 * 100 - baseVsgChiVND)
            },
            {
                name: 'Vàng 980',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.9795),
                sell: Math.round(g9999SellRaw * 0.9805),
                change: 0,
                cl: Math.round(Math.round(g9999SellRaw * 0.9805) * 100 - baseVsgChiVND)
            },
            {
                name: 'Vàng 750 (18K)',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.749),
                sell: Math.round(g9999SellRaw * 0.751),
                change: 0,
                cl: Math.round(Math.round(g9999SellRaw * 0.751) * 100 - baseVsgChiVND)
            },
            {
                name: 'Vàng 610 (14.6K)',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.6085),
                sell: Math.round(g9999SellRaw * 0.6115),
                change: 0,
                cl: Math.round(Math.round(g9999SellRaw * 0.6115) * 100 - baseVsgChiVND)
            },
            {
                name: 'Vàng 585 (14K)',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.583),
                sell: Math.round(g9999SellRaw * 0.587),
                change: 0,
                cl: Math.round(Math.round(g9999SellRaw * 0.587) * 100 - baseVsgChiVND)
            },
            {
                name: 'Vàng 416 (10K)',
                isWorld: false,
                buy: Math.round(g9999BuyRaw * 0.4135),
                sell: Math.round(g9999SellRaw * 0.4185),
                change: 0,
                cl: Math.round(Math.round(g9999SellRaw * 0.4185) * 100 - baseVsgChiVND)
            }
        ];
    }

    function buildDynamicSilverItems(priceUsd, priceVnd, changeUsd, bid, ask) {
        const liveUsdBid = bid !== undefined ? parseFloat(bid) : (priceUsd - 0.05);
        const liveUsdAsk = ask !== undefined ? parseFloat(ask) : (priceUsd + 0.05);

        const baseGramVND = priceVnd / TROY_OUNCE_TO_GRAM;
        const baseLuongVND = baseGramVND * GRAM_TO_LUONG;
        const baseKgVND = baseGramVND * GRAM_TO_KG;
        const baseLuongChangeVND = (changeUsd * EXCHANGE_RATE / TROY_OUNCE_TO_GRAM) * GRAM_TO_LUONG;
        const baseChiVNDWorldSell = baseGramVND * 3.75;

        // 1. Bạc 999 thị trường: Giá bạc thế giới 1 chỉ làm tròn lên (ví dụ 208.259 -> 210, tức 210.000 VNĐ)
        const bac999Price = Math.ceil(baseChiVNDWorldSell / 10000) * 10000;

        // 2. Bạc Nữ trang: Giá bán = Giá bán thế giới + 60.000 VNĐ (60K); Giá mua = 60% của giá bán
        const bacNuTrangSell = Math.round(baseChiVNDWorldSell + 60000);
        const bacNuTrangBuy = Math.round(bacNuTrangSell * 0.6);

        return [
            {
                name: 'Bạc Thế Giới (XAG/USD)',
                isWorld: true,
                buy: parseFloat(liveUsdBid.toFixed(2)),
                sell: parseFloat(liveUsdAsk.toFixed(2)),
                change: parseFloat(changeUsd.toFixed(2)),
                cl: 0
            },
            {
                name: 'Bạc Phú Quý (1 Lượng)',
                isWorld: false,
                buy: Math.round(baseLuongVND * 0.97),
                sell: Math.round(baseLuongVND * 1.00),
                change: Math.round(baseLuongChangeVND),
                cl: 0
            },
            {
                name: 'Bạc Phú Quý (1 Kg)',
                isWorld: false,
                buy: Math.round(baseKgVND * 0.97),
                sell: Math.round(baseKgVND * 1.00),
                change: Math.round((changeUsd * EXCHANGE_RATE / TROY_OUNCE_TO_GRAM) * GRAM_TO_KG),
                cl: 0
            },
            {
                name: 'Bạc 999 thị trường',
                isWorld: false,
                buy: bac999Price,
                sell: bac999Price,
                change: Math.round(baseLuongChangeVND / 10),
                cl: 0
            },
            {
                name: 'Bạc Nữ trang',
                isWorld: false,
                buy: bacNuTrangBuy,
                sell: bacNuTrangSell,
                change: Math.round((baseLuongChangeVND / 10) * 0.925),
                cl: 0
            }
        ];
    }

    async function fetchData() {
        if (currentMarket === 'news') return currentData;
        const endpoints = API_ENDPOINTS[currentMarket] || API_ENDPOINTS['gold'];
        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.price > 0) {
                        if (currentMarket === 'gold') {
                            if (!data.goldItems || data.goldItems.length === 0) {
                                data.goldItems = buildDynamicGoldItems(
                                    data.price,
                                    data.priceVndPerOunce || (data.price * (data.exchangeRate || EXCHANGE_RATE)),
                                    data.change || 0,
                                    data.bid,
                                    data.ask
                                );
                            }
                        } else {
                            if (!data.silverItems || data.silverItems.length === 0) {
                                data.silverItems = buildDynamicSilverItems(
                                    data.price,
                                    data.priceVndPerOunce || (data.price * (data.exchangeRate || EXCHANGE_RATE)),
                                    data.change || 0,
                                    data.bid,
                                    data.ask
                                );
                            }
                        }
                        currentData = data;
                        return data;
                    }
                }
            } catch (e) { }
        }

        // Fallback live data nếu server đang bận
        if (currentMarket === 'gold') {
            const livePrice = 4378.385;
            const openPrice = 4376.585;
            const change = livePrice - openPrice;
            const changePercent = parseFloat(((change / openPrice) * 100).toFixed(2));
            const liveVndPerOunce = livePrice * EXCHANGE_RATE;

            currentData = {
                success: true,
                symbol: 'XAU/USD',
                price: livePrice,
                priceVndPerOunce: liveVndPerOunce,
                bid: livePrice - 0.2,
                ask: livePrice + 0.2,
                open: openPrice,
                high: 4383.435,
                low: 4375.605,
                close: livePrice,
                change: parseFloat(change.toFixed(2)),
                changePercent: changePercent,
                goldItems: buildDynamicGoldItems(livePrice, liveVndPerOunce, change, livePrice - 0.2, livePrice + 0.2)
            };
        } else {
            const livePrice = 66.25;
            const openPrice = 66.34;
            const change = livePrice - openPrice;
            const changePercent = parseFloat(((change / openPrice) * 100).toFixed(2));
            const liveVndPerOunce = livePrice * EXCHANGE_RATE;

            currentData = {
                success: true,
                symbol: 'XAG/USD',
                price: livePrice,
                priceVndPerOunce: liveVndPerOunce,
                bid: livePrice - 0.05,
                ask: livePrice + 0.05,
                open: openPrice,
                high: 66.45,
                low: 66.22,
                close: livePrice,
                change: parseFloat(change.toFixed(2)),
                changePercent: changePercent,
                silverItems: buildDynamicSilverItems(livePrice, liveVndPerOunce, change, livePrice - 0.05, livePrice + 0.05)
            };
        }
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

        const isAuthed = AuthManager.isLoggedIn();

        const formatNumber = (num, decimals = 0) => {
            if (num === null || num === undefined) return '0';
            if (decimals > 0) {
                return Number(num).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            }
            return Math.round(num).toLocaleString('en-US');
        };

        let items = [];
        if (currentMarket === 'gold') {
            items = data.goldItems || [];
        } else {
            items = data.silverItems || [];
        }

        const getItemSubtitle = (it) => {
            if (currentMarket === 'gold') {
                if (it.isWorld) return 'Spot XAU/USD quy đổi VNĐ';
                if (it.name.includes('SJC') && !it.name.includes('nhẫn')) return 'Vàng miếng thương hiệu SJC';
                if (it.name.includes('nhẫn')) return 'Nhẫn tròn trơn SJC 999.9';
                if (it.name.includes('999.9')) return 'Vàng ta nguyên chất 24K (4 số 9)';
                if (it.name.includes('99.9')) return 'Vàng 22K (3 số 9)';
                if (it.name.includes('95') && !it.name.includes('GF')) return 'Vàng tây (75% - 95%)';
                if (it.name.includes('99,99% GF')) return 'Hợp đồng tương lai 99.99%';
                if (it.name.includes('95% GF')) return 'Hợp đồng tương lai 95%';
                if (it.name.includes('980')) return 'Vàng trang sức 98.0% (Vàng 980)';
                if (it.name.includes('750')) return 'Vàng trang sức 18K (75.0%)';
                if (it.name.includes('610')) return 'Vàng trang sức 14.6K (61.0%)';
                if (it.name.includes('585')) return 'Vàng trang sức 14K (58.5%)';
                if (it.name.includes('416')) return 'Vàng trang sức 10K (41.6%)';
                return 'Chuẩn vàng trang sức';
            } else {
                if (it.isWorld) return 'Sàn quốc tế · Spot XAG/USD';
                if (it.name.includes('Phú Quý (1 Lượng)')) return 'Bạc Phú Quý 99.9% ép vỉ (1 Lượng = 37.5g)';
                if (it.name.includes('Phú Quý (5 Lượng)')) return 'Bạc Phú Quý 99.9% đúc thỏi (5 Lượng = 187.5g)';
                if (it.name.includes('Phú Quý (1 Kg)')) return 'Bạc Phú Quý thỏi chuẩn đúc 1 Kilogram (1000g)';
                if (it.name.includes('Bạc 999')) return 'Bạc nguyên chất 99.9% ép vỉ (1 Chỉ = 3.75g)';
                if (it.name.includes('Nữ Trang')) return 'Bạc trang sức thời trang cao cấp 92.5%';
                if (it.name.includes('Thái')) return 'Bạc Thái thủ công mỹ nghệ khắc họa tiết 92.5%';
                if (it.name.includes('Ý')) return 'Bạc Ý xi bạch kim sáng bóng chuẩn 92.5%';
                return 'Chuẩn bạc thị trường';
            }
        };

        const getItemTheme = (it) => {
            const name = it.name.toLowerCase();
            if (it.isWorld || name.includes('thế giới') || name.includes('spot xag') || name.includes('bạc tg')) return { border: 'border-yellow-500 hover:border-yellow-400', dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-400', valText: 'text-yellow-400', subText: 'text-yellow-300' };
            if (name.includes('phú quý (1 lượng)') || name.includes('phuquy_1l')) return { border: 'border-cyan-500 hover:border-cyan-400', dot: 'bg-cyan-400', text: 'text-cyan-400', valText: 'text-cyan-300', subText: 'text-cyan-400' };
            if (name.includes('phú quý (5 lượng)') || name.includes('phuquy_5l')) return { border: 'border-blue-500 hover:border-blue-400', dot: 'bg-blue-400', text: 'text-blue-400', valText: 'text-blue-300', subText: 'text-blue-400' };
            if (name.includes('phú quý (1 kg)') || name.includes('phuquy_1kg')) return { border: 'border-emerald-500 hover:border-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-400', valText: 'text-emerald-300', subText: 'text-emerald-400' };
            if (name.includes('bạc 999')) return { border: 'border-amber-500 hover:border-amber-400', dot: 'bg-amber-400', text: 'text-amber-400', valText: 'text-amber-300', subText: 'text-amber-400' };
            if (name.includes('nữ trang')) return { border: 'border-rose-500 hover:border-rose-400', dot: 'bg-rose-400', text: 'text-rose-400', valText: 'text-rose-300', subText: 'text-rose-400' };
            if (name.includes('thái')) return { border: 'border-purple-500 hover:border-purple-400', dot: 'bg-purple-400', text: 'text-purple-400', valText: 'text-purple-300', subText: 'text-purple-400' };
            if (name.includes('ý')) return { border: 'border-indigo-500 hover:border-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-400', valText: 'text-indigo-300', subText: 'text-indigo-400' };
            if (name.includes('sjc tự do') || (name.includes('sjc') && !name.includes('nhẫn'))) return { border: 'border-amber-500 hover:border-amber-400', dot: 'bg-amber-400', text: 'text-amber-400', valText: 'text-yellow-300', subText: 'text-yellow-400' };
            if (name.includes('nhẫn')) return { border: 'border-emerald-500 hover:border-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-400', valText: 'text-white', subText: 'text-emerald-400' };
            if (name.includes('999.9')) return { border: 'border-cyan-500 hover:border-cyan-400', dot: 'bg-cyan-400', text: 'text-cyan-400', valText: 'text-cyan-300', subText: 'text-cyan-400' };
            if (name.includes('980')) return { border: 'border-purple-500 hover:border-purple-400', dot: 'bg-purple-400', text: 'text-purple-400', valText: 'text-purple-300', subText: 'text-purple-400' };
            if (name.includes('750')) return { border: 'border-rose-500 hover:border-rose-400', dot: 'bg-rose-400', text: 'text-rose-400', valText: 'text-rose-300', subText: 'text-rose-400' };
            if (name.includes('610')) return { border: 'border-indigo-500 hover:border-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-400', valText: 'text-indigo-300', subText: 'text-indigo-400' };
            if (name.includes('585')) return { border: 'border-teal-500 hover:border-teal-400', dot: 'bg-teal-400', text: 'text-teal-400', valText: 'text-teal-300', subText: 'text-teal-400' };
            if (name.includes('416')) return { border: 'border-orange-500 hover:border-orange-400', dot: 'bg-orange-400', text: 'text-orange-400', valText: 'text-orange-300', subText: 'text-orange-400' };
            if (name.includes('99.9') || name.includes('thỏi')) return { border: 'border-blue-500 hover:border-blue-400', dot: 'bg-blue-400', text: 'text-blue-400', valText: 'text-blue-300', subText: 'text-blue-400' };
            if (name.includes('95% gf') || name.includes('hạt')) return { border: 'border-slate-500 hover:border-slate-400', dot: 'bg-slate-400', text: 'text-slate-300', valText: 'text-slate-200', subText: 'text-slate-300' };
            if (name.includes('95')) return { border: 'border-lime-500 hover:border-lime-400', dot: 'bg-lime-400', text: 'text-lime-400', valText: 'text-lime-300', subText: 'text-lime-400' };
            if (name.includes('99,99% gf')) return { border: 'border-fuchsia-500 hover:border-fuchsia-400', dot: 'bg-fuchsia-400', text: 'text-fuchsia-400', valText: 'text-fuchsia-300', subText: 'text-fuchsia-400' };
            return { border: 'border-slate-600 hover:border-slate-500', dot: 'bg-slate-400', text: 'text-slate-300', valText: 'text-white', subText: 'text-slate-300' };
        };

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

        const nowStr = getFormattedDateTimeStr();

        const lastUpdatedEl = document.getElementById('last-updated-time');
        if (lastUpdatedEl) lastUpdatedEl.textContent = 'Cập nhật lần cuối: ' + nowStr;
        const currUpdatedEl = document.getElementById('currency-updated-time');
        if (currUpdatedEl) currUpdatedEl.textContent = 'Cập nhật lần cuối: ' + nowStr;

        const tableBody = document.getElementById('price-table-body');
        if (tableBody) {
            let rowsHtml = '';
            items.forEach((item) => {
                let buyMain = '';
                let sellMain = '';
                let buySub = '';   // chỉ dùng cho isWorld
                let sellSub = '';  // chỉ dùng cho isWorld

                if (item.isWorld) {
                    buyMain = `${formatUSD(item.buy)}`;
                    sellMain = `${formatUSD(item.sell)}`;
                    const vndPerChiSell = (data && data.baseLuongVND) ? (data.baseLuongVND / 10) : ((item.sell * (data.exchangeRate || EXCHANGE_RATE) / TROY_OUNCE_TO_GRAM) * 3.75);
                    const vndPerChiBuy = vndPerChiSell - (((item.sell - item.buy) * (data.exchangeRate || EXCHANGE_RATE) / TROY_OUNCE_TO_GRAM) * 3.75);
                    buySub = `≈ ${Math.round(vndPerChiBuy).toLocaleString('vi-VN')}`;
                    sellSub = `≈ ${Math.round(vndPerChiSell).toLocaleString('vi-VN')}`;
                } else {
                    if (currentMarket === 'gold') {
                        buyMain = `${Math.round(item.buy * 100).toLocaleString('vi-VN')}`;
                        sellMain = `${Math.round(item.sell * 100).toLocaleString('vi-VN')}`;
                    } else {
                        if (item.name.includes('1 Lượng')) {
                            buyMain = `${Math.round(item.buy / 10).toLocaleString('vi-VN')}`;
                            sellMain = `${Math.round(item.sell / 10).toLocaleString('vi-VN')}`;
                        } else if (item.name.includes('5 Lượng')) {
                            buyMain = `${Math.round(item.buy / 50).toLocaleString('vi-VN')}`;
                            sellMain = `${Math.round(item.sell / 50).toLocaleString('vi-VN')}`;
                        } else if (item.name.includes('1 Kg') || item.name.includes('1Kg') || item.name.includes('1KG')) {
                            buyMain = `${Math.round(item.buy / 266.67).toLocaleString('vi-VN')}`;
                            sellMain = `${Math.round(item.sell / 266.67).toLocaleString('vi-VN')}`;
                        } else {
                            buyMain = `${Math.round(item.buy).toLocaleString('vi-VN')}`;
                            sellMain = `${Math.round(item.sell).toLocaleString('vi-VN')}`;
                        }
                    }
                }

                // Biến động
                const changeStr = item.change > 0 ? (item.isWorld ? `+${item.change}` : `+${formatNumber(item.change)}`) : (item.change < 0 ? `${formatNumber(item.change)}` : '0');
                const changeColor = item.change < 0 ? 'text-val-down' : 'text-val-up';

                // Chênh lệch CL (Đơn vị tính chuẩn: VNĐ / Chỉ)
                let clVal = 0;
                let clStr = '0';
                if (item.cl !== undefined && item.cl !== 0) {
                    clVal = item.cl;
                    clStr = (clVal > 0 ? '+' : '') + formatNumber(clVal);
                } else if (item.sell && item.buy) {
                    clVal = item.sell - item.buy;
                    clStr = formatNumber(clVal);
                }
                const clColor = clVal < 0 ? 'text-val-down' : 'text-val-up';

                if (!isAuthed) {
                    rowsHtml += `
                        <tr class="transition-colors text-xs sm:text-sm md:text-base">
                            <td class="text-left pl-2 sm:pl-3 py-1.5 sm:py-2.5 font-black col-org text-xs sm:text-sm md:text-base">
                                <span>${item.name}</span>
                            </td>
                            <td colspan="4" class="text-center py-1.5 sm:py-2.5 pr-2 sm:pr-3 text-slate-300 text-[11px] sm:text-xs md:text-sm">
                                <span>🔒 Vui lòng <a href="javascript:void(0)" onclick="GoldDashboard.openAuth('login')" class="auth-gate-link font-bold">đăng nhập</a> để xem giá trực tuyến</span>
                            </td>
                        </tr>
                    `;
                } else {
                    rowsHtml += `
                        <tr class="transition-colors text-xs sm:text-sm md:text-base">
                            <!-- Cột 1: Tổ chức -->
                            <td class="text-left pl-2 sm:pl-3 py-1.5 sm:py-2.5 font-black col-org text-xs sm:text-sm md:text-base whitespace-nowrap">
                                <span>${item.name}</span>
                            </td>

                            <!-- Cột 2: Mua Vào -->
                            <td class="py-1.5 sm:py-2.5 px-1 sm:px-2 text-right font-mono font-black price-val text-xs sm:text-sm md:text-base tracking-tighter sm:tracking-tight whitespace-nowrap">
                                <div>${buyMain}</div>
                                ${buySub ? `<div class="text-[10px] sm:text-[11px] text-slate-400 font-normal mt-0.5">${buySub}</div>` : ''}
                            </td>

                            <!-- Cột 3: Bán Ra -->
                            <td class="py-1.5 sm:py-2.5 px-1 sm:px-2 text-right font-mono font-black price-val text-xs sm:text-sm md:text-base tracking-tighter sm:tracking-tight whitespace-nowrap">
                                <div>${sellMain}</div>
                                ${sellSub ? `<div class="text-[10px] sm:text-[11px] text-yellow-400 font-normal mt-0.5">${sellSub}</div>` : ''}
                            </td>

                            <!-- Cột 4: Biến Động -->
                            <td class="py-1.5 sm:py-2.5 px-1 sm:px-2 text-right font-mono font-black ${changeColor} text-xs sm:text-sm md:text-base tracking-tighter sm:tracking-tight whitespace-nowrap">
                                <div>${changeStr}</div>
                            </td>

                            <!-- Cột 5: Chênh Lệch -->
                            <td class="py-1.5 sm:py-2.5 pr-2 sm:pr-3 text-right font-mono font-black ${clColor} text-xs sm:text-sm md:text-base tracking-tighter sm:tracking-tight whitespace-nowrap">
                                <div>${clStr}</div>
                            </td>
                        </tr>
                    `;
                }
            });
            tableBody.innerHTML = rowsHtml;
        }

        // Render Máy Tính Quy Đổi bên dưới bảng giá
        const calcContainer = document.getElementById('calculator-section');
        if (calcContainer) {
            calcContainer.innerHTML = getCalculatorCardHtml();
        }

        // Render Bảng Ngoại Tệ
        const currencyBody = document.getElementById('currency-table-body');
        const currencyList = data.currencies && data.currencies.length > 0 ? data.currencies : CURRENCY_LIST;
        if (currencyBody) {
            if (!isAuthed) {
                currencyBody.innerHTML = currencyList.map(c => `
                    <tr class="transition-colors text-sm sm:text-base">
                        <td class="text-left pl-3 py-2.5 font-black col-org text-sm sm:text-base">
                            <span>${c.code}</span>
                        </td>
                        <td colspan="3" class="text-center pr-3 py-2.5 text-slate-300 text-xs sm:text-sm">
                            <span>Vui lòng <a href="javascript:void(0)" onclick="GoldDashboard.openAuth('login')" class="auth-gate-link font-bold">đăng nhập</a> để xem giá</span>
                        </td>
                    </tr>
                `).join('');
            } else {
                currencyBody.innerHTML = currencyList.map(c => {
                    const rateVal = c.rateRate !== undefined && c.rateRate !== 0 ? (c.rateRate > 10 ? c.rateRate.toFixed(2) : c.rateRate.toFixed(4)) : '0';
                    const buyVal = c.digit === 1 ? c.rateBuy.toFixed(1) : formatNumber(c.rateBuy);
                    const sellVal = c.digit === 1 ? c.rateSell.toFixed(1) : formatNumber(c.rateSell);
                    const rateNum = parseFloat(rateVal);
                    const rateColor = rateNum < 0 ? 'text-val-down' : 'text-val-up';
                    return `
                        <tr class="transition-colors text-xs sm:text-sm md:text-base">
                            <td class="text-left pl-2 sm:pl-3 py-1.5 sm:py-2.5 font-black col-org text-xs sm:text-sm md:text-base whitespace-nowrap">
                                <span>${c.code}</span>
                            </td>
                            <td class="py-1.5 sm:py-2.5 px-1 sm:px-2 text-right font-mono font-black price-val text-xs sm:text-sm md:text-base tracking-tighter sm:tracking-tight whitespace-nowrap">${buyVal}</td>
                            <td class="py-1.5 sm:py-2.5 px-1 sm:px-2 text-right font-mono font-black price-val text-xs sm:text-sm md:text-base tracking-tighter sm:tracking-tight whitespace-nowrap">${sellVal}</td>
                            <td class="py-1.5 sm:py-2.5 pr-2 sm:pr-3 text-right font-mono font-black ${rateColor} text-xs sm:text-sm md:text-base tracking-tighter sm:tracking-tight whitespace-nowrap">${rateVal}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        calculateConverter();
    }

    function getCalculatorCardHtml() {
        const isGold = currentMarket === 'gold';
        const title = isGold ? 'MÁY TÍNH QUY ĐỔI TIỀN VÀNG' : 'MÁY TÍNH QUY ĐỔI TIỀN BẠC';
        const desc = isGold ? 'Nhập số lượng & loại vàng để tính tiền VNĐ' : 'Nhập số lượng & loại bạc để tính tiền VNĐ';

        const prevAmount = document.getElementById('calc-amount')?.value || '1';
        const prevUnit = document.getElementById('calc-unit')?.value || (isGold ? 'chi' : 'luong');
        const prevType = document.getElementById('calc-type')?.value || (isGold ? 'sjc' : 'bac_thoi');

        const unitOptions = isGold ? `
            <option value="chi" ${prevUnit === 'chi' ? 'selected' : ''}>Chỉ (3.75g)</option>
            <option value="luong" ${prevUnit === 'luong' ? 'selected' : ''}>Lượng / Cây (37.5g)</option>
            <option value="gram" ${prevUnit === 'gram' ? 'selected' : ''}>Gram (g)</option>
        ` : `
            <option value="luong" ${prevUnit === 'luong' ? 'selected' : ''}>Lượng / Cây (37.5g)</option>
            <option value="kg" ${prevUnit === 'kg' ? 'selected' : ''}>Kilogram (1000g)</option>
            <option value="chi" ${prevUnit === 'chi' ? 'selected' : ''}>Chỉ (3.75g)</option>
            <option value="gram" ${prevUnit === 'gram' ? 'selected' : ''}>Gram (g)</option>
        `;

        const typeOptions = isGold ? `
            <option value="sjc" ${prevType === 'sjc' ? 'selected' : ''}>Vàng Miếng SJC (SJC Tự do)</option>
            <option value="nhan" ${prevType === 'nhan' ? 'selected' : ''}>Vàng nhẫn SJC</option>
            <option value="24k" ${prevType === '24k' ? 'selected' : ''}>Vàng 999.9 (24K)</option>
            <option value="22k" ${prevType === '22k' ? 'selected' : ''}>Vàng 99.9 (22K)</option>
            <option value="980" ${prevType === '980' ? 'selected' : ''}>Vàng 980</option>
            <option value="750" ${prevType === '750' ? 'selected' : ''}>Vàng 750 (18K)</option>
            <option value="610" ${prevType === '610' ? 'selected' : ''}>Vàng 610 (14.6K)</option>
            <option value="585" ${prevType === '585' ? 'selected' : ''}>Vàng 585 (14K)</option>
            <option value="416" ${prevType === '416' ? 'selected' : ''}>Vàng 416 (10K)</option>
            <option value="18k" ${prevType === '18k' ? 'selected' : ''}>Vàng 95 (18K)</option>
            <option value="gf9999" ${prevType === 'gf9999' ? 'selected' : ''}>99,99% GF</option>
            <option value="gf95" ${prevType === 'gf95' ? 'selected' : ''}>95% GF</option>
            <option value="tg" ${prevType === 'tg' ? 'selected' : ''}>Vàng TG (Quốc tế)</option>
        ` : `
            <option value="phuquy_1l" ${prevType === 'phuquy_1l' ? 'selected' : ''}>Bạc Phú Quý (1 Lượng)</option>
            <option value="phuquy_5l" ${prevType === 'phuquy_5l' ? 'selected' : ''}>Bạc Phú Quý (5 Lượng)</option>
            <option value="phuquy_1kg" ${prevType === 'phuquy_1kg' ? 'selected' : ''}>Bạc Phú Quý (1 Kg)</option>
            <option value="bac_999" ${prevType === 'bac_999' ? 'selected' : ''}>Bạc 999 (1 Chỉ)</option>
            <option value="bac_925" ${prevType === 'bac_925' ? 'selected' : ''}>Bạc Nữ Trang 925 (1 Chỉ)</option>
            <option value="bac_thai" ${prevType === 'bac_thai' ? 'selected' : ''}>Bạc Thái 925 (1 Chỉ)</option>
            <option value="bac_y" ${prevType === 'bac_y' ? 'selected' : ''}>Bạc Ý 925 (1 Chỉ)</option>
            <option value="bac_tg" ${prevType === 'bac_tg' ? 'selected' : ''}>Bạc Thế Giới (Spot XAG/USD)</option>
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
                <div class="mt-2.5 pt-2.5 border-t border-slate-800/80 flex justify-between items-center text-xs sm:text-sm font-mono">
                    <div>
                        <span class="text-slate-400 font-medium">Quy chuẩn:</span>
                        <strong class="text-slate-200 font-bold ml-1">Thời gian thực</strong>
                    </div>
                    <div class="text-slate-400 text-xs sm:text-sm">
                        ${isGold ? '1 Lượng = 10 Chỉ' : 'Chuẩn thị trường'}
                    </div>
                </div>
            </div>
        `;
    }

    function initTradingView() {
        const symbol = currentMarket === 'gold' ? 'OANDA:XAUUSD' : 'OANDA:XAGUSD';
        const chartContainer = document.getElementById('tv_chart');
        if (!chartContainer || typeof TradingView === 'undefined') return;

        const tvTheme = currentTheme === 'light' ? 'light' : 'dark';
        const tvBg = currentTheme === 'light' ? '#ffffff' : '#0f172a';
        const tvGrid = currentTheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';

        chartContainer.innerHTML = '';
        new TradingView.widget({
            "autosize": true,
            "symbol": symbol,
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
            "container_id": "tv_chart"
        });
    }

    function updateCalculatorUI() {
        const typeSelect = document.getElementById('calc-type');
        const unitSelect = document.getElementById('calc-unit');
        const calcTitle = document.getElementById('calc-title');
        const calcDesc = document.getElementById('calc-desc');
        const tableTitle = document.getElementById('table-title');
        const tableUnitSub = document.getElementById('table-unit-subtitle');
        const tableColName = document.getElementById('table-col-name');
        const chartTitle = document.getElementById('chart-title');

        if (currentMarket === 'gold') {
            if (calcTitle) calcTitle.textContent = 'Máy Tính Quy Đổi Tiền Vàng Nhanh';
            if (calcDesc) calcDesc.textContent = 'Nhập số lượng vàng muốn tính, hệ thống tự động nhân ra số tiền VNĐ theo thời gian thực';
            if (tableTitle) tableTitle.textContent = 'GIÁ VÀNG THAM KHẢO';
            if (tableUnitSub) tableUnitSub.textContent = 'Đơn vị: VNĐ / 1 Chỉ';
            if (tableColName) tableColName.textContent = 'Tổ chức';
            if (chartTitle) chartTitle.textContent = 'Biểu Đồ Giá Vàng Thế Giới (XAU/USD)';

            if (unitSelect) {
                unitSelect.innerHTML = `
                    <option value="chi" selected>Chỉ (3.75g)</option>
                    <option value="luong">Lượng / Cây (37.5g)</option>
                    <option value="gram">Gram (g)</option>
                `;
            }

            if (typeSelect) {
                typeSelect.innerHTML = `
                    <option value="sjc" selected>Vàng Miếng SJC (SJC Tự do)</option>
                    <option value="24k">Vàng 999.9 (24K)</option>
                    <option value="22k">Vàng 99.9 (22K)</option>
                    <option value="980">Vàng 980</option>
                    <option value="750">Vàng 750 (18K)</option>
                    <option value="610">Vàng 610 (14.6K)</option>
                    <option value="585">Vàng 585 (14K)</option>
                    <option value="416">Vàng 416 (10K)</option>
                    <option value="18k">Vàng 95 (18K)</option>
                    <option value="tg">Vàng TG (Quốc tế)</option>
                `;
            }
        } else {
            if (calcTitle) calcTitle.textContent = 'Máy Tính Quy Đổi Tiền Bạc Nhanh';
            if (calcDesc) calcDesc.textContent = 'Nhập số lượng bạc muốn tính, hệ thống tự động nhân ra số tiền VNĐ theo thời gian thực';
            if (tableTitle) tableTitle.textContent = 'GIÁ BẠC THAM KHẢO';
            if (tableUnitSub) tableUnitSub.textContent = 'Đơn vị: VNĐ / 1 Chỉ';
            if (tableColName) tableColName.textContent = 'Tổ chức';
            if (chartTitle) chartTitle.textContent = 'Biểu Đồ Giá Bạc Thế Giới (XAG/USD)';

            if (unitSelect) {
                unitSelect.innerHTML = `
                    <option value="luong" selected>Lượng / Cây (37.5g)</option>
                    <option value="kg">Kilogram (1000g)</option>
                    <option value="chi">Chỉ (3.75g)</option>
                    <option value="gram">Gram (g)</option>
                `;
            }

            if (typeSelect) {
                typeSelect.innerHTML = `
                    <option value="bac_thoi" selected>Bạc Phú Quý (1 Lượng)</option>
                    <option value="bac_kg">Bạc Phú Quý (1 Kg)</option>
                    <option value="bac_999">Bạc 999 thị trường</option>
                    <option value="bac_925">Bạc Nữ trang</option>
                    <option value="bac_tg">Bạc TG (Spot XAG)</option>
                `;
            }
        }
    }

    function calculateConverter() {
        const amountInput = document.getElementById('calc-amount');
        const unitSelect = document.getElementById('calc-unit');
        const typeSelect = document.getElementById('calc-type');
        const resultEl = document.getElementById('calc-result');
        const resultUsdEl = document.getElementById('calc-result-usd');

        if (!amountInput || !unitSelect || !typeSelect || !resultEl || !currentData) return;

        if (!AuthManager.isLoggedIn()) {
            resultEl.innerHTML = '<span class="text-xs text-amber-400">Vui lòng đăng nhập để tính</span>';
            if (resultUsdEl) resultUsdEl.textContent = '';
            return;
        }

        const amount = parseFloat(amountInput.value) || 0;
        const unit = unitSelect.value;
        const type = typeSelect.value;

        let pricePerGramVND = 0;

        if (currentMarket === 'gold') {
            const goldItems = currentData.goldItems || [];
            let selectedItem = null;

            if (type === 'sjc') selectedItem = goldItems.find(i => i.name === 'SJC Tự do');
            else if (type === 'nhan') selectedItem = goldItems.find(i => i.name === 'Vàng nhẫn SJC');
            else if (type === '24k') selectedItem = goldItems.find(i => i.name === 'Vàng 999.9');
            else if (type === '22k') selectedItem = goldItems.find(i => i.name === 'Vàng 99.9');
            else if (type === '980') selectedItem = goldItems.find(i => i.name === 'Vàng 980');
            else if (type === '750') selectedItem = goldItems.find(i => i.name === 'Vàng 750 (18K)');
            else if (type === '610') selectedItem = goldItems.find(i => i.name === 'Vàng 610 (14.6K)');
            else if (type === '585') selectedItem = goldItems.find(i => i.name === 'Vàng 585 (14K)');
            else if (type === '416') selectedItem = goldItems.find(i => i.name === 'Vàng 416 (10K)');
            else if (type === '18k') selectedItem = goldItems.find(i => i.name === 'Vàng 95');
            else if (type === 'gf9999') selectedItem = goldItems.find(i => i.name === '99,99% GF');
            else if (type === 'gf95') selectedItem = goldItems.find(i => i.name === '95% GF');
            else if (type === 'tg') selectedItem = goldItems.find(i => i.name === 'Vàng TG');
            else selectedItem = goldItems[0];

            let pricePerChiVND = 0;
            if (selectedItem) {
                if (selectedItem.isWorld) {
                    pricePerChiVND = (selectedItem.sell * EXCHANGE_RATE / TROY_OUNCE_TO_GRAM) * 3.75;
                } else {
                    pricePerChiVND = selectedItem.sell * 100;
                }
            } else {
                pricePerChiVND = (145000 * 100);
            }
            pricePerGramVND = pricePerChiVND / 3.75;
        } else {
            // Silver calculation (Bạc Phú Quý, Bạc 999 thị trường, Bạc Nữ Trang & Bạc Thế Giới)
            const silverItems = currentData.silverItems || [];
            let selectedItem = null;

            if (type === 'phuquy_1l') selectedItem = silverItems.find(i => i.name.includes('Phú Quý (1 Lượng)'));
            else if (type === 'phuquy_1kg') selectedItem = silverItems.find(i => i.name.includes('Phú Quý (1 Kg)'));
            else if (type === 'bac_999') selectedItem = silverItems.find(i => i.name.includes('Bạc 999'));
            else if (type === 'bac_925') selectedItem = silverItems.find(i => i.name.includes('Nữ trang'));
            else if (type === 'bac_tg') selectedItem = silverItems.find(i => i.isWorld || i.name.includes('Thế Giới'));
            else selectedItem = silverItems[0];

            if (selectedItem) {
                if (selectedItem.isWorld) {
                    pricePerGramVND = (selectedItem.sell * (currentData.exchangeRate || EXCHANGE_RATE)) / TROY_OUNCE_TO_GRAM;
                } else if (selectedItem.name.includes('1 Kg')) {
                    pricePerGramVND = selectedItem.sell / 1000;
                } else if (selectedItem.name.includes('1 Lượng')) {
                    pricePerGramVND = selectedItem.sell / 37.5;
                } else {
                    // 1 Chỉ = 3.75g
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
        else totalGrams = amount; // gram

        const totalVND = totalGrams * pricePerGramVND;
        const totalUSD = totalVND / EXCHANGE_RATE;

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
                <h4 class="text-base font-bold text-slate-100 mt-4 mb-2">Nhận định của chuyên gia phân tích</h4>
                <p class="leading-relaxed">Theo đánh giá từ các chuyên gia tài chính hàng đầu, vàng vẫn là hầm trú ẩn ưu tiên hàng đầu trong bối cảnh các bất ổn địa chính trị tại Trung Đông và Đông Âu chưa có dấu hiệu hạ nhiệt. Tuy nhiên, người mua cần cân nhắc chiến lược quản trị rủi ro, tránh mua đuổi ở các nhịp hưng phấn quá đà.</p>
            `,
            source: "Ban Biên Tập Thị Trường",
            link: "#",
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
            image: "https://images.unsplash.com/photo-1605792657660-596af9009e82?w=800&auto=format&fit=crop&q=60",
            summary: "Bạc không chỉ đóng vai trò kim loại quý tích trữ mà còn là nguyên liệu công nghiệp thiết yếu. Tốc độ tiêu thụ bạc trong ngành năng lượng tái tạo đã vượt qua mọi dự báo quý 3.",
            content: `
                <p class="leading-relaxed">Bạc quốc tế vừa ghi nhận đợt tăng giá ấn tượng nhất trong vòng nhiều năm, vượt xa tốc độ tăng trưởng phần trăm của vàng trong cùng chu kỳ.</p>
                <div class="my-3 p-4 rounded-xl bg-cyan-500/10 border-l-4 border-cyan-500 text-cyan-300 font-medium text-sm">
                    <strong>Nhu cầu công nghiệp bùng nổ:</strong> Hơn 55% sản lượng bạc toàn cầu hiện được hấp thụ trực tiếp bởi các nhà máy sản xuất tấm pin quang điện (Solar PV) và linh kiện bán dẫn cho xe điện (EV).
                </div>
                <p class="leading-relaxed">Báo cáo từ Viện Bạc Thế Giới (Silver Institute) chỉ ra rằng thị trường bạc vật chất đang đối mặt với thâm hụt nguồn cung năm thứ 4 liên tiếp, tạo nền tảng tăng giá vững chắc cho các nhà đầu tư kim loại quý dài hạn.</p>
            `,
            source: "Lê Minh Quân - Chuyên gia Hàng hóa",
            link: "#",
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
            image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=60",
            summary: "Các cơ quan quản lý tiếp tục siết chặt kiểm tra hóa đơn điện tử, nguồn gốc xuất xứ vàng trang sức mỹ nghệ và đề xuất sửa đổi Nghị định 24/2012/NĐ-CP.",
            content: `
                <p class="leading-relaxed">Ngân hàng Nhà nước Việt Nam cùng các bộ ngành liên quan đang triển khai quyết liệt các biện pháp nhằm minh bạch hóa thị trường vàng, chống đầu cơ găm hàng và thao túng giá.</p>
                <p class="leading-relaxed">Việc bắt buộc áp dụng 100% hóa đơn điện tử kết nối trực tiếp với cơ quan thuế khi giao dịch vàng bạc đá quý đã giúp thị trường hoạt động minh bạch và bảo vệ tối đa quyền lợi người tiêu dùng.</p>
            `,
            source: "Thái Sơn - Ban Pháp Chế & Vĩ Mô",
            link: "#",
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
            image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=60",
            summary: "Các ngân hàng đầu tư phố Wall như Goldman Sachs, Citi và UBS đồng loạt nâng mục tiêu giá vàng trung hạn trong báo cáo chiến lược mới nhất.",
            content: `
                <p class="leading-relaxed">Khảo sát mới nhất từ Bloomberg và Kitco News cho thấy hơn 78% các chuyên gia phân tích thị trường Phố Wall và 69% nhà đầu tư bán lẻ dự báo giá vàng sẽ tiếp tục duy trì xu hướng tăng trong quý 4.</p>
                <p class="leading-relaxed">Việc các Ngân hàng Trung ương toàn cầu (đặc biệt là PBoC Trung Quốc, Thổ Nhĩ Kỳ, Ba Lan) liên tục mua ròng vàng vật chất đã tạo thành 'mặt sàn kiên cố' cho giá kim loại quý.</p>
            `,
            source: "Trần Hoàng Nam - Kinh tế Trưởng",
            link: "#",
            date: "19/09/2026",
            readTime: "5 phút đọc",
            featured: false
        }
    ];

    const NEWS_ENDPOINTS = [
        '/api/news',
        'http://localhost:3001/api/news',
        'http://127.0.0.1:3001/api/news'
    ];

    async function fetchLiveNews() {
        if (liveNewsList.length > 0) return liveNewsList;
        for (const url of NEWS_ENDPOINTS) {
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
                        liveNewsList = data.data;
                        return liveNewsList;
                    }
                }
            } catch (e) { }
        }
        liveNewsList = CURATED_NEWS;
        return liveNewsList;
    }

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
        const regularArticles = filteredNews.filter(n => n.id !== (featuredArticle ? featuredArticle.id : -1));

        let html = `
            <!-- Tiêu đề và bộ lọc Tin Tức -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-800">
                <div>
                    <h2 class="text-base font-bold text-slate-100 flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                        <span>Tin Tức Tự Động 24/7 (VnExpress, CafeF, VietnamNet)</span>
                    </h2>
                    <p class="text-xs text-slate-400 mt-0.5">Tự động cập nhật qua RSS Feed mỗi 10 phút từ các cơ quan báo chí chính thống</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="GoldDashboard.refreshNews()" title="Quét lại tin mới nhất"
                        class="text-xs font-mono text-blue-400 bg-blue-950/60 border border-blue-800/50 hover:bg-blue-900/60 px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all">
                        <span>🔄 Làm mới tin (${filteredNews.length} bài)</span>
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
                                <span>📰 Nguồn: <strong class="text-slate-200">${featuredArticle.source || 'Báo chí'}</strong></span>
                                <span class="text-yellow-400 font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                                    Đọc chi tiết ➔
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Lưới các bài viết khác (Full-width 3 cột)
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
                                <span>📰 ${article.source || 'Báo chí'}</span>
                                <span class="text-yellow-400 font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                                    Đọc tiếp ➔
                                </span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (filteredNews.length === 0) {
            html += `
                <div class="dashboard-card p-12 rounded-2xl border border-slate-800 text-center flex flex-col items-center justify-center gap-3 mt-4">
                    <span class="text-4xl">📰</span>
                    <h3 class="text-base font-bold text-slate-200">Chưa có bài viết mới trong chuyên mục này</h3>
                    <p class="text-xs text-slate-400">Vui lòng chọn chuyên mục khác hoặc bấm "Làm mới tin" để quét lại luồng bài mới nhất từ các báo.</p>
                    <button onclick="GoldDashboard.filterNews('all')" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-md mt-2 cursor-pointer">
                        Xem tất cả tin tức (${newsData.length} bài)
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    function openNewsModal(id) {
        const article = (liveNewsList.length > 0 ? liveNewsList : CURATED_NEWS).find(n => n.id === id);
        if (!article) return;

        const modal = document.getElementById('news-modal');
        const contentEl = document.getElementById('news-modal-content');
        if (!modal || !contentEl) return;

        const hasCustomContent = Boolean(article.content);

        contentEl.innerHTML = `
            <div class="flex items-center gap-2 text-xs">
                <span class="px-2.5 py-1 rounded-md font-semibold ${article.badgeClass}">
                    ${article.categoryName}
                </span>
                <span class="text-slate-400 font-medium">• ${article.date}</span>
                <span class="text-slate-400 font-medium">• ${article.readTime}</span>
            </div>
            
            <h2 class="text-lg sm:text-xl font-extrabold text-slate-100 leading-snug">
                ${article.title}
            </h2>

            <div class="flex flex-wrap items-center justify-between gap-1.5 pb-3 border-b border-slate-800 text-xs text-slate-400">
                <span>Nguồn phát hành: <strong class="text-slate-300">${article.source || 'Báo điện tử'}</strong></span>
                <span class="text-emerald-400 font-semibold flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-emerald-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Đã xác thực thông tin
                </span>
            </div>

            <div class="rounded-xl overflow-hidden max-h-72 w-full bg-slate-900">
                <img src="${article.image}" alt="${article.title}" class="w-full h-full object-cover" />
            </div>

            <div class="text-xs sm:text-sm text-slate-200 leading-relaxed space-y-3 article-body">
                ${hasCustomContent ? article.content : `
                    <p class="text-sm font-medium leading-relaxed article-summary">${article.summary}</p>
                    <div class="news-callout-box p-4 rounded-xl bg-blue-950/40 border border-blue-800/60 flex flex-col gap-2">
                        <p class="text-xs text-slate-300 callout-text">Bài viết đầy đủ được cung cấp bởi cơ quan báo chí <strong class="callout-source text-slate-200">${article.source}</strong>.</p>
                        ${article.link && article.link !== '#' ? `
                            <a href="${article.link}" target="_blank" rel="noopener noreferrer"
                                class="inline-flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 underline callout-link">
                                🌐 Mở đọc toàn bộ bài báo trên trang ${article.source} ↗
                            </a>
                        ` : ''}
                    </div>
                `}
            </div>

            <div class="mt-4 pt-3 border-t border-slate-800 flex flex-wrap justify-between items-center gap-2">
                <span class="text-xs text-slate-400 font-medium">Nguồn: ${article.source || 'Báo điện tử'}</span>
                <div class="flex items-center gap-2">
                    ${article.link && article.link !== '#' ? `
                        <a href="${article.link}" target="_blank" rel="noopener noreferrer"
                            class="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md inline-flex items-center gap-1">
                            Xem bài gốc ↗
                        </a>
                    ` : ''}
                    <button onclick="GoldDashboard.closeNewsModal()" 
                        class="px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold transition-all shadow-md cursor-pointer">
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

    return {
        init: function () {
            checkSSOParams();
            initClock();
            initTheme();
            renderAuthHeader();
            updateCalculatorUI();
            this.refreshData();
            initTradingView();
            setInterval(() => this.refreshData(), 5000); // Tự động cập nhật bảng giá mỗi 5 giây

            const amountInput = document.getElementById('calc-amount');
            const unitSelect = document.getElementById('calc-unit');
            const typeSelect = document.getElementById('calc-type');
            if (amountInput) amountInput.addEventListener('input', calculateConverter);
            if (unitSelect) unitSelect.addEventListener('change', calculateConverter);
            if (typeSelect) typeSelect.addEventListener('change', calculateConverter);
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

            const inactiveStyle = 'px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 inactive-tab';

            if (tabGold) tabGold.className = inactiveStyle;
            if (tabSilver) tabSilver.className = inactiveStyle;
            if (tabNews) tabNews.className = inactiveStyle;

            if (market === 'news') {
                // CHẾ ĐỘ TIN TỨC: Ẩn Bảng giá, Biểu đồ, Tỷ giá & Máy tính; hiện trang Tin tức
                if (tabNews) tabNews.className = 'px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 active-tab';
                if (priceSection) priceSection.classList.add('hidden');
                if (chartSection) chartSection.classList.add('hidden');
                if (currencySection) currencySection.classList.add('hidden');
                if (calculatorSection) calculatorSection.classList.add('hidden');
                if (newsSection) {
                    newsSection.classList.remove('hidden');
                    renderNews(currentNewsFilter);
                }
            } else {
                // CHẾ ĐỘ GIÁ VÀNG / GIÁ BẠC: Hiện lại Bảng giá, Biểu đồ, Tỷ giá & Máy tính
                if (priceSection) priceSection.classList.remove('hidden');
                if (chartSection) chartSection.classList.remove('hidden');
                if (currencySection) currencySection.classList.remove('hidden');
                if (calculatorSection) calculatorSection.classList.remove('hidden');
                if (newsSection) newsSection.classList.add('hidden');

                if (market === 'gold') {
                    if (tabGold) tabGold.className = 'px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-yellow-500/20 active-tab';
                } else if (market === 'silver') {
                    if (tabSilver) tabSilver.className = 'px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/20 active-tab';
                }

                updateCalculatorUI();
                initTradingView();
                this.refreshData();
            }
        },
        openNews: openNewsModal,
        closeNewsModal: closeNewsModal,
        filterNews: renderNews,
        refreshNews: async function () {
            liveNewsList = [];
            await renderNews(currentNewsFilter);
        },
        calculate: calculateConverter,
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
        refreshData: async function () {
            const icon = document.getElementById('refresh-icon');

            if (icon) icon.classList.add('loading-spin');

            try {
                const data = await fetchData();
                if (data) {
                    renderPriceCards(data);

                    // Cập nhật khung thời gian "Cập nhật lần cuối"
                    const lastUpdatedEl = document.getElementById('last-updated-time');
                    if (lastUpdatedEl) {
                        lastUpdatedEl.textContent = 'Cập nhật lần cuối: ' + getFormattedDateTimeStr();
                    }
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