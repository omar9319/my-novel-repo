const mangayomiSources = [{
  "name": "Riwyat Novel",
  "lang": "ar",
  "baseUrl": "https://cenele.com",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=cenele.com",
  "typeSource": "single",
  "itemType": 2,
  "version": "1.0.13",
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
  
      const escapeHtml = (s) =>
        String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
  
      const decodeHtml = (s) =>
        String(s || "")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#039;/g, "'")
          .replace(/&#(\d+);/g, (_, n) => {
            try {
              return String.fromCharCode(parseInt(n, 10));
            } catch (_) {
              return _;
            }
          });
  
      const title =
        doc.selectFirst("li.active")?.text?.trim() ||
        doc.selectFirst("div.post-title h1")?.text?.trim() ||
        doc.selectFirst("h1")?.text?.trim() ||
        fallbackTitle ||
        "";
  
      const reading =
        doc.selectFirst("div.reading-content") ||
        doc.selectFirst("div.entry-content") ||
        doc.selectFirst("article");
  
      if (!reading) {
        return `<div style="white-space:pre-wrap;line-height:1.8">${escapeHtml(title)}</div>`;
      }
  
      // Remove elements that commonly pollute the chapter page (ads, nav, chapter selectors, comments, etc.)
      const removeSelectors = [
        "script",
        "style",
        "iframe",
        "ins",
        "form",
        "select",
        "option",
        "button",
        "nav",
        "header",
        "footer",
        "aside",
        "ul",
        "ol",
        "li",
        "table",
        ".select-chapter",
        ".chapter-select",
        ".wp-manga-chapter",
        ".wp-manga-nav",
        ".manga-navigation",
        ".nav-links",
        ".post-navigation",
        ".navigation",
        ".comments-area",
        "#comments",
        ".comment-respond",
        ".comment-form",
        ".breadcrumbs",
        ".sharedaddy",
        ".addtoany_share_save_container",
        ".adsbygoogle",
        ".code-block",
        ".entry-meta",
        ".tags-links",
        ".related-posts",
        ".related",
        ".recommended",
        ".suggested",
        ".donation",
        ".memberships",
      ];
  
      for (const sel of removeSelectors) {
        for (const el of reading.select(sel)) {
          el.remove();
        }
      }
  
      // Remove blocks by keywords (footer/ads text). This is intentionally conservative.
      const junkHints = [
        "عضوية مميزة",
        "تخلص من الإعلانات",
        "Patreon",
        "Ko-fi",
        "PayPal",
        "فضاء روايات",
        "روايات مقترحة",
        "العلامات",
        "التعليقات",
        "لتفعيل العضوية",
        "طرق الدفع",
      ];
  
      for (const el of reading.select("div,section,p,blockquote")) {
        const t = (el.text || "").trim();
        if (!t) continue;
        for (const hint of junkHints) {
          if (t.includes(hint)) {
            el.remove();
            break;
          }
        }
      }
  
      // Preserve spacing exactly as in the HTML by translating <p>/<br> into newlines WITHOUT collapsing them.
      let contentHtml = reading.innerHtml || "";
      contentHtml = contentHtml.replace(/\r\n?/g, "\n");
  
      let text = contentHtml;
  
      // Line breaks / paragraphs
      text = text.replace(/<\s*br\s*\/?\s*>/gi, "\n");
      text = text.replace(/<\/\s*p\s*>/gi, "\n\n");
      text = text.replace(/<\s*p[^>]*>/gi, "");
  
      // Other block endings -> paragraph breaks
      text = text.replace(/<\/\s*(div|section|article|blockquote|h1|h2|h3|h4|h5|h6)\s*>/gi, "\n\n");
      text = text.replace(/<\s*(div|section|article|blockquote|h1|h2|h3|h4|h5|h6)[^>]*>/gi, "");
  
      // Strip anything else
      text = text.replace(/<[^>]+>/g, "");
  
      // Decode entities AFTER stripping tags
      text = decodeHtml(text);
  
      // Trim line-end spaces but keep empty lines (don't collapse multiple blank lines)
      text = text
        .split("\n")
        .map((l) => l.replace(/[ \t]+$/g, ""))
        .join("\n")
        .trim();
  
      // Render as pre-wrapped plain text for stable spacing in Mangayomi.
      return `<div style="white-space:pre-wrap;line-height:1.85">${escapeHtml(title)}\n\n${escapeHtml(text)}</div>`;
    }


  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}
