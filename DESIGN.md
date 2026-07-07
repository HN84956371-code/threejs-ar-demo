# DESIGN.md — 煚煚抓壞蛋 — three.js + WebXR AR Demo

> 依 Stitch 設計系統規範產生（2026-07-07）。本檔為 UI/UX 唯一事實來源（source of truth），所有 HTML/CSS/元件實作必須參照本檔的色彩、字型、元件、動效規則。

## 專案定位

- **用途**：AI 落地顧問「拿案敲門磚」Demo — 傳連結即玩、零安裝。
- **目標客群**：3D 動畫 / AR / 裸視 3D 領域潛在客戶（第五位朋友）。
- **展示訊息**：雲端 AI 生成 3D 資產（Meshy）→ 瀏覽器互動遊戲 → 手機掃碼 AR，全程免 App。
- **平台**：Web，**行動優先**（客戶用手機掃 QR code 開啟），桌面瀏覽器完整支援。

## 整體氛圍（Vibe）

深色遊戲風（Dark Arcade）＋活潑可愛。深色背景讓 3D 場景與霓虹色 HUD 突出；圓潤大按鈕與彈跳動效呼應「可愛小怪獸」主題。專業但不嚴肅 — 這是給客戶看「AI 能做到什麼」的展示品。

## 設計系統（Design Tokens）

### 色彩

| 角色 | 名稱 | Hex | 用途 |
|------|------|-----|------|
| Background | 深空黑 | `#0D0F1A` | 頁面底色、3D 場景背景 |
| Surface | 星夜藍 | `#1A1E2E` | 面板、卡片、對話框 |
| Primary Action | 怪獸綠 | `#4ADE80` | 開始遊戲、主要 CTA、得分正回饋 |
| Secondary Action | 電光紫 | `#A78BFA` | AR 模式按鈕、次要操作 |
| Accent | 亮橘 | `#FB923C` | 倒數計時警示（≤10 秒）、combo 提示 |
| Text Primary | 月光白 | `#F1F5F9` | 主要文字 |
| Text Secondary | 霧灰 | `#94A3B8` | 說明文字、頁腳 |
| Danger | 警示紅 | `#F87171` | 錯誤訊息、不支援提示 |

- 所有文字對比度須達 WCAG AA（深底亮字，上表組合皆通過）。
- 3D 場景內怪獸主色可自由，但 UI 層嚴守上表。

### 字型

- **標題／分數**：系統字型堆疊 `"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif`，粗體（700–900）。
- **內文**：同堆疊，Regular（400）。
- **數字（分數、倒數）**：`font-variant-numeric: tabular-nums`，避免跳動。
- 尺寸階層（行動）：分數 HUD 28px／標題 32px／按鈕 18px／內文 15px／頁腳 12px。

### 圓角與陰影

- **圓角**：按鈕與卡片 16px（圓潤可愛）；HUD 膠囊徽章 999px（full round）。
- **陰影／發光**：主按鈕用同色系柔光 `box-shadow: 0 0 24px rgba(74,222,128,.35)`；面板用 `0 8px 32px rgba(0,0,0,.5)`。
- **玻璃擬態（glassmorphism）**：HUD 與覆蓋層用 `background: rgba(26,30,46,.72); backdrop-filter: blur(12px)`，讓 3D 場景透出。

## 畫面結構（Page Structure）

單頁應用，四個狀態層疊在全螢幕 three.js `<canvas>` 之上：

### 1. 開始畫面（Start Overlay）
- 置中卡片（玻璃擬態）：遊戲標題「煚煚抓壞蛋」＋一句玩法說明「點擊壞蛋得分，60 秒內抓越多越好！」
- **主 CTA**：怪獸綠大按鈕「開始遊戲」（最小點擊區 48px 高、寬 ≥ 240px）。
- **次 CTA**：電光紫按鈕「AR 模式 📱」— 僅在裝置支援 WebXR immersive-ar 時顯示；不支援時顯示霧灰說明文字（見誠實邊界）。
- 底部霧灰小字：「雲端 AI 生成 3D 資產 × three.js × WebXR｜免安裝 App」。

### 2. 遊戲 HUD（Game HUD）
- **左上**：分數膠囊徽章「⭐ 分數」（怪獸綠字）。
- **右上**：倒數膠囊徽章「⏱ 秒數」；≤10 秒轉亮橘並脈動（pulse）。
- **點擊回饋**：命中時在點擊位置浮出「+1」（怪獸綠，上飄淡出 600ms）；連續命中顯示「Combo ×N」（亮橘）。
- HUD 不攔截 3D 場景的點擊（`pointer-events: none`，徽章本身除外）。

### 3. 結束畫面（End Overlay）
- 置中卡片：「時間到！」＋大字分數＋歷史最佳（localStorage）。
- 主 CTA「再玩一次」（怪獸綠）；次 CTA「AR 模式」（電光紫，支援時）。
- 分享提示：「把這個連結傳給朋友挑戰！」

### 4. AR 模式（AR Session）
- 進入後顯示引導提示（玻璃擬態橫幅，頂部）：「對準地面移動手機，點擊放置遊戲場地」。
- 放置後 HUD 同遊戲畫面；退出按鈕（右上 ✕）。

## 動效（Motion）

- 怪獸生成：scale 0→1 彈跳（cubic-bezier(.34,1.56,.64,1)，300ms）。
- 怪獸被抓：squash 壓扁＋淡出（200ms）＋「+1」浮字。
- 怪獸閒置：緩慢上下漂浮＋左右搖擺（idle bob，2s loop）。
- 覆蓋層進出：opacity + translateY(12px)，250ms ease-out。
- 尊重 `prefers-reduced-motion`：關閉裝飾性動效，保留必要狀態變化。

## 誠實邊界（UI 文案必守）

- **iOS Safari 不支援 WebXR AR**：iPhone 用戶顯示「AR 模式需要 Android Chrome。iPhone 請先玩 3D 版，AR 版可現場用 Android 機演示」— 不誇大、不隱瞞。
- 佔位模型階段，開始畫面加霧灰小字「3D 角色由雲端 AI 生成（示意版）」；Meshy 正式資產上線後移除。

## 響應式規則

- 行動直式為基準；橫式與桌面時卡片最大寬 420px 置中。
- 3D canvas 永遠滿版（100dvh），UI 絕不產生水平捲動。
- 安全區：HUD 與按鈕避開瀏海 `env(safe-area-inset-*)`。

<!--
who: Claude Fable 5（three.js AR Demo session，2026-07-07）
what: v1.0 初版 DESIGN.md
why: 依 feedback_stitch_design_md 規則，前端專案動工前先立設計規範
-->
