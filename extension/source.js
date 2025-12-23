const mangayomiSources = [{
  "name": "Riwyat Novel",
  "lang": "ar",
  "baseUrl": "https://cenele.com",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=cenele.com",
  "typeSource": "single",
  "itemType": 2,
  "version": "1.0.5",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "novel/src/ar/riwyat-novel.js",
  "isNsfw": false,
  "hasCloudflare": false,
  "notes": ""
}];

class DefaultExtension extends MProvider {
  headers = {
    Referer: this.source.baseUrl,
    Origin: this.source.baseUrl,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  // "مغامرة"
  browsePath = "/cont-genre/%D9%85%D8%BA%D8%A7%D9%85%D8%B1%D8%A9/";

  getHeaders(url) {
    return this.headers;
  }

  parseBrowse(res) {
    const doc = new Document(res.body);
    const nodes = doc.select("div.page-item-detail");
    const list = [];

    for (const node of nodes) {
      const a = node.selectFirst("div.post-title a");
      const name = a?.text?.trim();
      const link = a?.getHref;
      if (!name || !link) continue;

      const imageUrl =
        node.selectFirst("div.item-thumb img")?.getSrc ||
        node.selectFirst("div.item-thumb a img")?.getSrc ||
        "";

      list.push({ name, imageUrl, link });
    }

    const hasNextPage = doc.selectFirst("a.next.page-numbers") != null;
    return { list, hasNextPage };
  }

  async getPopular(page) {
    const suffix = page > 1 ? `page/${page}/` : "";
    const url = `${this.source.baseUrl}${this.browsePath}${suffix}`; // <-- أهم إصلاح: لا تستخدم getBaseUrl()
    const res = await new Client().get(url, this.headers);
    return this.parseBrowse(res);
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const q = (query || "").trim();
    const url = `${this.source.baseUrl}/?s=${encodeURIComponent(q)}&post_type=wp-manga&paged=${page}`;
    const res = await new Client().get(url, this.headers);
    return this.parseBrowse(res);
  }

  toStatus(text) {
    const t = String(text || "").toLowerCase();
    if (t.includes("مستم") || t.includes("ongoing")) return 0;
    if (t.includes("مكتمل") || t.includes("completed")) return 1;
    if (t.includes("متوقف") || t.includes("hiatus")) return 2;
    if (t.includes("متروك") || t.includes("dropped")) return 3;
    return 5;
  }

  async getDetail(url) {
    const client = new Client();
    const res = await client.get(url, this.headers);
    const doc = new Document(res.body);

    const name = doc.selectFirst("div.post-title h1")?.text?.trim() || "";
    const imageUrl = doc.selectFirst("div.summary_image img")?.getSrc || "";

    const description =
      doc.select("div.summary__content p").map((el) => el.text.trim()).join("\n").trim() ||
      doc.selectFirst("div.summary__content")?.text?.trim() ||
      doc.selectFirst("div.description-summary")?.text?.trim() ||
      "";

    const extra = {};
    for (const b of doc.select("div.post-content_item")) {
      const label = b.selectFirst("div.summary-heading h5")?.text?.trim();
      const value = b.selectFirst("div.summary-content")?.text?.trim();
      if (label && value) extra[label] = value;
    }

    const author =
      extra["مؤلف"] ||
      extra["الكاتب"] ||
      doc.selectFirst("div.author-content a")?.text?.trim() ||
      "";

    const artist =
      extra["الرسام"] ||
      doc.selectFirst("div.artist-content a")?.text?.trim() ||
      "";

    const statusText =
      extra["الحالة"] ||
      doc.selectFirst("div.post-status div.summary-content")?.text?.trim() ||
      "";
    const status = this.toStatus(statusText);

    let genre = doc.select("div.genres-content a").map((el) => el.text.trim());
    if (!genre.length && extra["التصنيفات"]) {
      genre = extra["التصنيفات"].split(",").map((s) => s.trim()).filter(Boolean);
    }

    // Chapters (صفحة مباشرة، وإن فشلت نحاول Ajax)
    let chapterDoc = doc;
    let chapterEls = chapterDoc.select("li.wp-manga-chapter");

    if (!chapterEls.length) {
      try {
        const chapterRes = await client.post(`${url}ajax/chapters/`, {
          Origin: this.source.baseUrl,
          Referer: url,
        });
        chapterDoc = new Document(chapterRes.body);
        chapterEls = chapterDoc.select("li.wp-manga-chapter");
      } catch (_) {}
    }

    const chapters = [];
    for (const el of chapterEls) {
      const a = el.selectFirst("a");
      const chName = a?.text?.trim();
      const chUrl = a?.getHref;
      if (!chName || !chUrl) continue;
      chapters.push({
        name: chName,
        url: chUrl,
        dateUpload: String(Date.now()),
        scanlator: "",
      });
    }

    return { name, imageUrl, description, genre, author, artist, status, chapters };
  }

  async getHtmlContent(name, url) {
    const res = await new Client().get(url, this.headers);
    return this.cleanHtmlContent(res.body, name);
  }

  async cleanHtmlContent(html, fallbackTitle) {
    const doc = new Document(html);

    const title =
      doc.selectFirst("li.active")?.text?.trim() ||
      doc.selectFirst("h1")?.text?.trim() ||
      fallbackTitle ||
      "";

    const reading =
      doc.selectFirst("div.reading-content") ||
      doc.selectFirst("div.entry-content") ||
      doc.selectFirst("article");

    if (!reading) {
      return `## ${title}\n\n(لم يتم العثور على محتوى الفصل في الصفحة)`;
    }

    // Prefer paragraphs: usually they contain only the actual chapter text.
    const ps = reading.select("p") || [];
    const parts = [];
    for (const p of ps) {
      const t = String(p?.text || "").replace(/\r/g, "").trim();
      if (t) parts.push(t);
    }

    let contentText = parts.join("\n\n").trim();
    if (!contentText) {
      // Fallback to full text (may include UI; we will filter lines below).
      contentText = String(reading.text || "").replace(/\r/g, "").trim();
    }

    // Remove very long "chapter picker" sequences that sometimes get merged into the text.
    // This keeps the real chapter text even if the picker appears in the same line.
    contentText = contentText.replace(/(?:(?:\bالفصل\s*\d+\b|\bالفصل\d+\b)\s*){8,}/g, "\n").trim();

    const junkSubstrings = [
      "عضوية مميزة",
      "تخلص من الإعلانات",
      "استمتع بتجربة",
      "اشترك عبر",
      "Ko-fi",
      "Patreon",
      "PayPal",
      "Visa",
      "للمزيد من طرق الدفع",
      "تواصل معنا",
      "أرسل اسمك",
      "ملاحظة",
      "العلامات",
      "التعليقات",
      "روايات مقترحة",
      "حصريا",
      "هذا مجرد محتوى",
      "فلا تدعه يؤثر",
      "استغفر الله",
      "الصفحة الرئيسية",
      "السابق",
      "التالي",
      "تبليغ عن مشكلة",
    ];

    const isJunkLine = (line) => {
      const s = String(line || "").trim();
      if (!s) return true;

      // remove "chapter picker" lines that contain many chapter tokens in one line
      const chapCount = (s.match(/الفصل/g) || []).length;
      if (chapCount >= 8) return true;

      // UI crumbs / bullets / dots
      if (s === "." || s === "•" || s === "·") return true;
      if (s.length <= 2) return true;

      // numbered breadcrumb like "1. الصفحة الرئيسية"
      if (/^\d+\.\s*/.test(s) && (s.includes("الصفحة") || s.includes("الرئيسية"))) return true;

      for (const sub of junkSubstrings) {
        if (s.includes(sub)) return true;
      }

      return false;
    };

    const rawLines = contentText
      .split("\n")
      .map((l) => String(l || "").trim())
      .filter(Boolean);

    const out = [];
    const seen = new Set();
    for (const line of rawLines) {
      if (isJunkLine(line)) continue;

      const key = line.replace(/\s+/g, " ");
      if (seen.has(key)) continue;
      seen.add(key);

      out.push(line);
    }

    const body = out.join("\n\n").trim();
    return `## ${title}\n\n${body || "(تعذر استخراج نص واضح من هذا الفصل بعد التصفية.)"}`;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}
