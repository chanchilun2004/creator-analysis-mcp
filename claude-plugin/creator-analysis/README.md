# creator-analysis

Instagram creator/KOL 合作評估 plugin。輸入 creator 名或 @handle，即時研究公開數據並喺對話入面顯示互動 GUI 分析報告，協助決定是否合作。

## 功能
- 單一 creator 深度分析：基本數據（followers、ER）、受眾匹配、過往品牌合作、風險審查、加權評分同合作建議
- 多人比較模式：用戶自行提供多個 handle 時輸出比較表
- 預設品牌 lens：F&B、Beauty、FMCG（可指定其他行業）
- 輸出：對話內互動儀表板（無 widget 工具時自動 fallback 做文字報告）

## 用法（固定三步）
1. 輸入你的品牌 IG（可選，用作受眾匹配基準）
2. 輸入目標分析 KOL 的 IG handle
3. 取得報告（對話內 GUI 儀表板）

直接說「分析 @handle 值不值得合作」或用 command：`/creator-report @目標KOL @你的品牌IG`

## 組件
- Skill `creator-analysis`：分析方法、基準數據、報告規格
- Command `/creator-report`：快速觸發

## 資料來源
主數據經 creator-analysis MCP connector（實測 ER、假粉評分、受眾輪廓）；未連接時會顯示 connector 設定指示。輔以公開資料（新聞/討論區）補充爭議史等，估算數字會標明。

## 前置需求
需連接 creator-analysis MCP connector（Settings → Connectors → Add custom connector），詳見 skill 內 references/api-reference.md。
