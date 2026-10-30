# San Marine — Gemini OCR চালু করার বাংলা গাইড

## কীভাবে কাজ করে
স্কেল স্লিপ, মনিটর বা খাতার ছবি → আপনার Cloudflare Worker → Gemini 3.1 Flash-Lite (ফ্রী-টায়ার) → ট্রাক / ওজন / তারিখ / খাতার সারি → ফর্ম। OCR-এর নম্বর দেখে তবেই চূড়ান্ত সংরক্ষণ করুন। OCR কখনো ১০০% নিশ্চিত নয়।

## আপনার করা একবারের কাজ
1. https://aistudio.google.com/apikey → Google login → Create API key। Projects-এ Billing tier Free আছে দেখুন। Key গোপন রাখুন; চ্যাট বা অ্যাপের URL ঘরে দেবেন না।
2. https://dash.cloudflare.com/ → Free account → Workers & Pages → Create application → Worker / Hello World → Deploy।
3. Worker → Edit code। এই প্যাকেজের ocr-worker.js-এর সম্পূর্ণ লেখা editor-এ বসিয়ে Deploy করুন।
4. Worker → Settings → Variables and Secrets → Add → Type Secret → Name GEMINI_API_KEY → Value আপনার Google key → Save / Deploy।
5. Worker Overview-এর https://...workers.dev ঠিকানা কপি করুন। San Marine → ব্যবস্থাপনা → সিস্টেম সেটিংস → ফ্রী Gemini OCR → URL বসান → OCR ঠিকানা সংরক্ষণ।
6. Worker Settings-এ পুরোনো GEMINI_MODEL Text variable থাকলে মুছুন অথবা gemini-3.1-flash-lite দিন। URL ও GEMINI_API_KEY Secret আগেরটাই রাখুন। প্রকাশিত অ্যাপে “মডেল ও OCR যাচাই” চাপুন: এটি মডেলের generateContent সমর্থন দেখে এবং একটি তৈরি করা DMT-12-3456 ছবির নম্বর সত্যি পড়ে কি না যাচাই করে। ব্যক্তিগত নথি নয়, ফ্রী কোটার একটি OCR অনুরোধ ব্যবহার হয়।
7. নতুন এন্ট্রি বা ডেইলি ডকুমেন্টসে ছবি দিন। অস্পষ্ট নম্বর OCR অনুমান করবে না; হাতে সংশোধন করে সংরক্ষণ করুন।

## Origin ও সীমা
Worker প্রকাশিত অ্যাপ, এই অ্যাপের নিজস্ব Base44 preview hostname এবং ইনস্টল করা Android/iOS অ্যাপ (নিজের ডিভাইসের লোকাল origin) সমর্থন করে; অন্য Base44 অ্যাপের অনুমতি নেই। সিস্টেম সেটিংস থেকে ডাউনলোড করলে তখনকার HTTPS ঠিকানাও Worker-এ যুক্ত থাকে। অন্য custom domain দরকার হলে ALLOWED_ORIGINS Text variable-এ ঠিক origin comma দিয়ে দিন, শেষের / ছাড়া; প্রকাশিত ঠিকানার অনুমতি সবসময় থাকে। Failed to fetch হলে অ্যাপ এখন ছবি-সংযোগ ও Worker-সংযোগ আলাদা করে এবং অনুমোদনের প্রয়োজনীয় ঠিকানা দেখায়। CORS ব্যবহারকারীর login যাচাই নয়; origin header নকল করা যায়। Public ব্যবহারের আগে Cloudflare-এর abuse / rate-limit ব্যবস্থা বিবেচনা করুন।

## খরচ ও গোপনীয়তা
- Gemini 3.1 Flash-Lite, 2.5 Flash-Lite ও 2.5 Flash-এর প্রকাশিত Free tier-এ text/image input ও output বিনামূল্যে। শুধু এই নির্দিষ্ট মডেলগুলোর মধ্যে generateContent সমর্থিত মডেল চেষ্টা হয়; বন্ধ 1.5/2.0 মডেল, চলমান alias বা paid-only মডেল ব্যবহার হয় না। project অনুযায়ী minute/day quota সীমিত: https://aistudio.google.com/rate-limit
- Google AI Studio-তে প্রকল্পের Billing tier Free রাখুন; পেইড billing যুক্ত key দিলে একই মডেলেও Google চার্জ করতে পারে। Worker billing tier শনাক্ত করতে পারে না।
- Cloudflare Free-তে বর্তমানে 100,000 requests/day (অন্য Workers-এর সঙ্গেও ভাগ হতে পারে)।
- Google / Cloudflare-এ billing / paid plan নিজে চালু করলে চার্জ হতে পারে। এই অ্যাপ paid provider-এ automatic fallback করে না; quota শেষ হলে manual entry থাকবে।
- Gemini OCR-এ Base44 AI integration call নেই। ছবি আপলোড / signed access ও সাধারণ Base44 data usage আগের সীমার অধীন। পুরো অ্যাপ unlimited free নয়।
- ফ্রী Gemini-তে পাঠানো ছবি / prompt Google পণ্য উন্নয়নে ব্যবহার করতে পারে। সংবেদনশীল নথি পাঠানোর আগে প্রতিষ্ঠানের অনুমতি নিন।
- ছবি পুরোনো ব্যবস্থার মতো private storage-এ থাকে; OCR-এর জন্য সাময়িকভাবে Worker এবং Google-এ ছবির বিষয়বস্তু যায়। API key server Secret-এ, browser / APK / ZIP-এ নয়।

## সমস্যা হলে
- key configured নয়: GEMINI_API_KEY-এর Type Secret, spelling ও Deploy দেখুন।
- 403: Google key / region অথবা ALLOWED_ORIGINS দেখুন।
- 404: নতুন Worker Deploy করুন; GEMINI_MODEL মুছুন বা gemini-3.1-flash-lite দিন। মডেল তালিকা পাওয়া মানেই ছবি পড়া কাজ করে নয়; “মডেল ও OCR যাচাই” চালান।
- 503 / UNAVAILABLE: ব্যস্ত মডেলের বদলে তালিকাভুক্ত আরেকটি সমর্থিত ফ্রী-টায়ার মডেল চেষ্টা হয়; অ্যাপ সাময়িক ব্যস্ততায় একবার পুনরায় চেষ্টা করে। স্থায়ী অনুপলব্ধতায় কাজ করার নিশ্চয়তা নেই।
- 429: project quota দেখুন, পরে চেষ্টা / manual entry; billing চালু করতে বাধ্য নন; কোটা শেষ হলে স্বয়ংক্রিয় পুনরাবৃত্তি নেই।
- ফোনে সমস্যা: প্রকাশিত URL updated Chrome-এ খুলুন; WhatsApp browser / editor preview থেকে নয়।

সূত্র: https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite
https://ai.google.dev/gemini-api/docs/rate-limits
https://developers.cloudflare.com/workers/platform/pricing/