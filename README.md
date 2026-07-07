# 煚煚抓壞蛋 — three.js + WebXR AR Demo

拿案展示品：**傳連結即玩、零安裝**。展示「雲端 AI 生成 3D 資產 → 瀏覽器互動遊戲 → 手機掃碼 AR」完整工作流。

**正式網址：https://monster-catch.pages.dev/**（Cloudflare Pages；QR code＝`QR掃碼即玩_新網域.png`）

## 玩法

點擊壞蛋得分，60 秒內抓越多越好。連續命中有 Combo。

## 技術棧

- **three.js r172**（本地 vendor，不依賴 CDN）
- **WebXR immersive-ar + hit-test**：Android Chrome 掃碼進 AR，把遊戲放進現實空間
- **3D 資產**：Meshy 雲端 AI 生成（`assets/monster.glb`，未到位時自動 fallback 程序化佔位怪獸）
- 純靜態網頁，無 build step，任何靜態主機可部署

## 部署需知

- **必須 HTTPS**（WebXR 安全上下文要求），GitHub Pages 即符合；純 http/IP 分享時 Android 也進不了 AR。
- 本地開發：`python -m http.server 8300`（localhost 視同安全上下文）。

## 裝置支援（誠實邊界）

| 裝置 | 3D 遊戲 | AR 模式 |
|------|---------|---------|
| 桌面瀏覽器 | ✅ | ❌（顯示提示） |
| Android Chrome | ✅ | ✅ WebXR |
| iPhone Safari | ✅ | ❌ iOS 不支援 WebXR（顯示提示，現場改用 Android 機演示） |
| 舊瀏覽器（不支援 import map） | ❌ 顯示升級提示 | ❌ |

## 替換 Meshy 資產

把 GLB 放到 `assets/monster.glb` 即自動載入（會自動正規化尺寸與置中）；同時把 `index.html` 的「示意版」小字移除。

## 檔案結構

- `index.html` / `style.css` / `main.js` — 全部邏輯
- `DESIGN.md` — Stitch 設計規範（UI 唯一事實來源）
- `vendor/` — three.js r172 本地檔（注意 `three.module.min.js` 依賴 `three.core.min.js`，兩檔都要在）

<!--
who: Claude Fable 5（three.js AR Demo session，2026-07-07）
what: v1.0 初版
why: 垂直領域 AI 落地 Demo（note_todo_threejs_demo_build），Opus 覆核 R1+5Y 已修
-->
