import * as convert from "xml-js";
import { generator } from "./config";
import type { Feed } from "./feed";
import type { Author, Category, Enclosure, Extension, Item } from "./typings";
import { sanitize } from "./utils";

/**
 * Returns a RSS 2.0 feed
 */
export default (ins: Feed) => {
  const { options, extensions } = ins;
  let isAtom = false;
  let isContent = false;

  const base: any = {
    _declaration: { _attributes: { version: "1.0", encoding: "utf-8" } },
    rss: {
      _attributes: { version: "2.0" },
      channel: {
        title: { _text: options.title },
        link: { _text: sanitize(options.link) },
        description: { _text: options.description },
        lastBuildDate: { _text: options.updated ? options.updated.toUTCString() : new Date().toUTCString() },
        docs: { _text: options.docs ? options.docs : "https://validator.w3.org/feed/docs/rss2.html" },
        generator: { _text: options.generator || generator },
      },
    },
  };

  /**
   * Channel language
   * https://validator.w3.org/feed/docs/rss2.html#ltlanguagegtSubelementOfLtchannelgt
   */
  if (options.language) {
    base.rss.channel.language = { _text: options.language };
  }

  /**
   * Channel ttl
   * https://validator.w3.org/feed/docs/rss2.html#ltttlgtSubelementOfLtchannelgt
   */
  if (options.ttl) {
    base.rss.channel.ttl = { _text: options.ttl };
  }

  /**
   * Channel Image
   * https://validator.w3.org/feed/docs/rss2.html#ltimagegtSubelementOfLtchannelgt
   */
  if (options.image) {
    base.rss.channel.image = {
      title: { _text: options.title },
      url: { _text: options.image },
      link: { _text: sanitize(options.link) },
    };
  }

  /**
   * Channel Copyright
   * https://validator.w3.org/feed/docs/rss2.html#optionalChannelElements
   */
  if (options.copyright) {
    base.rss.channel.copyright = { _text: options.copyright };
  }

  /**
   * Channel Categories
   * https://validator.w3.org/feed/docs/rss2.html#comments
   */
  ins.categories.map((category) => {
    if (!base.rss.channel.category) {
      base.rss.channel.category = [];
    }
    base.rss.channel.category.push({ _text: category });
  });

  /**
   * Feed URL
   * http://validator.w3.org/feed/docs/warning/MissingAtomSelfLink.html
   */
  const atomLink = options.feed || (options.feedLinks && options.feedLinks.rss);
  if (atomLink) {
    isAtom = true;
    base.rss.channel["atom:link"] = [
      {
        _attributes: {
          href: sanitize(atomLink),
          rel: "self",
          type: "application/rss+xml",
        },
      },
    ];
  }

  /**
   * Hub for PubSubHubbub
   * https://code.google.com/p/pubsubhubbub/
   */
  if (options.hub) {
    isAtom = true;
    if (!base.rss.channel["atom:link"]) {
      base.rss.channel["atom:link"] = [];
    }
    base.rss.channel["atom:link"] = {
      _attributes: {
        href: sanitize(options.hub),
        rel: "hub",
      },
    };
  }

  /**
   * Channel Categories
   * https://validator.w3.org/feed/docs/rss2.html#hrelementsOfLtitemgt
   */
  base.rss.channel.item = [];

  ins.items.map((entry: Item) => {
    const item: any = {};

    if (entry.title) {
      item.title = { _cdata: entry.title };
    }

    if (entry.link) {
      item.link = { _text: sanitize(entry.link) };
    }

    if (entry.guid) {
      item.guid = { _text: entry.guid };
    } else if (entry.id) {
      item.guid = { _text: entry.id };
    } else if (entry.link) {
      item.guid = { _text: sanitize(entry.link) };
    }

    if (entry.date) {
      item.pubDate = { _text: entry.date.toUTCString() };
    }

    if (entry.published) {
      item.pubDate = { _text: entry.published.toUTCString() };
    }

    if (entry.description) {
      item.description = { _cdata: entry.description };
    }

    if (entry.content) {
      isContent = true;
      item["content:encoded"] = { _cdata: entry.content };
    }
    /**
     * Item Author
     * https://validator.w3.org/feed/docs/rss2.html#ltauthorgtSubelementOfLtitemgt
     */
    if (Array.isArray(entry.author)) {
      item.author = [];
      entry.author.map((author: Author) => {
        if (author.email && author.name) {
          item.author.push({ _text: author.email + " (" + author.name + ")" });
        }
      });
    }
    /**
     * Item Category
     * https://validator.w3.org/feed/docs/rss2.html#ltcategorygtSubelementOfLtitemgt
     */
    if (Array.isArray(entry.category)) {
      item.category = [];
      entry.category.map((category: Category) => {
        item.category.push(formatCategory(category));
      });
    }

    /**
     * Item Enclosure
     * https://validator.w3.org/feed/docs/rss2.html#ltenclosuregtSubelementOfLtitemgt
     */
    if (entry.enclosure) {
      item.enclosure = formatEnclosure(entry.enclosure);
    }

    if (entry.image) {
      item.enclosure = formatEnclosure(entry.image, "image");
    }

    if (entry.audio) {
      let duration = undefined;
      if (options.podcast && typeof entry.audio !== "string" && entry.audio.duration) {
        duration = entry.audio.duration;
        entry.audio.duration = undefined;
      }
      item.enclosure = formatEnclosure(entry.audio, "audio");

      if (duration) {
        item["itunes:duration"] = formatDuration(duration);
      }
    }

    if (entry.video) {
      item.enclosure = formatEnclosure(entry.video, "video");
    }

    if (entry.extensions) {
      entry.extensions.forEach((extension: Extension) => {
        item[extension.name] = extension.objects;
      });
    }

    base.rss.channel.item.push(item);
  });

  if (isContent) {
    base.rss._attributes["xmlns:dc"] = "http://purl.org/dc/elements/1.1/";
    base.rss._attributes["xmlns:content"] = "http://purl.org/rss/1.0/modules/content/";
  }

  // rss2() support `extensions`
  if (extensions)
    extensions.map((e: Extension) => {
      base.rss.channel[e.name] = e.objects;
    });

  if (isAtom) {
    base.rss._attributes["xmlns:atom"] = "http://www.w3.org/2005/Atom";
  }

  /**
   * Podcast extensions
   * https://support.google.com/podcast-publishers/answer/9889544?hl=en
   */
  if (options.podcast) {
    base.rss._attributes["xmlns:googleplay"] = "http://www.google.com/schemas/play-podcasts/1.0";
    base.rss._attributes["xmlns:itunes"] = "http://www.itunes.com/dtds/podcast-1.0.dtd";
    if (options.category) {
      base.rss.channel["googleplay:category"] = options.category;
      base.rss.channel["itunes:category"] = options.category;
    }
    if (options.author?.email) {
      base.rss.channel["googleplay:owner"] = options.author.email;
      base.rss.channel["itunes:owner"] = {
        "itunes:email": options.author.email,
      };
    }
    if (options.author?.name) {
      base.rss.channel["googleplay:author"] = options.author.name;
      base.rss.channel["itunes:author"] = options.author.name;
    }
    if (options.image) {
      base.rss.channel["googleplay:image"] = {
        _attributes: { href: sanitize(options.image) },
      };
    }
  }

  return convert.js2xml(base, { compact: true, ignoreComment: true, spaces: 4 });
};

/**
 * Returns a formated enclosure
 * @param enclosure
 * @param mimeCategory
 */
const formatEnclosure = (enclosure: string | Enclosure, mimeCategory = "image") => {
  if (typeof enclosure === "string") {
    const type = new URL(sanitize(enclosure)!).pathname.split(".").slice(-1)[0];
    return { _attributes: { url: enclosure, length: 0, type: `${mimeCategory}/${type}` } };
  }

  const type = new URL(sanitize(enclosure.url)!).pathname.split(".").slice(-1)[0];
  return { _attributes: { length: 0, type: `${mimeCategory}/${type}`, ...enclosure } };
};

/**
 * Returns a formated category
 * @param category
 */
const formatCategory = (category: Category) => {
  const { name, domain } = category;
  return {
    _text: name,
    _attributes: {
      domain,
    },
  };
};

/**
 * Returns a formated duration from seconds
 * @param duration
 */
const formatDuration = (duration: number) => {
  const seconds = duration % 60;
  const totalMinutes = Math.floor(duration / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const notHours = ("0" + minutes).substr(-2) + ":" + ("0" + seconds).substr(-2);
  return hours > 0 ? hours + ":" + notHours : notHours;
};
