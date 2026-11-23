# 高鐵探索館 WebAR

使用 Immersal VPS 定位展區，在固定座標播放 PNG 序列圖，並以「下一頁」切換動畫。包含訪客介面與獨立的 VPS 點位測試頁。

1. 將 `webar.local.example.json` 複製為 `webar.local.json`，在本機填入 Developer Token 和數字 Map ID。Git 會忽略此檔。
2. 執行 `Start_Visitor_WebAR.cmd`，在這台電腦開啟 `http://127.0.0.1:8767/`。使用 `/?preview=1` 可只看序列圖。
3. 換素材時，在 `dist/js/visit-sequences.js` 設定順序及幀率。展點的 `anchor` 使用該地圖的 X、Y、Z 座標，`yaw` 為 Y 軸角度。

手機臨時測試可執行 `node serve-webar.mjs --phone-test`，再以 HTTPS tunnel 轉發至本機 8768。把伺服器印出的 `#test=…` 片段加在 HTTPS 網址結尾。完整網址可解密測試設定，只分享給測試人員。關閉伺服器即可讓該網址失效。GitHub 倉庫僅保存原始碼與素材。
