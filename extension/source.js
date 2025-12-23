const SOURCE_ID = "riwyat-novel";
const SOURCE_NAME = "Riwyat Novel";
const SOURCE_LANG = "ar";
const SOURCE_VERSION = "1.0.0";
const SOURCE_BASE_URL = "https://cenele.com";
const BROWSE_PATH = "/cont-genre/%D9%85%D8%BA%D8%A7%D9%85%D8%B1%D8%A9/";

function normalizeSpace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(input) {
  if (!input) {
    return "";
  }

  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
    if (code[0] === "#") {
      const isHex = code[1] === "x" || code[1] === "X";
      const num = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isNaN(num)) {
        return String.fromCodePoint(num);
      }
      return match;
    }

    if (Object.prototype.hasOwnProperty.call(named, code)) {
      return named[code];
    }

    return match;
  });
}

async function fetchHtml(url) {
  if (typeof fetch === "function") {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url} (status ${response.status}).`);
    }
    return await response.text();
  }

  if (typeof request === "function") {
    const response = await request(url);
    const status = response?.statusCode ?? response?.status ?? 0;
    if (status >= 400) {
      throw new Error(`Failed to fetch ${url} (status ${status}).`);
    }
    return response?.body ?? response?.data ?? "";
  }

  throw new Error("No HTTP client available in this environment.");
}

function parseHtmlDocument(html) {
  if (typeof parseHtml === "function") {
    return parseHtml(html);
  }
  if (typeof HtmlParser !== "undefined" && typeof HtmlParser.parse === "function") {
    return HtmlParser.parse(html);
  }
  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(html, "text/html");
  }

  throw new Error("No HTML parser available in this environment.");
}

function selectAll(root, selector) {
  if (!root) {
    return [];
  }
  if (typeof root.querySelectorAll === "function") {
    return Array.from(root.querySelectorAll(selector));
  }
  if (typeof root.select === "function") {
    return root.select(selector) || [];
  }
  if (typeof root.selectAll === "function") {
    return root.selectAll(selector) || [];
  }
  return [];
}

function selectFirst(root, selector) {
  const all = selectAll(root, selector);
  return all.length ? all[0] : null;
}

function getAttr(node, name) {
  if (!node) {
    return null;
  }
  if (typeof node.getAttribute === "function") {
    return node.getAttribute(name);
  }
  if (typeof node.attr === "function") {
    return node.attr(name);
  }
  if (typeof node.get === "function") {
    return node.get(name);
  }
  return null;
}

function getText(node) {
  if (!node) {
    return "";
  }
  if (typeof node.textContent === "string") {
    return node.textContent;
  }
  if (typeof node.text === "string") {
    return node.text;
  }
  if (typeof node.text === "function") {
    return node.text();
  }
  return "";
}

function getInnerHtml(node) {
  if (!node) {
    return "";
  }
  if (typeof node.innerHTML === "string") {
    return node.innerHTML;
  }
  if (typeof node.html === "function") {
    return node.html();
  }
  if (typeof node.html === "string") {
    return node.html;
  }
  return "";
}

function parseBrowseList(doc, pageUrl) {
  const items = [];
  const nodes = selectAll(doc, "div.page-item-detail");
  if (!nodes.length) {
    throw new Error(`Browse parsing failed for ${pageUrl}: missing div.page-item-detail.`);
  }

  nodes.forEach((node) => {
    const titleNode = selectFirst(node, "div.post-title a");
    const title = normalizeSpace(getText(titleNode));
    const url = getAttr(titleNode, "href");
    if (!title) {
      throw new Error(`Browse parsing failed for ${pageUrl}: missing title text in .post-title a.`);
    }
    if (!url) {
      throw new Error(`Browse parsing failed for ${pageUrl}: missing href in .post-title a.`);
    }

    const coverNode = selectFirst(node, "div.item-thumb img");
    const cover = getAttr(coverNode, "src");

    const item = { title, url };
    if (cover) {
      item.cover = cover;
    }
    items.push(item);
  });

  return items;
}

function parseNovelDetails(doc, novelUrl) {
  const titleNode = selectFirst(doc, "div.post-title h1");
  const title = normalizeSpace(getText(titleNode));
  if (!title) {
    throw new Error(`Details parsing failed for ${novelUrl}: missing .post-title h1.`);
  }

  const coverNode = selectFirst(doc, "div.summary_image img");
  const cover = getAttr(coverNode, "src");
  if (!cover) {
    throw new Error(`Details parsing failed for ${novelUrl}: missing .summary_image img.`);
  }

  const detailBlocks = selectAll(doc, "div.post-content_item");
  if (!detailBlocks.length) {
    throw new Error(`Details parsing failed for ${novelUrl}: missing .post-content_item.`);
  }

  const rawDetails = {};
  detailBlocks.forEach((block) => {
    const labelNode = selectFirst(block, "div.summary-heading h5");
    const valueNode = selectFirst(block, "div.summary-content");
    const label = normalizeSpace(getText(labelNode));
    const value = normalizeSpace(getText(valueNode));
    if (!label) {
      throw new Error(`Details parsing failed for ${novelUrl}: missing label in .summary-heading h5.`);
    }
    if (!value) {
      throw new Error(`Details parsing failed for ${novelUrl}: empty .summary-content for '${label}'.`);
    }
    rawDetails[label] = value;
  });

  const labelMap = {
    "مؤلف": "author",
    "المترجم": "translator",
    "الحالة": "status",
    "التصنيفات": "genres",
    "سنة اصدار": "year",
    "إسم آخر": "alternativeTitle",
    "المشاهدات": "views",
  };

  const details = {
    title,
    cover,
    url: novelUrl,
    extra: rawDetails,
  };

  Object.keys(rawDetails).forEach((label) => {
    const key = labelMap[label];
    if (key) {
      details[key] = rawDetails[label];
    }
  });

  return details;
}

function parseChapters(doc, novelUrl) {
  const chapterNodes = selectAll(doc, "li.wp-manga-chapter a");
  if (!chapterNodes.length) {
    throw new Error(`Chapter parsing failed for ${novelUrl}: missing li.wp-manga-chapter a.`);
  }

  return chapterNodes.map((node) => {
    const title = normalizeSpace(getText(node));
    const url = getAttr(node, "href");
    if (!title) {
      throw new Error(`Chapter parsing failed for ${novelUrl}: missing chapter title text.`);
    }
    if (!url) {
      throw new Error(`Chapter parsing failed for ${novelUrl}: missing chapter href.`);
    }
    return { title, url };
  });
}

function cleanChapterText(html, chapterUrl) {
  const stripped = html
    .replace(/<\s*script[\s\S]*?<\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\/\s*style\s*>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  const rawText = decodeHtmlEntities(stripped).replace(/\r/g, "");
  const lines = rawText.split("\n").map((line) => line.trim());
  const cleaned = [];
  let lastBlank = false;

  lines.forEach((line) => {
    if (!line) {
      if (!lastBlank) {
        cleaned.push("");
        lastBlank = true;
      }
      return;
    }
    cleaned.push(line);
    lastBlank = false;
  });

  const text = cleaned.join("\n").trim();
  if (!text) {
    throw new Error(`Chapter parsing failed for ${chapterUrl}: missing .reading-content.`);
  }

  return text;
}

async function browse(page = 1) {
  const pageSuffix = page > 1 ? `page/${page}/` : "";
  const url = `${SOURCE_BASE_URL}${BROWSE_PATH}${pageSuffix}`;
  const html = await fetchHtml(url);
  const doc = parseHtmlDocument(html);
  const novels = parseBrowseList(doc, url);
  return {
    novels,
    hasNextPage: novels.length > 0,
  };
}

async function details(novelUrl) {
  const html = await fetchHtml(novelUrl);
  const doc = parseHtmlDocument(html);
  return parseNovelDetails(doc, novelUrl);
}

async function chapters(novelUrl) {
  const html = await fetchHtml(novelUrl);
  const doc = parseHtmlDocument(html);
  return parseChapters(doc, novelUrl);
}

async function chapterContent(chapterUrl) {
  const html = await fetchHtml(chapterUrl);
  const doc = parseHtmlDocument(html);
  const readingNode = selectFirst(doc, "div.reading-content");
  if (!readingNode) {
    throw new Error(`Chapter parsing failed for ${chapterUrl}: missing div.reading-content.`);
  }
  const contentHtml = getInnerHtml(readingNode);
  return cleanChapterText(contentHtml, chapterUrl);
}

const source = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  lang: SOURCE_LANG,
  version: SOURCE_VERSION,
  baseUrl: SOURCE_BASE_URL,
  type: "novel",
  browse,
  details,
  chapters,
  chapterContent,
};

export default source;
