// prettier-ignore
const mangayomiSources = [{
  "name": "Riwyat Novel",
  "lang": "ar",
  "baseUrl": "https://cenele.com",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=cenele.com",
  "typeSource": "single",
  "itemType": 2,
  "version": "1.0.1",
  "pkgPath": "novel/src/ar/riwyat-novel.js",
  "notes": ""
}];

class DefaultExtension extends MProvider {
  headers = {
    Referer: "https://cenele.com",
    Origin: "https://cenele.com",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  browsePath = "/cont-genre/%D9%85%D8%BA%D8%A7%D9%85%D8%A7%D9%85%D8%B1%D8%A9/";

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

      const imageUrl = node.selectFirst("div.item-thumb img")?.getSrc;
      list.push({ name, imageUrl, link });
    }

    // Madara غالباً يستخدم next.page-numbers
    const hasNextPage = doc.selectFirst("a.next.page-numbers") != null || list.length > 0;
    return { list, hasNextPage };
  }

  async getPopular(page) {
    const suffix = page > 1 ? `page/${page}/` : "";
    const url = `${this.getBaseUrl()}${this.browsePath}${suffix}`;
    const res = await new Client().get(url, this.headers);
    return this.parseBrowse(res);
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const q = (query || "").trim();
    const url = `${this.getBaseUrl()}/?s=${encodeURIComponent(q)}&paged=${page}`;
    const res = await new Client().get(url, this.headers);
    return this.parseBrowse(res);
  }

  toStatus(text) {
    const t = (text || "").toLowerCase();
    if (t.includes("مستم") || t.includes("ongoing")) return 0;
    if (t.includes("مكتمل") || t.includes("completed")) return 1;
    if (t.includes("متوقف") || t.includes("hiatus")) return 2;
    return 5;
  }

  async getDetail(url) {
    const res = await new Client().get(url, this.headers);
    const doc = new Document(res.body);

    const name = doc.selectFirst("div.post-title h1")?.text?.trim() || "";
    const imageUrl = doc.selectFirst("div.summary_image img")?.getSrc || "";

    const description =
      doc.selectFirst("div.summary__content")?.text?.trim() ||
      doc.selectFirst("div.description-summary")?.text?.trim() ||
      "";

    const extra = {};
    for (const b of doc.select("div.post-content_item")) {
      const label = b.selectFirst("div.summary-heading h5")?.text?.trim();
      const value = b.selectFirst("div.summary-content")?.text?.trim();
      if (label && value) extra[label] = value;
    }

    const author = extra["مؤلف"] || extra["الكاتب"] || "";
    const status = this.toStatus(extra["الحالة"] || "");
    const genreText = extra["التصنيفات"] || "";
    const genre = genreText
      ? genreText.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const chapters = [];
    for (const a of doc.select("li.wp-manga-chapter a")) {
      const chName = a?.text?.trim();
      const chUrl = a?.getHref;
      if (chName && chUrl) chapters.push({ name: chName, url: chUrl, dateUpload: "", scanlator: "" });
    }

    return { name, imageUrl, description, genre, author, status, chapters };
  }

  async getHtmlContent(name, url) {
    const res = await new Client().get(url, this.headers);
    return this.cleanHtmlContent(res.body);
  }

  async cleanHtmlContent(html) {
    const doc = new Document(html);

    const title =
      doc.selectFirst("h1")?.text?.trim() ||
      doc.selectFirst("title")?.text?.trim() ||
      "";

    const reading =
      doc.selectFirst("div.reading-content") ||
      doc.selectFirst("article") ||
      doc.selectFirst("div.entry-content");

    const content = reading?.innerHtml || reading?.text || "";

    return `
## ${title}

* * *

${content}
`.trim();
  }
}
