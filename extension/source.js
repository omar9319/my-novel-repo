const mangayomiSources = [{
  "name": "Riwyat Novel",
  "lang": "ar",
  "baseUrl": "https://cenele.com",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=cenele.com",
  "typeSource": "single",
  "itemType": 2,
  "version": "1.0.16",
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
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  // "مغامرة"
  browsePath = "/cont-genre/%D9%85%D8%BA%D8%A7%D9%85%D8%B1%D8%A9/";

  getHeaders(url) {
    return this.headers;
  }

  // ---------- helpers ----------
  _getHref(el) {
    if (!el) return "";
    try {
      if (typeof el.getHref === "function") return el.getHref();
      if (typeof el.getHref === "string") return el.getHref;
      if (typeof el.getHref === "object" && el.getHref) return String(el.getHref);
      if (typeof el.attr === "function") return el.attr("href") || "";
    } catch (_) {}
    return "";
  }

  _getSrc(el) {
    if (!el) return "";
    try {
      if (typeof el.getSrc === "function") return el.getSrc();
      if (typeof el.getSrc === "string") return el.getSrc;
      if (typeof el.attr === "function") return el.attr("src") || "";
    } catch (_) {}
    return "";
  }

  _decodeEntities(input) {
    if (!input) return "";
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code) => {
      if (code[0] === "#") {
        const isHex = code[1] === "x" || code[1] === "X";
        const num = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return Number.isNaN(num) ? m : String.fromCodePoint(num);
      }
      return Object.prototype.hasOwnProperty.call(named, code) ? named[code] : m;
    });
  }

  _escapeHtml(input) {
    return String(input ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Convert a small HTML fragment to text, preserving <br> as newlines.
  _htmlFragmentToText(fragmentHtml) {
    let s = String(fragmentHtml ?? "");
    s = s
      .replace(/<\s*script[\s\S]*?<\/\s*script\s*>/gi, "")
      .replace(/<\s*style[\s\S]*?<\/\s*style\s*>/gi, "")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    s = this._decodeEntities(s).replace(/\r/g, "");
    return s;
  }

  // ---------- browse / popular ----------
  parseBrowse(res) {
    const doc = new Document(res.body);

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
      const link = this._getHref(a);

      if (!name || !link || !link.includes("/cont/")) continue;

      const imageUrl =
        this._getSrc(node.selectFirst("div.item-thumb img")) ||
        this._getSrc(node.selectFirst("div.item-thumb a img")) ||
        this._getSrc(node.selectFirst("div.tab-thumb img")) ||
        this._getSrc(node.selectFirst("div.tab-thumb a img")) ||
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
    const url = `${this.source.baseUrl}${this.browsePath}${suffix}`;
    const res = await new Client().get(url, this.headers);
    return this.parseBrowse(res);
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  // ---------- search ----------
  async search(query, page, filters) {
    const q = String(query || "").trim();
    if (!q) return { list: [], hasNextPage: false };

    const client = new Client();
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

    // Ajax fallback
    try {
      const ajaxUrl = `${this.source.baseUrl}/wp-admin/admin-ajax.php?action=wp-manga-search-manga&title=${enc}`;
      const res = await client.get(ajaxUrl, {
        Referer: this.source.baseUrl + "/",
        Origin: this.source.baseUrl,
      });
      const data = JSON.parse(res.body || "null");
      const arr = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : [];

      const list = arr
        .map((it) => {
          const name = (it?.title || it?.name || it?.text || "").toString().trim();
          const link = (it?.url || it?.link || it?.permalink || "").toString().trim();
          const imageUrl = (it?.image || it?.img || it?.thumbnail || "").toString().trim();
          return { name, link, imageUrl };
        })
        .filter((x) => x.name && x.link);

      return { list, hasNextPage: false };
    } catch (_) {
      return { list: [], hasNextPage: false };
    }
  }

  // ---------- details / chapters ----------
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
    const imageUrl = this._getSrc(doc.selectFirst("div.summary_image img"));

    const description =
      doc
        .select("div.summary__content p")
        .map((el) => el.text.trim())
        .join("\n")
        .trim() ||
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
      extra["الرسام"] || doc.selectFirst("div.artist-content a")?.text?.trim() || "";

    const statusText =
      extra["الحالة"] || doc.selectFirst("div.post-status div.summary-content")?.text?.trim() || "";
    const status = this.toStatus(statusText);

    let genre = doc.select("div.genres-content a").map((el) => el.text.trim());
    if (!genre.length && extra["التصنيفات"]) {
      genre = extra["التصنيفات"]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Chapters (direct, fallback ajax)
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
      let chName = (a?.text ?? "").trim();
      chName = chName.replace(/^[\"\x27“”«»]+|[\"\x27“”«»]+$/g, "").trim();

      const chUrl = this._getHref(a);
      if (!chName || !chUrl) continue;

      chapters.push({
        name: chName,
        url: chUrl,
        // Mangayomi يحاول تحويله لرقم، لذلك نضع رقم صالح دائماً
        dateUpload: String(Date.now()),
        scanlator: "",
      });
    }

    return { name, imageUrl, description, genre, author, artist, status, chapters };
  }

  // ---------- chapter content ----------
  async getHtmlContent(name, url) {
    const res = await new Client().get(url, this.headers);
    return this.cleanHtmlContent(res.body, name, url);
  }

  async cleanHtmlContent(html, fallbackTitle, pageUrl) {
    const doc = new Document(html);

    const title =
      doc.selectFirst("li.active")?.text?.trim() ||
      doc.selectFirst("div.post-title h1")?.text?.trim() ||
      doc.selectFirst("h1")?.text?.trim() ||
      fallbackTitle ||
      "";

    // IMPORTANT: For chapter pages on this site, the real text is inside div.reading-content.
    // If we fall back to body/article we may accidentally extract the chapter list (Select Chapter).
    const reading = doc.selectFirst("div.reading-content");

    if (!reading) {
      // If this happens, it's most likely not a chapter page.
      const msg =
        "تعذّر العثور على محتوى الفصل (div.reading-content). " +
        "تأكّد أن رابط الفصل صحيح وليس رابط صفحة الرواية.";
      return `<h2>${this._escapeHtml(title)}</h2>\n<div>${this._escapeHtml(msg)}</div>`;
    }

    // Extract ONLY paragraphs to avoid pulling navigation/dropdowns.
    const pEls = reading.select("p") || [];

    const junkNeedles = [
      "عضوية مميزة",
      "Patreon",
      "Ko-fi",
      "PayPal",
      "Visa",
      "للتواصل معنا",
      "طرق الدفع",
      "جميع ما تم ترجمته",
      "هذا مجرد محتوى ترفيهي",
      "استغفر الله",
    ];

    const blocks = [];

    if (pEls.length) {
      for (const p of pEls) {
        // Use innerHtml to preserve <br> inside paragraph, then convert to text.
        const frag = p?.innerHtml ?? p?.text ?? "";
        let t = this._htmlFragmentToText(frag)
          .replace(/\u00A0/g, " ")
          .trim();

        // Keep truly empty paragraphs as blank lines.
        if (!t) {
          blocks.push("");
          continue;
        }

        // Remove junk lines/paragraphs
        let isJunk = false;
        for (const needle of junkNeedles) {
          if (t.includes(needle)) {
            isJunk = true;
            break;
          }
        }
        if (isJunk) continue;

        // Normalize spaces per line but keep line breaks inside the paragraph.
        const lines = t
          .split("\n")
          .map((line) => String(line ?? "").replace(/\s+/g, " ").trim());
        t = lines.join("\n").trim();

        blocks.push(t);
      }
    } else {
      // Fallback: split whole text by lines
      let t = String(reading.text ?? "").replace(/\r/g, "");
      const lines = t
        .split("\n")
        .map((line) => String(line ?? "").replace(/\s+/g, " ").trim());
      for (const line of lines) {
        if (!line) {
          blocks.push("");
          continue;
        }
        let isJunk = false;
        for (const needle of junkNeedles) {
          if (line.includes(needle)) {
            isJunk = true;
            break;
          }
        }
        if (!isJunk) blocks.push(line);
      }
    }

    // Preserve empty lines, but prevent huge blank runs.
    const cleaned = [];
    let blankRun = 0;
    for (const b of blocks) {
      if (!b) {
        blankRun += 1;
        if (blankRun <= 4) cleaned.push("");
        continue;
      }
      blankRun = 0;
      cleaned.push(b);
    }

    // Build HTML with real paragraphs so Mangayomi renders spacing like the website.
    const parts = [];
    for (const b of cleaned) {
      if (!b) {
        parts.push("<p><br></p>");
        continue;
      }
      const safe = this._escapeHtml(b).replace(/\n/g, "<br>\n");
      parts.push(`<p>${safe}</p>`);
    }

    const bodyHtml = parts.join("\n");
    return `<h2>${this._escapeHtml(title)}</h2>\n<div>${bodyHtml}</div>`;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}
