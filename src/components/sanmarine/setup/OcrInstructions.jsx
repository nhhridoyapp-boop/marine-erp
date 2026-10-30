import React from 'react';

export default function OcrInstructions() {
  return <details className="rounded-xl border border-border p-3 text-sm text-foreground">
    <summary className="cursor-pointer font-bold">ফ্রী OCR চালুর ধাপ — এখানে খুলুন</summary>
    <ol className="mt-3 list-decimal pl-5 space-y-2 text-sm">
      <li><a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>-তে Google দিয়ে লগইন → Create API key। প্রকল্পের Billing tier যেন <strong>Free</strong> থাকে। চাবি চ্যাটে বা অ্যাপে দেবেন না।</li>
      <li><a className="underline" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">Cloudflare</a>-তে Free অ্যাকাউন্ট → Workers &amp; Pages → Create application → Worker / Hello World → Deploy।</li>
      <li>এই কার্ড থেকে “OCR Worker ডাউনলোড” করুন। Worker-এর Edit code-এ ডাউনলোডের সম্পূর্ণ লেখা বসিয়ে Deploy করুন।</li>
      <li>Worker → Settings → Variables and Secrets → Add → Type: <strong>Secret</strong>, Name: <strong>GEMINI_API_KEY</strong>, Value: আপনার Google চাবি → Save / Deploy।</li>
      <li>Worker-এর Overview থেকে https://…workers.dev ঠিকানাটি কপি করে নিচে সংরক্ষণ করুন। তারপর প্রকাশিত অ্যাপে সংযোগ যাচাই করুন।</li>
      <li>নতুন এন্ট্রিতে পরিষ্কার স্কেল স্লিপ / মনিটরের ছবি দিন; খাতার জন্য ডেইলি ডকুমেন্টস ব্যবহার করুন। OCR-এর সব নম্বর দেখে সংশোধন করে তবেই এন্ট্রি সংরক্ষণ করুন।</li>
    </ol>
    <p className="mt-3 rounded-lg border border-border bg-muted p-2 text-xs"><strong>সংযোগ ব্যর্থ হলে:</strong> এই কার্ড থেকে নতুন Worker ডাউনলোডে এখানকার ঠিকানার অনুমতি যুক্ত থাকবে; Cloudflare-এ Deploy করুন। API key ও URL আগেরটাই রাখুন। এই অ্যাপের নিজস্ব preview ঠিকানাও সমর্থিত; অন্য সব অ্যাপের জন্য অনুমতি খুলে দেওয়া হয়নি।</p>
    <p className="mt-2 rounded-lg border border-border bg-muted p-2 text-xs">নতুন Worker প্রকাশিত ওয়েব অ্যাপ, এখানকার preview এবং ইনস্টল করা অ্যান্ড্রয়েড অ্যাপ — তিন জায়গাতেই OCR সংযোগ দেয়; পুরোনো Worker-এ ইনস্টল করা অ্যাপে সংযোগ ব্যর্থ হতো।</p>
    <p className="mt-2 rounded-lg border border-border bg-muted p-2 text-xs"><strong>সার্ভার ব্যস্ত (503):</strong> আরেকটি সমর্থিত ফ্রী-টায়ার মডেল চেষ্টা হবে এবং সাময়িক ব্যস্ততায় অ্যাপ একবার পুনরায় চেষ্টা করবে। কোটা বা অনুমতির ত্রুটিতে বারবার অনুরোধ হবে না, পেইড বিকল্প চলবে না।</p>
    <p className="mt-2 rounded-lg border border-border bg-muted p-2 text-xs"><strong>প্রকৃত যাচাই:</strong> “মডেল ও OCR যাচাই” চাপুন। শুধু মডেলের নাম পাওয়া যথেষ্ট নয় — এটি একটি তৈরি করা ট্রাক নম্বরের ছবি সত্যি পড়ে কি না দেখবে; কোনো ব্যক্তিগত নথি পাঠাবে না। একবারের যাচাইও ফ্রী কোটার একটি OCR অনুরোধ ব্যবহার করে।</p>
    <p className="mt-2 text-xs text-muted-foreground"><strong>বিনামূল্যে রাখতে:</strong> Google AI Studio-তে প্রকল্পের Billing tier অবশ্যই Free রাখুন এবং Cloudflare Free plan ব্যবহার করুন। কেবল প্রকাশিত ফ্রী-টায়ার মডেল চেষ্টা হবে; কোটা শেষ হলে OCR থামবে, হাতে এন্ট্রি থাকবে। পেইড প্রকল্পের key দিলে Google চার্জ করতে পারে — Worker দিয়ে billing tier শনাক্ত করা যায় না।</p>
    <p className="mt-3 text-xs text-muted-foreground">ছবি → Cloudflare → Gemini → ট্রাক, ওজন, তারিখ ও খাতার সারি। Gemini OCR-এ Base44 AI ক্রেডিট লাগে না; ছবি সংরক্ষণ ও অন্যান্য অ্যাপ ব্যবহার আগের সীমার অধীন। ফ্রী কোটা সীমিত; কোটা শেষ হলে হাতে এন্ট্রি থাকবে। Billing চালু করলে Google চার্জ করতে পারে।</p>
    <p className="mt-2 text-xs text-muted-foreground">গোপনীয়তা: ছবির বিষয়বস্তু Google-এ পাঠানো হয়; Gemini Free tier-এর তথ্য পণ্য উন্নয়নে ব্যবহৃত হতে পারে। খুব সংবেদনশীল নথি দেওয়ার আগে অনুমতি নিন। Worker-এ ALLOWED_ORIGINS নামের Text variable-এ প্রকাশিত / নিজস্ব / preview origin কমা দিয়ে যোগ করা যায়। Origin নিয়ন্ত্রণ লগইন যাচাই নয়; জনসাধারণের ব্যবহারের আগে Cloudflare-এ অপব্যবহার রোধের সীমা নির্ধারণ করুন।</p>
    <p className="mt-2 text-xs"><a className="underline" href="https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite" target="_blank" rel="noreferrer">Google মূল্য ও গোপনীয়তার শর্ত</a> · <a className="underline" href="https://aistudio.google.com/rate-limit" target="_blank" rel="noreferrer">আপনার প্রকল্পের বর্তমান কোটা</a></p>
  </details>;
}