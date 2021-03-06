'use strict';

const cheerio = require('cheerio');
const libingester = require('./index');
const rp = require('request-promise');
const url = require('url');

const USER_AGENT = 'libingester';

function fetch_html(uri) {
    uri = encode_uri(uri);

    return rp({
        uri: uri,
        headers: {
            'User-Agent': USER_AGENT,
        },
    }).then((res) => {
        return cheerio.load(res);
    });
}

exports.fetch_html = fetch_html;

function get_doc_base_uri(doc, base_uri) {
    const $ = cheerio(doc);
    const $base = $.find('base[href]');
    if ($base.length)
        return $base.attr('href');

    return base_uri;
}

exports.get_doc_base_uri = get_doc_base_uri;

function get_img_src($img, base_uri) {
    const src = $img.attr('src');
    if (src)
        return url.resolve(base_uri, src);

    const srcset = $img.attr('srcset');
    if (srcset) {
        const first_decl = srcset.split(',')[0];
        const first_uri = first_decl.split(/\s+/)[0];
        return url.resolve(base_uri, first_uri);
    }

    const data_src = $img.attr('data-src');
    if (data_src)
        return url.resolve(base_uri, data_src);

    throw new Error("Could not parse img tag's src");
}

function download_image(uri) {
    uri = encode_uri(uri);

    const asset = new libingester.ImageAsset();
    asset.set_canonical_uri(uri);
    asset.set_last_modified_date(new Date());

    const promise = rp({
        uri: uri,
        encoding: null,
        headers: {
            'User-Agent': USER_AGENT,
        },
        resolveWithFullResponse: true,
    }).then((response) => {
        asset.set_image_data(response.headers['content-type'], response.body);
    });

    asset.set_image_data(undefined, promise);
    return asset;
}

exports.download_image = download_image;

function download_img(img, base_uri) {
    const $img = cheerio(img);

    if ($img.attr('data-libingester-asset-id'))
        throw new Error("img already has associated ImageAsset");

    const src = get_img_src($img, base_uri);

    // Knock these out.
    $img.attr('src', null);
    $img.attr('srcset', null);

    const asset = download_image(src);
    $img.attr('data-libingester-asset-id', asset.asset_id);
    return asset;
}

exports.download_img = download_img;

function encode_uri(uri) {
    const SAFE_CHARS = (
        // RFC 3986 gen-delims
        ':/?#[]@' +
        // RFC 3986 sub-delims
        '!$&\'()*+,;=' +
        // RFC 3986 section 2.3 Unreserved
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
        'abcdefghijklmnopqrstuvwxyz' +
        '0123456789' +
        '_.-' +
        // non-standard: don't re-percent-encode characters.
        '%'
    );

    // Node's URL parser normalizes the URL and parses e.g.
    // IDN hostnames into their Punycode representation.
    const parsed = url.format(url.parse(uri));

    // Go through and escape the URI.
    return parsed.split('').map((c) => {
        if (SAFE_CHARS.indexOf(c) >= 0) {
            return c;
        } else {
            // Encode the code-point into UTF-8.
            const buf = Buffer.from(c, 'utf8');
            let pct = '';
            buf.forEach((n) => {
                pct += `%${n.toString(16).toUpperCase()}`;
            });
            return pct;
        }
    }).join('');
}

exports.encode_uri = encode_uri;
