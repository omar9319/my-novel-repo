const mangayomiSources = [{
  "name": "Riwyat Novel",
  "lang": "ar",
  "baseUrl": "https://cenele.com",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=cenele.com",
  "typeSource": "single",
  "itemType": 2,
  "version": "1.0.9",
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

    // Genre pages use "div.page-item-detail" بينما صفحات البحث قد تستخدم "div.c-tabs-item__content".
    let nodes = doc.select("div.page-item-detail");
    if (!nodes.length) {
      nodes = doc.select("div.c-tabs-item__content, div.page-listing-item");
    }

    const list = [];

    for (const node of nodes) {
      const a =
        node.selectFirst("div.post-title a") ||
        node.selectFirst("h3 a") ||
        node.selectFirst("h4 a") ||
        null;

      const name = a?.text?.trim() || "";
      const link = a?.getHref || "";

      // نتجاهل الروابط التي ليست لصفحات الأعمال
      if (!name || !link || !link.includes("/cont/")) continue;

      const imageUrl =
        node.selectFirst("div.item-thumb img")?.getSrc ||
        node.selectFirst("div.item-thumb a img")?.getSrc ||
        node.selectFirst("div.tab-thumb img")?.getSrc ||
        node.selectFirst("div.tab-thumb a img")?.getSrc ||
        "";

      list.push({ name, imageUrl, link });
    }

    const hasNextPage =
      doc.selectFirst("a.next.page-numbers") != null ||
      doc.selectFirst("a.next") != null;

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
    const q = String(query || '').trim();
    if (!q) return { list: [], hasNextPage: false };

    const client = new Client();

    // ملاحظة: كثير من مواقع WordPress/Madara تستخدم ترقيم صفحات البحث بصيغة
    // /page/2/?s=... بدل ?paged=2. لذلك نجرب أكثر من صيغة.
    const enc = encodeURIComponent(q);
    const candidates = [];

    if (page > 1) {
      candidates.push(`${this.source.baseUrl}/page/${page}/?s=${enc}&post_type=wp-manga`);
    }
    candidates.push(`${this.source.baseUrl}/?s=${enc}&post_type=wp-manga&paged=${page}`);
    candidates.push(`${this.source.baseUrl}/?s=${enc}&post_type=wp-manga`);

    for (const url of candidates) {
      const res = await client.get(url, this.headers);
      const parsed = this.parseBrowse(res);
      if (parsed?.list?.length) return parsed;
    }

    // Fallback: بعض القوالب تعتمد بحث Ajax (wp-manga-search-manga).
    // هذا يعيد نتائج محدودة (بدون صفحات)، لكنه أفضل من لا شيء.
    try {
      const ajaxUrl = `${this.source.baseUrl}/wp-admin/admin-ajax.php?action=wp-manga-search-manga&title=${enc}`;
      const res = await client.get(ajaxUrl, {
        Referer: this.source.baseUrl + '/',
        Origin: this.source.baseUrl,
      });
      const data = JSON.parse(res.body || 'null');
      const arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);

      const list = arr.map((it) => {
        const name = (it?.title || it?.name || it?.text || '').toString().trim();
        const link = (it?.url || it?.link || it?.permalink || '').toString().trim();
        const imageUrl = (it?.image || it?.img || it?.thumbnail || '').toString().trim();
        return { name, link, imageUrl };
      }).filter((x) => x.name && x.link);

      return { list, hasNextPage: false };
    } catch (_) {
      return { list: [], hasNextPage: false };
    }
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

    let contentHtml = reading?.innerHtml || "";

    // Remove obvious non-content blocks that sometimes appear inside reading-content.
    contentHtml = contentHtml
      .replace(/<\s*script[\s\S]*?<\/\s*script\s*>/gi, "")
      .replace(/<\s*style[\s\S]*?<\/\s*style\s*>/gi, "")
      .replace(/<\s*noscript[\s\S]*?<\/\s*noscript\s*>/gi, "")
      .replace(/<\s*iframe[\s\S]*?<\/\s*iframe\s*>/gi, "")
      .replace(/<\s*ins[\s\S]*?<\/\s*ins\s*>/gi, "");

    // If the site injects extra sections after the chapter text, cut at the first marker.
    const stopMarkers = [
      "التعليقات",
      "العلامات",
      "روايات مقترحة",
      "عضوية",
      "Patreon",
      "Ko-fi",
    ];
    const lower = contentHtml.toLowerCase();
    let cutAt = -1;
    for (const m of stopMarkers) {
      const idx = lower.indexOf(String(m).toLowerCase());
      if (idx !== -1) cutAt = cutAt === -1 ? idx : Math.min(cutAt, idx);
    }
    if (cutAt !== -1) contentHtml = contentHtml.slice(0, cutAt);

    const htmlToTextPreserveBreaks = (s) => {
      let t = String(s || "");

      // Preserve the breaks that actually exist in the HTML.
      t = t.replace(/<\s*br\s*\/?\s*>/gi, "\n");
      t = t.replace(/<\s*\/\s*p\s*>/gi, "\n\n");
      t = t.replace(/<\s*p[^>]*>/gi, "");

      // Some sites use div wrappers as lines.
      t = t.replace(/<\s*\/\s*div\s*>/gi, "\n");
      t = t.replace(/<\s*div[^>]*>/gi, "");

      // Remove any remaining tags.
      t = t.replace(/<[^>]+>/g, "");

      // Decode the most common HTML entities.
      t = t
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
          const n = parseInt(hex, 16);
          return Number.isFinite(n) ? String.fromCodePoint(n) : _;
        })
        .replace(/&#([0-9]+);/g, (_, dec) => {
          const n = parseInt(dec, 10);
          return Number.isFinite(n) ? String.fromCodePoint(n) : _;
        });

      // Keep blank lines; only trim trailing spaces per line.
      t = t.replace(/\r/g, "");
      t = t
        .split("\n")
        .map((line) => line.replace(/[ \t]+$/g, ""))
        .join("\n");
      return t.trim();
    };

    const text = htmlToTextPreserveBreaks(contentHtml);

    const escapeHtml = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    // pre-wrap ensures the actual blank lines are rendered in the reader.
    const body = `<div style="direction: rtl; text-align: right; white-space: pre-wrap; line-height: 1.9;">${escapeHtml(text)}</div>`;

    return `<h2>${escapeHtml(title)}</h2>${body}`;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}
