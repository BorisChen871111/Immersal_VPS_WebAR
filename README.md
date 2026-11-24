# 高鐵探索館 WebAR

使用 Immersal VPS 定位展區，在固定座標播放 PNG 序列圖，並以「下一頁」切換動畫。包含訪客介面與獨立的 VPS 點位測試頁。

1. 將 `webar.local.example.json` 複製為 `webar.local.json`，在本機填入 Developer Token 和數字 Map ID。Git 會忽略此檔。
2. 執行 `Start_Visitor_WebAR.cmd`，在這台電腦開啟 `http://127.0.0.1:8767/`。使用 `/?preview=1` 可只看序列圖。
3. 換素材時，在 `dist/js/visit-sequences.js` 設定順序及幀率。展點的 `anchor` 使用該地圖的 X、Y、Z 座標，`yaw` 為 Y 軸角度。

手機臨時測試可執行 `node serve-webar.mjs --phone-test`，再以 HTTPS tunnel 轉發至本機 8768。把伺服器印出的 `#test=…` 片段加在 HTTPS 網址結尾。完整網址可解密測試設定，只分享給測試人員。關閉伺服器即可讓該網址失效。GitHub 倉庫僅保存原始碼與素材。

## GitHub Pages 與自己的網域

在 Settings → Pages 將 Source 選為 GitHub Actions。沒有設定 `VPS_API_BASE` 時，Pages 會顯示無相機的序列圖預覽。

要啟用定位，在有 HTTPS 的伺服器執行 `node serve-webar.mjs --public-vps`。將 `IMMERSAL_CONFIG_JSON` 設為私密環境變數（結構同範例設定），或在主機上使用本機設定檔。用 `VPS_ALLOWED_ORIGINS` 指定可呼叫 API 的前端 origin（逗號分隔、不加路徑）。若前後端在同一網域，設定 `VPS_PUBLIC_ORIGIN`。伺服器預設綁定 loopback，可由 HTTPS 反向代理導入；容器環境可以設定 `VPS_BIND` 和 `PORT`。

在 GitHub Settings → Secrets and variables → Actions → Variables 將 `VPS_API_BASE` 設為 API 主機的 HTTPS 網址，重新執行 Pages workflow。自訂前端網域時，更新允許的 origin 和 Pages 的 Custom domain，並依 GitHub 指示設定 DNS。公開模式的相機畫格會送到 Immersal 定位。Token 與原始 Map ID 留在伺服器，Pages 只包含 API 網址與公開素材。

## 三展區測試

開啟 `test.html`（本機可用 `?zones=test`），先開啟後鏡頭，再用三個按鈕模擬定位。展區沿用同一個相機串流，切站或按「模擬失去定位」會清掉前站內容。測試模式不呼叫 VPS。照片會在裝置上合成；若手機擋下自動下載，可以點預覽上的「儲存照片」。

正式地圖完成後，在伺服器設定的各個 `maps` 項目中填入 `experience`，可用 `train`、`photo`、`face`。既有設定預設為 `train`。正式模式的場域定位與臉部特效共用後鏡頭。
