/**
 * Knowledge base mapping technical issue IDs to business-friendly descriptions.
 * This is the "intelligence layer" that transforms technical jargon into stakeholder language.
 * Supports Traditional Chinese (Taiwan) and English.
 */

import type { Locale } from '../utils/i18n.js';

/**
 * Localized string with translations for each supported locale.
 */
export interface LocalizedString {
  en: string;
  'zh-TW': string;
}

/**
 * Entry in the knowledge base for a specific issue type.
 */
export interface KnowledgeEntry {
  /** Business impact description (for decision-makers) */
  businessImpact: LocalizedString;
  /** How difficult is this to fix */
  fixDifficulty: 'Low' | 'Medium' | 'High';
  /** Estimated time to fix */
  estimatedEffort: LocalizedString;
  /** Expected improvement after fixing */
  expectedOutcome: LocalizedString;
}

/**
 * Resolved knowledge entry with strings for a specific locale.
 */
export interface ResolvedKnowledgeEntry {
  businessImpact: string;
  fixDifficulty: 'Low' | 'Medium' | 'High';
  estimatedEffort: string;
  expectedOutcome: string;
}

/**
 * Knowledge base mapping issue IDs to business context.
 */
export const KNOWLEDGE_BASE: Record<string, KnowledgeEntry> = {
  // ===== Security Issues =====
  'ZAP-10035': {
    businessImpact: {
      en: 'Data leak risk: Attackers can intercept user communications via SSL stripping attacks, stealing credentials or credit card numbers',
      'zh-TW': '資料外洩風險：攻擊者可透過 SSL 剝離攻擊攔截使用者通訊，竊取帳號密碼或信用卡號碼',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Ensure 100% encrypted transmission, meeting PCI-DSS and other security compliance requirements',
      'zh-TW': '確保 100% 加密傳輸，符合 PCI-DSS 等安全合規要求',
    },
  },
  'ZAP-10038': {
    businessImpact: {
      en: 'Malicious code injection: Site is vulnerable to cross-site scripting (XSS), allowing attackers to inject malicious scripts that steal cookies or modify page content',
      'zh-TW':
        '惡意程式碼注入：網站存在跨站腳本（XSS）漏洞，攻擊者可注入惡意腳本竊取 Cookie 或竄改頁面內容',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '4-8 hours', 'zh-TW': '4-8 小時' },
    expectedOutcome: {
      en: 'Significantly reduce XSS attack surface, protecting user account security',
      'zh-TW': '大幅降低 XSS 攻擊面，保護使用者帳號安全',
    },
  },
  'ZAP-10038-1': {
    businessImpact: {
      en: 'No Content Security Policy: Site lacks defense against XSS and data injection attacks',
      'zh-TW': '缺少內容安全政策：網站缺乏對 XSS 和資料注入攻擊的防禦',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '4-8 hours', 'zh-TW': '4-8 小時' },
    expectedOutcome: {
      en: 'CSP header provides defense-in-depth against code injection attacks',
      'zh-TW': 'CSP 標頭提供對程式碼注入攻擊的縱深防禦',
    },
  },
  'ZAP-10055': {
    businessImpact: {
      en: 'Weak Content Security Policy: Current CSP configuration has gaps that could be exploited',
      'zh-TW': '內容安全政策配置薄弱：目前的 CSP 配置存在可被利用的漏洞',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '2-4 hours', 'zh-TW': '2-4 小時' },
    expectedOutcome: {
      en: 'Properly configured CSP that blocks unauthorized code execution',
      'zh-TW': '正確配置的 CSP 可阻擋未經授權的程式碼執行',
    },
  },
  'ZAP-10035-1': {
    businessImpact: {
      en: 'Missing HSTS header: Users may be vulnerable to SSL stripping attacks when first visiting the site',
      'zh-TW': '缺少 HSTS 標頭：使用者首次訪問網站時可能遭受 SSL 剝離攻擊',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Enforced HTTPS connections, protecting against downgrade attacks',
      'zh-TW': '強制使用 HTTPS 連線，防止降級攻擊',
    },
  },
  'ZAP-10063': {
    businessImpact: {
      en: 'Privacy risk: Third-party scripts may access microphone, camera, or geolocation without authorization, causing privacy concerns',
      'zh-TW': '隱私風險：第三方程式可能未經同意就存取麥克風、相機或定位資訊，引發隱私疑慮',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Precisely control browser API permissions, enhancing user privacy trust',
      'zh-TW': '精準控制瀏覽器 API 權限，提升使用者對隱私保護的信任',
    },
  },
  'ZAP-10020': {
    businessImpact: {
      en: 'Security header missing: Site lacks basic security headers, making it easier for attackers to exploit common vulnerabilities',
      'zh-TW': '缺少安全標頭：網站缺乏基本的安全防護設定，讓駭客更容易利用常見漏洞',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Add defense-in-depth protection against common web attacks',
      'zh-TW': '增加多層防護，抵禦常見的網頁攻擊',
    },
  },
  'ZAP-10021': {
    businessImpact: {
      en: 'MIME-sniffing vulnerability: Browsers may interpret files as different content types, enabling XSS attacks through uploaded files',
      'zh-TW': 'MIME 嗅探漏洞：瀏覽器可能將檔案解讀為不同的內容類型，透過上傳檔案進行 XSS 攻擊',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '30 minutes - 1 hour', 'zh-TW': '30 分鐘 - 1 小時' },
    expectedOutcome: {
      en: 'Prevent MIME-sniffing attacks with X-Content-Type-Options header',
      'zh-TW': '透過 X-Content-Type-Options 標頭防止 MIME 嗅探攻擊',
    },
  },
  'ZAP-10003': {
    businessImpact: {
      en: 'Known vulnerabilities in JavaScript libraries can be exploited by attackers to compromise user sessions or steal data',
      'zh-TW': 'JavaScript 函式庫存在已知漏洞，可被攻擊者利用來劫持使用者會話或竊取資料',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '2-8 hours', 'zh-TW': '2-8 小時' },
    expectedOutcome: {
      en: 'Up-to-date libraries without known security vulnerabilities',
      'zh-TW': '更新函式庫至無已知安全漏洞的版本',
    },
  },
  'ZAP-10202': {
    businessImpact: {
      en: 'Cross-Site Request Forgery (CSRF) vulnerability: Attackers can trick users into performing unwanted actions on your site',
      'zh-TW': '跨站請求偽造（CSRF）漏洞：駭客可以騙使用者在您的網站上執行非預期的操作',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '4-8 hours', 'zh-TW': '4-8 小時' },
    expectedOutcome: {
      en: 'Protected forms and state-changing operations with CSRF tokens',
      'zh-TW': '透過 CSRF 驗證碼保護表單和重要操作',
    },
  },
  'ZAP-90003': {
    businessImpact: {
      en: 'Subresource integrity missing: Third-party scripts could be tampered with to inject malicious code',
      'zh-TW': '缺少子資源完整性驗證：第三方程式可能被竄改並注入惡意程式碼',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Verified integrity of external scripts prevents supply chain attacks',
      'zh-TW': '驗證外部程式的完整性，防止供應鏈攻擊',
    },
  },
  'ZAP-10017': {
    businessImpact: {
      en: 'Cross-domain JavaScript files could be compromised, injecting malicious code into your site',
      'zh-TW': '來自其他網域的 JavaScript 檔案可能被入侵，把惡意程式碼注入您的網站',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '2-4 hours', 'zh-TW': '2-4 小時' },
    expectedOutcome: {
      en: 'Controlled JavaScript sources reduce attack surface',
      'zh-TW': '控管 JavaScript 來源，縮小被攻擊的範圍',
    },
  },
  'ZAP-10096': {
    businessImpact: {
      en: 'Timestamp disclosure may reveal server information useful for targeted attacks',
      'zh-TW': '時間戳記外洩可能暴露伺服器資訊，讓駭客更容易發動針對性攻擊',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Reduced information leakage to potential attackers',
      'zh-TW': '減少資訊外洩給潛在攻擊者',
    },
  },

  // ===== Performance Issues =====
  'LCP-POOR': {
    businessImpact: {
      en: 'High bounce rate: Google research shows LCP over 2.5s causes users to abandon loading, directly impacting ad impressions and conversions',
      'zh-TW':
        '跳出率偏高：根據 Google 研究，LCP 超過 2.5 秒會導致使用者放棄等待，直接影響廣告曝光與轉換率',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '4-16 hours', 'zh-TW': '4-16 小時' },
    expectedOutcome: {
      en: 'Faster first-screen rendering, expected improvement in user retention',
      'zh-TW': '加快首畫面顯示速度，預期可提升使用者留存率',
    },
  },
  'LCP-CRITICAL': {
    businessImpact: {
      en: 'Severe user loss: Pages with LCP over 4s see more than 50% of users leave immediately, causing significant revenue loss',
      'zh-TW':
        '使用者大量流失：LCP 超過 4 秒的頁面，超過一半的使用者會立即離開，造成嚴重的營收損失',
    },
    fixDifficulty: 'High',
    estimatedEffort: { en: '1-3 days', 'zh-TW': '1-3 天' },
    expectedOutcome: {
      en: 'Fundamental improvement in loading experience, may require architectural changes',
      'zh-TW': '從根本改善載入體驗，可能需要調整系統架構',
    },
  },
  'CLS-POOR': {
    businessImpact: {
      en: 'Poor visual stability causes mis-clicks, potentially leading to refund disputes or user churn',
      'zh-TW': '畫面不穩定容易點錯按鈕，可能引發退款糾紛或使用者流失',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '2-8 hours', 'zh-TW': '2-8 小時' },
    expectedOutcome: {
      en: 'Improved visual trust, reduced user frustration',
      'zh-TW': '提升視覺穩定度，減少使用者的挫折感',
    },
  },
  'CLS-CRITICAL': {
    businessImpact: {
      en: 'Severe layout instability makes the site feel broken and unprofessional, severely damaging brand perception',
      'zh-TW': '版面嚴重跳動會讓網站看起來像是壞掉了，給人不專業的印象，嚴重損害品牌形象',
    },
    fixDifficulty: 'High',
    estimatedEffort: { en: '8-24 hours', 'zh-TW': '8-24 小時' },
    expectedOutcome: {
      en: 'Stable visual experience that builds user confidence',
      'zh-TW': '穩定的視覺體驗能建立使用者的信任感',
    },
  },
  'TBT-POOR': {
    businessImpact: {
      en: 'Unresponsive pages cause user frustration, affecting interactions like ordering or registration. This is a key proxy for Interaction to Next Paint (INP)',
      'zh-TW':
        '頁面反應遲鈍會讓使用者感到不耐煩，影響下單或註冊等操作。這是「互動至下次繪製（INP）」的關鍵參考指標',
    },
    fixDifficulty: 'High',
    estimatedEffort: { en: '8-24 hours', 'zh-TW': '8-24 小時' },
    expectedOutcome: {
      en: 'Improved interaction smoothness, increased conversion funnel pass-through rate',
      'zh-TW': '提升互動流暢度，提高轉換完成率',
    },
  },
  'TBT-CRITICAL': {
    businessImpact: {
      en: 'Page feels frozen during load, users may think the site is broken and leave immediately',
      'zh-TW': '頁面載入時像是當掉一樣，使用者可能以為網站故障而直接離開',
    },
    fixDifficulty: 'High',
    estimatedEffort: { en: '1-3 days', 'zh-TW': '1-3 天' },
    expectedOutcome: {
      en: 'Responsive page that maintains user engagement during load',
      'zh-TW': '讓頁面能即時回應，在載入過程中維持使用者的注意力',
    },
  },
  'UNUSED-JAVASCRIPT': {
    businessImpact: {
      en: 'Wasted bandwidth and parse time, directly slowing page load',
      'zh-TW': '浪費頻寬和解析時間，直接拖慢頁面載入速度',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '4-8 hours', 'zh-TW': '4-8 小時' },
    expectedOutcome: {
      en: 'Reduced JavaScript size, faster execution',
      'zh-TW': '縮小 JavaScript 檔案大小，加快執行速度',
    },
  },
  'OFFSCREEN-IMAGES': {
    businessImpact: {
      en: 'Loading images that users may never see wastes bandwidth and slows initial render',
      'zh-TW': '載入使用者可能根本看不到的圖片，浪費頻寬也拖慢畫面顯示',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '2-4 hours', 'zh-TW': '2-4 小時' },
    expectedOutcome: {
      en: 'Faster initial load by deferring off-screen images',
      'zh-TW': '延遲載入畫面外的圖片，加快初始載入速度',
    },
  },
  'RENDER-BLOCKING-RESOURCES': {
    businessImpact: {
      en: 'Resources blocking first paint, delaying when users can start interacting with content',
      'zh-TW': '某些資源會阻擋畫面顯示，讓使用者等更久才能開始操作',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '4-8 hours', 'zh-TW': '4-8 小時' },
    expectedOutcome: {
      en: 'Faster first paint, improved perceived performance',
      'zh-TW': '加快畫面首次顯示，讓使用者感覺更快',
    },
  },
  'USES-LONG-CACHE-TTL': {
    businessImpact: {
      en: 'Short cache durations cause unnecessary re-downloads on repeat visits',
      'zh-TW': '快取時間設太短，導致使用者每次來都要重新下載',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Faster repeat visits, reduced server load',
      'zh-TW': '回訪時載入更快，也能減輕伺服器負擔',
    },
  },

  // ===== SEO Issues - Lighthouse Audits =====
  // Reference: https://developer.chrome.com/docs/lighthouse/seo
  'LH-NOT-CRAWLABLE': {
    businessImpact: {
      en: 'Search engines cannot index this page: Your content is invisible to Google and other search engines, resulting in zero organic traffic',
      'zh-TW': '搜尋引擎無法檢索此頁面：您的內容對 Google 等搜尋引擎完全不可見，自然搜尋流量為零',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '1-4 hours', 'zh-TW': '1-4 小時' },
    expectedOutcome: {
      en: 'Page becomes discoverable by search engines, enabling organic traffic acquisition',
      'zh-TW': '頁面可被搜尋引擎發現，開始獲得自然搜尋流量',
    },
  },
  'LH-MISSING-TITLE': {
    businessImpact: {
      en: 'Search results display anomaly: Google will auto-generate a title that may not match brand image or keyword strategy',
      'zh-TW': '搜尋結果顯示異常：Google 會自動產生標題，可能與品牌形象或關鍵字策略不符',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '30 minutes - 1 hour', 'zh-TW': '30 分鐘 - 1 小時' },
    expectedOutcome: {
      en: 'Control search result presentation, improve brand consistency and click-through rate',
      'zh-TW': '掌控搜尋結果的呈現方式，維持品牌一致性並提升點擊率',
    },
  },
  'LH-HTTP-ERROR': {
    businessImpact: {
      en: 'Page returns error status: Search engines will not index error pages, and users will see broken content',
      'zh-TW': '頁面回傳錯誤狀態：搜尋引擎不會收錄錯誤頁面，使用者也會看到損壞的內容',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '1-4 hours', 'zh-TW': '1-4 小時' },
    expectedOutcome: {
      en: 'Page returns successful status, content can be properly indexed and displayed',
      'zh-TW': '頁面正常回應，內容可被正確收錄與顯示',
    },
  },
  'LH-ROBOTS-TXT-INVALID': {
    businessImpact: {
      en: 'Invalid robots.txt may accidentally block search engines from crawling important pages',
      'zh-TW': '無效的 robots.txt 可能意外阻擋搜尋引擎檢索重要頁面',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '30 minutes - 1 hour', 'zh-TW': '30 分鐘 - 1 小時' },
    expectedOutcome: {
      en: 'Correct robots.txt syntax ensures search engines can crawl your site as intended',
      'zh-TW': '正確的 robots.txt 語法確保搜尋引擎能按預期檢索您的網站',
    },
  },
  'LH-MISSING-META-DESC': {
    businessImpact: {
      en: 'Low click-through rate: Search results show blank or randomly grabbed text, failing to attract user clicks',
      'zh-TW': '點擊率偏低：搜尋結果會顯示空白或隨機抓取的文字，難以吸引使用者點擊',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Optimized snippets can increase search result click-through rate, bringing more organic traffic',
      'zh-TW': '最佳化過的描述可提高搜尋結果點擊率，帶來更多自然流量',
    },
  },
  'LH-INVALID-CANONICAL': {
    businessImpact: {
      en: 'Duplicate content confusion: Invalid canonical URL may cause search engines to split ranking authority across pages',
      'zh-TW': '重複內容混淆：無效的 canonical URL 可能導致搜尋引擎將排名權重分散到多個頁面',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Consolidate page authority to the correct URL, improving ranking potential',
      'zh-TW': '將頁面權重集中到正確的 URL，提升排名潛力',
    },
  },
  'LH-POOR-LINK-TEXT': {
    businessImpact: {
      en: 'Search engines and users cannot understand link purposes: Generic text like "click here" provides no context for link destinations',
      'zh-TW': '搜尋引擎和使用者無法理解連結目的：「點此」之類的通用文字無法說明連結指向的內容',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Descriptive link text improves accessibility and helps search engines understand page relationships',
      'zh-TW': '描述性的連結文字可提升無障礙體驗，並幫助搜尋引擎理解頁面間的關係',
    },
  },
  'LH-UNCRAWLABLE-LINKS': {
    businessImpact: {
      en: 'Search engines cannot follow links: JavaScript-only or improperly formatted links break the crawl path',
      'zh-TW': '搜尋引擎無法追蹤連結：純 JavaScript 或格式不正確的連結會中斷檢索路徑',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '2-4 hours', 'zh-TW': '2-4 小時' },
    expectedOutcome: {
      en: 'All important links are crawlable, ensuring complete site indexing',
      'zh-TW': '所有重要連結都可被檢索，確保網站完整收錄',
    },
  },
  'LH-MISSING-IMAGE-ALT': {
    businessImpact: {
      en: 'Images are invisible to search engines and screen readers: Missing alt text hurts image search rankings and accessibility',
      'zh-TW': '圖片對搜尋引擎和螢幕閱讀器不可見：缺少 alt 文字會影響圖片搜尋排名和無障礙性',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-4 hours', 'zh-TW': '1-4 小時' },
    expectedOutcome: {
      en: 'Images are discoverable in image search and accessible to all users',
      'zh-TW': '圖片可在圖片搜尋中被發現，所有使用者都能存取',
    },
  },
  'LH-INVALID-HREFLANG': {
    businessImpact: {
      en: 'Wrong language versions shown to users: Invalid hreflang may cause search engines to display the wrong language page in results',
      'zh-TW':
        '使用者看到錯誤的語言版本：無效的 hreflang 可能導致搜尋引擎在結果中顯示錯誤語言的頁面',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '2-4 hours', 'zh-TW': '2-4 小時' },
    expectedOutcome: {
      en: 'Correct language targeting ensures users see content in their preferred language',
      'zh-TW': '正確的語言定位確保使用者看到符合其偏好語言的內容',
    },
  },

  // ===== SEO Issues - Sitemap Validation =====
  // Reference: https://www.sitemaps.org/protocol.html
  'SITEMAP-NOT-FOUND': {
    businessImpact: {
      en: 'Search engines may miss pages: Without a sitemap, crawlers rely solely on links to discover your content',
      'zh-TW': '搜尋引擎可能遺漏頁面：沒有網站地圖，爬蟲只能靠連結發現您的內容',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-2 hours', 'zh-TW': '1-2 小時' },
    expectedOutcome: {
      en: 'Search engines can discover all important pages through sitemap, improving indexing coverage',
      'zh-TW': '搜尋引擎可透過網站地圖發現所有重要頁面，提升收錄涵蓋率',
    },
  },
  'SITEMAP-FETCH-ERROR': {
    businessImpact: {
      en: 'Sitemap exists but is inaccessible: Search engines cannot use your sitemap for indexing guidance',
      'zh-TW': '網站地圖存在但無法存取：搜尋引擎無法使用您的網站地圖作為收錄指引',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '30 minutes - 1 hour', 'zh-TW': '30 分鐘 - 1 小時' },
    expectedOutcome: {
      en: 'Sitemap is accessible and can be processed by search engines',
      'zh-TW': '網站地圖可被存取並被搜尋引擎處理',
    },
  },
  'SITEMAP-XSD-INVALID': {
    businessImpact: {
      en: 'Invalid sitemap format: Search engines may ignore your sitemap entirely due to schema violations',
      'zh-TW': '網站地圖格式無效：搜尋引擎可能因違反結構定義而完全忽略您的網站地圖',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '1-4 hours', 'zh-TW': '1-4 小時' },
    expectedOutcome: {
      en: 'Sitemap conforms to sitemaps.org protocol and is fully processed by search engines',
      'zh-TW': '網站地圖符合 sitemaps.org 協議，可被搜尋引擎完整處理',
    },
  },

  // ===== SEO Issues - Broken Links (HTTP status codes are factual) =====
  'BROKEN-LINK-404': {
    businessImpact: {
      en: 'Link equity loss: Search engine crawlers hit dead ends, wasting crawl budget and preventing important pages from being indexed',
      'zh-TW': '連結權重流失：搜尋引擎爬蟲遇到死連結，浪費檢索配額，導致重要頁面無法被收錄',
    },
    fixDifficulty: 'Low',
    estimatedEffort: { en: '1-4 hours', 'zh-TW': '1-4 小時' },
    expectedOutcome: {
      en: 'Fix link structure, ensure proper link juice flow, improve overall ranking potential',
      'zh-TW': '修復連結結構，確保連結權重正常傳遞，提升整體排名潛力',
    },
  },
  'BROKEN-LINK-500': {
    businessImpact: {
      en: 'Server errors signal site reliability problems to search engines and users alike',
      'zh-TW': '伺服器錯誤會讓搜尋引擎和使用者認為網站不穩定',
    },
    fixDifficulty: 'Medium',
    estimatedEffort: { en: '2-8 hours', 'zh-TW': '2-8 小時' },
    expectedOutcome: {
      en: 'Reliable server responses, improved crawlability',
      'zh-TW': '伺服器穩定回應，提升網站的可檢索性',
    },
  },
};

/**
 * Default entry used when an issue ID is not in the knowledge base.
 * Issues without knowledge base entries will still appear in reports.
 */
export const DEFAULT_BUSINESS_ENTRY: KnowledgeEntry = {
  businessImpact: {
    en: 'May affect overall website health, recommend further investigation',
    'zh-TW': '可能影響整體網站狀況，建議進一步調查',
  },
  fixDifficulty: 'Medium',
  estimatedEffort: {
    en: 'Requires assessment',
    'zh-TW': '需評估後才能確定',
  },
  expectedOutcome: {
    en: 'Improved website quality after fixing',
    'zh-TW': '修復後可提升網站品質',
  },
};

/**
 * Get the knowledge entry for a specific issue ID.
 * Falls back to the default entry if not found.
 */
export function getKnowledgeEntry(issueId: string): KnowledgeEntry {
  return KNOWLEDGE_BASE[issueId] ?? DEFAULT_BUSINESS_ENTRY;
}

/**
 * Get the resolved knowledge entry for a specific issue ID and locale.
 * Returns plain strings instead of LocalizedString objects.
 */
export function getResolvedKnowledgeEntry(
  issueId: string,
  locale: Locale = 'en'
): ResolvedKnowledgeEntry {
  const entry = getKnowledgeEntry(issueId);
  return {
    businessImpact: entry.businessImpact[locale] || entry.businessImpact.en,
    fixDifficulty: entry.fixDifficulty,
    estimatedEffort: entry.estimatedEffort[locale] || entry.estimatedEffort.en,
    expectedOutcome: entry.expectedOutcome[locale] || entry.expectedOutcome.en,
  };
}
