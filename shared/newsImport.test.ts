import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToBody, imageInfo, legacySummary, parseExport } from './newsImport';

describe('htmlToBody', () => {
  it('turns intranet HTML into the post format', () => {
    const html =
      '<h2>Welcome <strong>Anna</strong></h2><p>Hello&nbsp;team,<br>see <a href="https://nutripartners.co/products">our products</a>.</p>' +
      '<ul><li><b>Fast:</b> one click</li><li>Safe</li></ul><hr><p><em>Thanks!</em> &amp; bye</p>';
    expect(htmlToBody(html)).toBe(
      '## Welcome **Anna**\n\nHello team,\nsee [our products](https://nutripartners.co/products).\n\n- **Fast:** one click\n- Safe\n\n---\n\n_Thanks!_ & bye',
    );
  });

  it('drops scripts, unsafe links and other tags', () => {
    expect(htmlToBody('<script>alert(1)</script><p onclick="x">Hi <a href="javascript:alert(1)">there</a><img src=x></p>')).toBe('Hi there');
  });

  it('keeps marks valid when spaces are inside them', () => {
    expect(htmlToBody('<b>Bold </b>text<b> </b>end')).toBe('**Bold** text end');
  });

  it('keeps plain text with line breaks', () => {
    expect(htmlToBody('Line one<br><br>Line two<br>• item')).toBe('Line one\n\nLine two\n• item');
  });
});

describe('decodeEntities and legacySummary', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('&lt;a&gt; &#39;x&#x27; &quot;')).toBe(`<a> 'x' "`);
  });

  it('cleans the summary', () => {
    expect(legacySummary({ _id: '1', shortDescription: ' <b>Hi</b>\n there ' })).toBe('Hi there');
  });
});

describe('parseExport', () => {
  it('accepts the n8n export and rejects anything else', () => {
    const data = { articles: [{ _id: 'a1', title: 'T' }], comments: [{ _id: 'c1', articleId: 'a1' }, { nope: 1 }], users: [{ id: 'u1', email: 'a@b.co', name: 'A' }] };
    expect(parseExport(data)).toEqual({ articles: data.articles, comments: [data.comments[0]], users: data.users });
    expect(parseExport({ articles: [{ title: 'no id' }] })).toBeNull();
    expect(parseExport('x')).toBeNull();
  });
});

describe('imageInfo', () => {
  it('reads PNG and JPEG sizes', () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 1200);
    new DataView(png.buffer).setUint32(20, 630);
    expect(imageInfo(png)).toEqual({ type: 'image/png', width: 1200, height: 630 });

    // SOI, an APP0 segment of 16 bytes, then SOF0 with height 480 and width 640.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0, 0, 0, 0]);
    expect(imageInfo(jpeg)).toEqual({ type: 'image/jpeg', width: 640, height: 480 });
  });

  it('rejects other files', () => {
    expect(imageInfo(new TextEncoder().encode('GIF89a and some more bytes here....'))).toBeNull();
  });
});
