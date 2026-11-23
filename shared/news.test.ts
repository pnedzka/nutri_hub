import { describe, expect, it } from 'vitest';
import { blocks, excerpt, inline, paragraphs, parseImages, plainText, segments } from './news';

const id = '0b6f4b7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const other = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('parseImages', () => {
  it('accepts paths the server issued', () => {
    expect(parseImages([{ path: `news/${id}/${other}.jpg`, width: 1200, height: 800 }])).toEqual([{ path: `news/${id}/${other}.jpg`, width: 1200, height: 800 }]);
    expect(parseImages([])).toEqual([]);
  });

  it('rejects other paths, bad sizes and duplicates', () => {
    expect(parseImages([{ path: `../secret/${id}.jpg`, width: 1, height: 1 }])).toBeNull();
    expect(parseImages([{ path: `news/${id}/${other}.gif`, width: 1, height: 1 }])).toBeNull();
    expect(parseImages([{ path: `news/${id}/${other}.jpg`, width: 0, height: 1 }])).toBeNull();
    const image = { path: `news/${id}/${other}.jpg`, width: 1, height: 1 };
    expect(parseImages([image, image])).toBeNull();
    expect(parseImages('x')).toBeNull();
  });
});

describe('excerpt', () => {
  it('keeps short text and cuts long text at a word', () => {
    expect(excerpt('Hello\n\nworld')).toBe('Hello world');
    expect(excerpt('Our summer party was a great success, thank you all', 30)).toBe('Our summer party was a great…');
  });
});

describe('segments and paragraphs', () => {
  it('finds links without trailing punctuation', () => {
    expect(segments('See https://nutripartners.co/news, thanks.')).toEqual([
      { text: 'See ' },
      { url: 'https://nutripartners.co/news' },
      { text: ', thanks.' },
    ]);
  });

  it('splits paragraphs at blank lines and keeps line breaks', () => {
    expect(paragraphs('First line\nsecond line\n\n\nNext paragraph')).toEqual([
      [[{ text: 'First line' }], [{ text: 'second line' }]],
      [[{ text: 'Next paragraph' }]],
    ]);
  });

  it('never produces HTML', () => {
    expect(paragraphs('<script>alert(1)</script>')).toEqual([[[{ text: '<script>alert(1)</script>' }]]]);
  });
});

describe('formatting of posts', () => {
  it('reads bold, italic and links on a line', () => {
    expect(inline('A **bold** and _italic_ word, [our site](https://nutripartners.co) or https://x.co/a_b.')).toEqual([
      { text: 'A ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'italic', italic: true },
      { text: ' word, ' },
      { url: 'https://nutripartners.co', label: 'our site' },
      { text: ' or ' },
      { url: 'https://x.co/a_b', label: 'https://x.co/a_b' },
      { text: '.' },
    ]);
  });

  it('leaves unclosed marks and snake_case alone', () => {
    expect(inline('2 ** 3 and file_name_here')).toEqual([{ text: '2 ** 3 and file_name_here' }]);
  });

  it('splits the body into headings, lists, rules and paragraphs', () => {
    expect(blocks('## Hello\nFirst line\nsecond line\n\n- one\n* two\n---\nEnd')).toEqual([
      { type: 'heading', level: 2, content: [{ text: 'Hello' }] },
      { type: 'paragraph', lines: [[{ text: 'First line' }], [{ text: 'second line' }]] },
      { type: 'list', items: [[{ text: 'one' }], [{ text: 'two' }]] },
      { type: 'rule' },
      { type: 'paragraph', lines: [[{ text: 'End' }]] },
    ]);
    expect(blocks('### Small')).toEqual([{ type: 'heading', level: 3, content: [{ text: 'Small' }] }]);
  });

  it('never produces HTML and strips marks for excerpts', () => {
    expect(blocks('<b>x</b>')).toEqual([{ type: 'paragraph', lines: [[{ text: '<b>x</b>' }]] }]);
    expect(plainText('## Title\n\nSome **bold** [link](https://a.co)\n- item')).toBe('Title\n\nSome bold link\n\nitem');
    expect(excerpt('## Big news\n\n**Hello** everyone')).toBe('Big news Hello everyone');
  });
});
