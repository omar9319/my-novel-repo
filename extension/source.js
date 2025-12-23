const mangayomiSources = [{
  "name": "Riwyat Novel",
  "lang": "ar",
  "baseUrl": "https://cenele.com",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=cenele.com",
  "typeSource": "single",
  "itemType": 2,
  "version": "1.0.10",
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

    // Prefer the actual chapter container.
    const reading =
      doc.selectFirst("div.reading-content") ||
      doc.selectFirst("div.text-left") ||
      doc.selectFirst("div.entry-content") ||
      doc.selectFirst("article");

    if (!reading) {
      return `## ${this.escapeHtml(title)}\n\n(لا يوجد محتوى للفصل)`;
    }

    // 1) Start from HTML so we can preserve intentional blank lines,
    //    but strip navigations/links that often inject huge chapter lists.
    let contentHtml = reading.innerHtml || "";

    // Drop scripts/styles
    contentHtml = contentHtml
      .replace(/<\s*script[\s\S]*?<\/\s*script\s*>/gi, "")
      .replace(/<\s*style[\s\S]*?<\/\s*style\s*>/gi, "");

    // Drop chapter selectors / navigation blocks
    contentHtml = contentHtml
      .replace(/<\s*select[\s\S]*?<\/\s*select\s*>/gi, "")
      .replace(/<\s*option[\s\S]*?<\/\s*option\s*>/gi, "")
      .replace(/<\s*nav[\s\S]*?<\/\s*nav\s*>/gi, "")
      .replace(/<\s*form[\s\S]*?<\/\s*form\s*>/gi, "");

    // Drop all anchors (prevents "Select chapter" / chapter list spam)
    contentHtml = contentHtml.replace(/<\s*a\b[^>]*>[\s\S]*?<\/\s*a\s*>/gi, "");

    // 2) Convert to plain text while preserving paragraph / line breaks.
    let plain = contentHtml
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/\s*p\s*>/gi, "\n\n")
      .replace(/<\s*p\b[^>]*>/gi, "")
      .replace(/<\/\s*div\s*>/gi, "\n\n")
      .replace(/<[^>]+>/g, "");

    plain = this.decodeHtmlEntities(plain).replace(/\r/g, "");

    // Normalize but keep intentional empty lines (up to 4 in a row)
    const rawLines = plain.split("\n");
    const kept = [];
    let emptyStreak = 0;

    for (const raw of rawLines) {
      const line = String(raw || "").replace(/\u00a0/g, " ").trim();

      // Stop when we hit obvious non-chapter sections.
      const low = line.toLowerCase();
      if (
        low.includes("التعليقات") ||
        low.includes("روايات مقترحة") ||
        low.includes("عضوية") ||
        low.includes("patreon") ||
        low.includes("kofi") ||
        low.includes("جميع ما تم ترجمة") ||
        low.includes("هذا مجرد محتوى")
      ) {
        break;
      }

      // Ignore pure UI noise
      if (this.isJunkLine(line)) {
        continue;
      }

      if (!line) {
        emptyStreak += 1;
        if (emptyStreak <= 4) {
          kept.push("");
        }
        continue;
      }

      emptyStreak = 0;
      kept.push(line);
    }

    const text = kept.join("\n").trim();

    if (!text) {
      return `## ${this.escapeHtml(title)}\n\n(لا يوجد محتوى للفصل)`;
    }

    // 3) Rebuild as safe HTML paragraphs to get clean spacing in the app.
    const out = [];
    const lines = text.split("\n");
    let buffer = [];

    const flush = () => {
      if (!buffer.length) return;
      const paragraph = buffer.join("<br/>");
      out.push(`<p style="margin:0 0 0.9em 0; line-height:1.9">${paragraph}</p>`);
      buffer = [];
    };

    for (const l of lines) {
      if (!l) {
        flush();
        // Keep intentional blank line as an empty paragraph for spacing.
        out.push(`<p style="margin:0 0 0.9em 0; line-height:1.9">&nbsp;</p>`);
        continue;
      }
      buffer.push(this.escapeHtml(l));
    }
    flush();

    return `
<h2 style="margin:0 0 0.8em 0">${this.escapeHtml(title)}</h2>
${out.join("\n")}
`.trim();
  }


  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}
